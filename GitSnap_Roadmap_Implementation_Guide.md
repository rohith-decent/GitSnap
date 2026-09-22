# GitSnap — Feature Roadmap Implementation Guide

This document picks up **exactly where your current codebase is** (verified against the actual repo — `extension.ts`, `git/index.ts`, `ai/index.ts`, `secrets.ts`, `webview/panel.ts`, `App.svelte`) and walks through everything needed to reach the full vision described in your project context: branch dashboard, AI-optional toggle, edit-before-commit, NL Git interface, advanced toolkit, team features, and a custom extension icon.

Every phase explains **what to build, where, why it fits the architecture, and how it respects the non-negotiable constraints** (dual-runtime separation, AI-optional core, friendly error handling, SecretStorage-only secrets).

---

## Part 0 — Honest Assessment of Where You Are Right Now

Before adding anything new, it's worth being precise about the current state, because two of your stated principles are **not yet true in the code** and need to be fixed first — everything else builds on top of them:

| Principle from your context doc | Actual current code | Gap |
|---|---|---|
| "Zero AI in core paths... works with `gitsnap.ai.enabled: false`" | There is no `gitsnap.ai.enabled` setting anywhere. `runAiCommitAndPush` in `extension.ts` calls `ai.generateCommitMessage(...)` unconditionally — if it fails, the *entire* stage→commit→push pipeline throws and aborts. | AI is currently a hard dependency of the only commit flow that exists. |
| "Provider-agnostic routing: Groq, OpenAI, Anthropic, or local Ollama/Tabby" | `src/extension/ai/index.ts` imports `Groq from 'groq-sdk'` directly and instantiates `new Groq({ apiKey })`. There is no provider abstraction. | Only Groq (and Groq-compatible OpenAI-style endpoints) can work at all right now. |
| "AI calls... never cache sensitive code diffs beyond the current session" | True today by omission (nothing is cached), but there's no explicit session-scope guarantee once a dashboard/NL-interface with history is added. | Needs to become an explicit rule once features 5 and 7 (NL history, prompt presets) are built. |

**Why fix these first, before building the dashboard or NL interface:** every new feature you add (branch dashboard's AI branch intelligence, edit-before-commit's `💡 AI Suggest`, the NL interface) will need to call into the *same* AI layer and respect the *same* toggle. If you build the toggle and provider abstraction now, every feature after this inherits it for free. If you build features first and retrofit the toggle later, you'll be hunting down every AI call site individually.

So **Phase 1 and Phase 2 below are prerequisites**, not optional cleanup — start there.

---

## Phase 1 — The AI-Optional Settings Toggle (Foundational)

**Goal:** A single, real VS Code setting that every AI-touching code path checks before doing anything AI-related.

### Step 1.1 — Declare the setting in `package.json`

Add a `configuration` contribution point (this doesn't exist yet in your manifest):

```json
"contributes": {
  "configuration": {
    "title": "GitSnap",
    "properties": {
      "gitsnap.ai.enabled": {
        "type": "boolean",
        "default": true,
        "description": "Enable AI-powered features (commit message generation, branch intelligence, natural language commands). When disabled, GitSnap works as a pure Git tool."
      },
      "gitsnap.ai.provider": {
        "type": "string",
        "enum": ["groq", "openai", "anthropic", "ollama", "tabby"],
        "default": "groq",
        "description": "Which AI provider to use for AI-powered features."
      }
    }
  }
}
```

**Why this goes in `settings.json`-backed configuration and not `SecretStorage`:** `gitsnap.ai.enabled` and `gitsnap.ai.provider` aren't secrets — they're preferences. Putting them in `contributes.configuration` means they show up in the normal VS Code Settings UI (searchable, toggleable, syncable via Settings Sync), and — importantly for your "Team Collaboration" feature later — they can be committed to a workspace's `.vscode/settings.json` so a whole team shares the same provider choice. Only the *API key* stays in `SecretStorage`.

### Step 1.2 — Create a single `isAiEnabled()` gate function

New file: `src/extension/ai/config.ts`

```ts
import * as vscode from 'vscode';

export function isAiEnabled(): boolean {
  return vscode.workspace.getConfiguration('gitsnap').get<boolean>('ai.enabled', true);
}

export function getConfiguredProvider(): string {
  return vscode.workspace.getConfiguration('gitsnap').get<string>('ai.provider', 'groq');
}
```

**Why a dedicated function instead of calling `vscode.workspace.getConfiguration()` inline everywhere:** Every future call site (dashboard, edit-before-commit modal, NL bar) needs to ask the *same* question the *same* way. A single gate function means if you ever change how "enabled" is determined (e.g. also require a valid API key to count as "enabled"), you change it in one place.

### Step 1.3 — Make `runAiCommitAndPush` degrade gracefully

Modify `extension.ts`'s pipeline (conceptually — you'll write the real diff yourselves file-by-file later):

```ts
progress.report({ message: 'Generating commit message...' });

let commitMessage: string;
if (isAiEnabled()) {
  try {
    const apiKey = await secrets.getApiKey(context);
    const model = await secrets.getModel(context);
    commitMessage = await ai.generateCommitMessage(diff, apiKey || '', model);
  } catch {
    // AI failed — don't abort the whole pipeline, fall back to manual input
    commitMessage = await vscode.window.showInputBox({
      prompt: 'AI commit message failed — enter one manually',
      placeHolder: 'feat: describe your change',
    }) ?? 'chore: update code';
  }
} else {
  commitMessage = await vscode.window.showInputBox({
    prompt: 'Enter a commit message',
    placeHolder: 'feat: describe your change',
  }) ?? 'chore: update code';
}
```

**Why this exact fallback shape matters:** This is the literal implementation of "Graceful degradation: If AI fails/times out, UI falls back to manual input without blocking operations." Notice the AI failure path and the AI-disabled path converge on the *same* manual input box — meaning you only need to build and test one fallback UI, not two.

**Testing this phase:** In Vitest, mock `isAiEnabled()` to return `false` and assert `ai.generateCommitMessage` is never called. Then mock it to return `true` but make `ai.generateCommitMessage` reject, and assert the pipeline still completes via the fallback path instead of throwing.

---

## Phase 2 — Provider-Agnostic AI Module (BYOK: Groq / OpenAI / Anthropic / Ollama / Tabby)

**Goal:** Replace the current hard dependency on `groq-sdk` with a small internal interface that any provider can implement, so the "Provider-agnostic routing" and "Local AI options are first-class citizens" principles become real.

### Step 2.1 — Define a provider interface

New file: `src/extension/ai/provider.ts`

```ts
export interface AiProvider {
  generateCompletion(systemPrompt: string, userPrompt: string, model: string): Promise<string>;
}
```

**Why one narrow method, not a full chat interface:** GitSnap only ever needs "system prompt + user prompt in, one string out" for every current and planned AI feature (commit messages, branch intelligence, PR descriptions, NL command translation). Keeping the interface minimal means adding a new provider later is a small, mechanical task — implement one function, not a whole SDK-shaped abstraction.

### Step 2.2 — Implement one adapter per provider

New files under `src/extension/ai/providers/`:
- `groq.ts` — wraps your *existing* `groq-sdk` logic (move the current `client.chat.completions.create(...)` call here unchanged).
- `openai.ts` — same shape, using OpenAI's SDK or a plain `fetch` to `api.openai.com/v1/chat/completions`.
- `anthropic.ts` — same shape, using Anthropic's Messages API.
- `ollama.ts` — `fetch` to `http://localhost:11434/api/chat` (no API key required — this is the local-first path).
- `tabby.ts` — `fetch` to a locally-configured Tabby server endpoint.

**Why Ollama/Tabby adapters look different internally (no API key, local URL) but must satisfy the same `AiProvider` interface:** This is the entire point of the interface — the rest of GitSnap (commit generation, branch intelligence, NL translation) should never need to know or care whether it's talking to a cloud API with a bearer token or a `localhost` server with none. That's what "first-class citizens, not afterthoughts" means concretely: no `if (provider === 'ollama') { /* special-cased skip-auth logic scattered everywhere */ }` littered through feature code.

### Step 2.3 — A factory that picks the right adapter

New file: `src/extension/ai/index.ts` (refactor of your current file):

```ts
import { getConfiguredProvider } from './config';
import { GroqProvider } from './providers/groq';
import { OpenAiProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { TabbyProvider } from './providers/tabby';
import { SYSTEM_PROMPT } from './prompts';
import { truncateDiff, cleanCommitMessage } from './text';

function getProvider(apiKey: string): AiProvider {
  switch (getConfiguredProvider()) {
    case 'openai': return new OpenAiProvider(apiKey);
    case 'anthropic': return new AnthropicProvider(apiKey);
    case 'ollama': return new OllamaProvider();
    case 'tabby': return new TabbyProvider();
    case 'groq':
    default: return new GroqProvider(apiKey);
  }
}

export async function generateCommitMessage(diff: string, apiKey: string, model: string): Promise<string> {
  // ... existing validation + truncateDiff() logic stays exactly as-is ...
  const provider = getProvider(apiKey);
  const raw = await provider.generateCompletion(SYSTEM_PROMPT, `Generate a commit message for this diff:\n\n${truncatedDiff}`, model);
  return cleanCommitMessage(raw);
}
```

**Why keep `truncateDiff()` and `cleanCommitMessage()` outside the provider adapters, in a shared module:** These are provider-*independent* concerns — every provider gets a diff that might be too long, and every provider's raw text output might come back wrapped in markdown/quotes. Duplicating that logic inside five separate adapter files would mean five places to fix a bug instead of one. (Pull them into a new `src/extension/ai/text.ts` file, unchanged from your current implementation.)

**Testing this phase:** Your existing `ai/index.test.ts` mocked `groq-sdk` directly — after this refactor, mock the `AiProvider` interface instead (a plain object with a `generateCompletion` jest/vitest mock function), and add one new test per adapter file confirming it calls the right endpoint shape. This decouples your commit-message logic tests from any specific SDK.

---

## Phase 3 — Branch Management Dashboard (Webview UI) `[AI: None]`

**Goal:** A second webview panel — pure Git, no AI dependency — showing all branches with metadata and one-click actions.

### Step 3.1 — Extend the Git module with read-only branch queries

Add to `src/extension/git/index.ts` (new exported functions, nothing existing changes):

```ts
export interface BranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  ahead: number;
  behind: number;
  lastCommitDate: string;
  lastCommitAuthor: string;
}

export async function listBranches(): Promise<BranchInfo[]> {
  const git = getGit();
  const summary = await git.branch(['-vv']); // verbose: shows tracking info
  // map simple-git's BranchSummary into BranchInfo[], computing ahead/behind
  // via git.raw(['rev-list', '--left-right', '--count', `${name}...origin/${name}`])
  ...
}
```

**Why `git branch -vv` and not just `git branch`:** The `-vv` flag includes each branch's upstream tracking reference and ahead/behind counts in the raw output, which `simple-git`'s `BranchSummary` type partially parses — this is the actual data source for the dashboard's `⚠️ Stale`, `🔄 Diverged` indicators, no AI needed for the *raw numbers*, only for the *human-readable suggestion text* (that's Phase 5).

Add corresponding action functions: `switchBranch(name)` (wraps `git.checkout(name)`), `createBranch(name, from?)` (wraps `git.checkoutLocalBranch` or `git.branch`), `deleteBranch(name, force?)` (wraps `git.deleteLocalBranch`), `fetchAll()` (wraps `git.fetch()`), `setUpstream(name, remote)`.

**Why each of these gets its own small wrapper function instead of one generic "runGitCommand(args)" escape hatch:** A generic passthrough would violate the whole reason `git/index.ts` exists — every command needs its *own* friendly-error translation (e.g. `deleteBranch` failing because the branch is unmerged needs a different message than `switchBranch` failing because of uncommitted local changes). One function per operation keeps each one's error handling precise and testable in isolation, exactly like your existing `push()`/`commit()` pattern.

### Step 3.2 — New message contract for the dashboard

Extend `src/types/webviewMessages.ts` — **don't replace the existing settings messages, add a new discriminated branch of the union:**

```ts
export type WebviewToExtensionMessage =
  | { type: 'requestSettings' }
  | { type: 'saveApiKey'; payload: string }
  | { type: 'saveModel'; payload: string }
  // new:
  | { type: 'requestBranches' }
  | { type: 'switchBranch'; payload: { name: string } }
  | { type: 'createBranch'; payload: { name: string; from?: string } }
  | { type: 'deleteBranch'; payload: { name: string; force: boolean } }
  | { type: 'fetchBranches' };

export type ExtensionToWebviewMessage =
  | { type: 'settingsLoaded'; payload: { apiKey?: string; model?: string } }
  // new:
  | { type: 'branchesLoaded'; payload: { branches: BranchInfo[] } }
  | { type: 'branchActionComplete'; payload: { success: boolean; message: string } };
```

**Why extend the same union file instead of creating a second, separate message-types file for the dashboard:** A second file would mean two independent `onDidReceiveMessage` handlers with two independent nonces/CSPs to maintain, and it would break the "one typed contract" guarantee — TypeScript can no longer catch you sending a dashboard message type to the settings panel's listener by mistake. One growing union, one source of truth.

### Step 3.3 — New Svelte component + new panel

New file: `src/webview/BranchDashboard.svelte` (parallel structure to `App.svelte` — `$state` for the branch list, `$effect` to request data on mount and listen for `branchesLoaded`).

New file: `src/extension/webview/branchPanel.ts` (near-identical structure to your existing `panel.ts` — same nonce/CSP pattern, same `localResourceRoots` pattern, but pointing its script tag at a *second* Vite entry point).

**Why this needs a second Vite entry point, not reusing `main.js`:** Right now `vite.config.ts`'s webview build has a single `rollupOptions.input: 'src/webview/main.ts'`. To ship two separate webview panels (Settings and Branch Dashboard) as two separate bundles — so opening one doesn't load the other's code — `input` needs to become an object: `{ main: 'src/webview/main.ts', dashboard: 'src/webview/dashboard-main.ts' }`, and `branchPanel.ts` references `assets/dashboard.js` instead of `assets/main.js`. (You *could* mount both Svelte components into one bundle behind a router, but two small bundles is simpler here and keeps the "Settings" panel loading instantly without dragging in Branch Dashboard code it doesn't need.)

Register the new command in `package.json`:
```json
{ "command": "gitsnap.openBranchDashboard", "title": "GitSnap: Branch Dashboard", "icon": "$(git-branch)" }
```
and wire it in `extension.ts` exactly like `openSettingsCmd` is wired today.

**Checkpoint:** Open the dashboard with zero AI configured/enabled — every branch should list correctly with ahead/behind counts, and switch/create/delete/fetch should all work. This is your proof that Phase 3 truly has `[AI: None]`.

---

## Phase 4 — Global Keyboard Shortcuts & Quick Actions `[AI: None]`

**Goal:** Fast keyboard access to the commands you already have (and the new dashboard command).

### Step 4.1 — Declare keybindings in `package.json`

```json
"contributes": {
  "keybindings": [
    { "command": "gitsnap.openCommitEditor", "key": "ctrl+alt+g c", "mac": "cmd+alt+g c" },
    { "command": "gitsnap.openBranchDashboard", "key": "ctrl+alt+g b", "mac": "cmd+alt+g b" },
    { "command": "gitsnap.openStashManager", "key": "ctrl+alt+g s", "mac": "cmd+alt+g s" },
    { "command": "gitsnap.undoLastCommit", "key": "ctrl+alt+g u", "mac": "cmd+alt+g u" }
  ]
}
```

**Why declare these in the manifest instead of registering them programmatically in `activate()`:** VS Code's `contributes.keybindings` is the *discoverable* mechanism — it's what makes these shortcuts show up in the Keyboard Shortcuts settings UI (searchable, remappable by the user via `keybindings.json` as your context doc requires) "for free." Registering key bindings imperatively in code isn't actually possible in the VS Code API at all — keybindings are always manifest-declared and just *point at* commands you register in code, which you're already doing.

**Why chord syntax (`ctrl+alt+g c`, two key presses) instead of four separate single-chord bindings:** A chord namespace (`Ctrl+Alt+G` as a prefix) avoids colliding with other extensions' or VS Code's own single-key shortcuts, and it's the same UX pattern VS Code itself uses for things like `Ctrl+K Ctrl+S` (keyboard shortcuts) — familiar and low-collision-risk for a Git-focused tool.

### Step 4.2 — `gitsnap.undoLastCommit` needs actual logic

This is the one shortcut in the list that isn't just "open a panel" — add to `git/index.ts`:
```ts
export async function undoLastCommit(): Promise<void> {
  const git = getGit();
  await git.reset(['--soft', 'HEAD~1']); // soft reset: keeps changes staged, just uncommits
}
```

**Why `--soft` specifically, not `--mixed` or `--hard`:** "Undo Last Commit" as described in your context is meant to be a safe, reversible convenience action — `--soft` uncommits but leaves all changes staged exactly as they were, so the user can immediately re-edit and re-commit. `--hard` would destroy the actual code changes, which is a completely different (and dangerous) operation that should never be one keystroke away without confirmation.

**Checkpoint:** All four shortcuts work with zero AI configured — same `[AI: None]` verification as Phase 3.

---

## Phase 5 — Edit-Before-Commit Flow `[AI: Optional]`

**Goal:** Replace the current "AI silently picks the message and commits immediately" flow with a modal the user reviews *before* anything is committed.

### Step 5.1 — Recognize the architectural shift this requires

Right now, `runAiCommitAndPush` in `extension.ts` does stage → diff → AI → **commit** → **push**, all inside one `withProgress` block with no pause for user review. Edit-Before-Commit means **splitting this into two separate user-facing steps**:
1. Stage + diff + (optionally) AI-suggest → show a modal/panel with the message pre-filled and editable.
2. Only on the user clicking "Commit & Push" inside that modal does the actual `git.commit()` + `git.push()` fire.

**Why this can't just be a tweak to the existing progress notification:** `vscode.window.withProgress` notifications are non-interactive status text — there's no way to embed an editable text box or a diff viewer inside one. This flow needs a real webview panel (like Settings and the Dashboard), because it needs rich, interactive UI: a diff preview pane and an editable text box side by side.

### Step 5.2 — Build the Commit Editor panel

New Svelte component `src/webview/CommitEditor.svelte`:
- Left panel: renders the staged diff with syntax highlighting (a lightweight approach: render as a `<pre>` block with basic `+`/`-` line coloring done in plain CSS by checking each line's first character — no need for a full diff-highlighting library for a first version).
- Right panel: a `<textarea>` bound with `bind:value` (Svelte 5 runes still support `bind:` the same way) holding the commit message, pre-filled by AI *if* `gitsnap.ai.enabled` is true, empty otherwise.
- A `💡 AI Suggest` button that's simply **hidden entirely** (not just disabled) when AI is off — `{#if aiEnabled}<button onclick={requestSuggestion}>💡 AI Suggest</button>{/if}`.
- Live conventional-commit format validation (a small regex check against `^(feat|fix|docs|style|refactor|perf|test|chore)(\(.+\))?: .+`) shown as a warning, **not a blocker** — per your spec, it "warns... but allows override."
- `Commit & Push` button, disabled until the message field is non-empty.

**Why the AI Suggest button must be hidden, not just grayed out, when AI is disabled:** This is a direct, literal reading of your "AI-Optional by Design" principle — a disabled-but-visible button implies AI is a broken feature the user is missing out on. A hidden button correctly communicates "this is a pure Git tool right now," matching the promise that GitSnap "works 100% without AI."

### Step 5.3 — Wire it into the pipeline

`extension.ts`'s `gitsnap.aiCommitAndPush` command changes from "always auto-commit" to "open the Commit Editor with a pre-fetched diff (and AI suggestion if enabled), then wait for the panel to send back a `{ type: 'confirmCommit', payload: { message } }` message before actually calling `git.commit()`/`git.push()`."

**Why keep the *old* fully-automatic flow available too, rather than replacing it outright:** Your target users include "seniors who want speed" — forcing every single commit through a review modal contradicts that use case. The cleanest approach: keep `gitsnap.aiCommitAndPush` (⚡ button) as the fast, no-review path, and add a **second** command, `gitsnap.openCommitEditor` (the one already bound to `Ctrl+Alt+G C` in Phase 4), as the reviewed path. Same underlying stage/diff/AI/commit/push building blocks, two different user entry points — this is exactly why keeping `git/` and `ai/` as small composable functions (rather than one monolithic pipeline function) pays off now.

**Testing this phase:** Test the format-validation regex directly in Vitest (pure function, no VS Code or webview needed) — feed it valid and invalid conventional-commit strings and assert warn/no-warn.

---

## Phase 6 — AI-Powered Branch Intelligence `[AI: Optional]`

**Goal:** Layer human-readable suggestions on top of the raw branch data Phase 3 already computes.

### Step 6.1 — A dedicated prompt + function, separate from commit-message generation

New addition to `src/extension/ai/prompts.ts`:
```ts
export const BRANCH_INSIGHT_PROMPT = `You are a Git branch health advisor. Given a branch's ahead/behind counts and last-activity date, respond with ONE short, actionable sentence (under 100 characters). No markdown.`;
```

New function in `ai/index.ts`:
```ts
export async function generateBranchInsight(branch: BranchInfo, apiKey: string, model: string): Promise<string | null> {
  if (!isAiEnabled()) return null;
  try {
    // same provider factory + generateCompletion pattern as generateCommitMessage
  } catch {
    return null; // silent failure — dashboard just shows raw metadata instead
  }
}
```

**Why this returns `null` on failure instead of throwing:** This is the concrete difference between an *optional* AI feature and the *required* one you have today. `generateCommitMessage` throwing is currently caught by the whole pipeline (Phase 1 fixes that too) — but `generateBranchInsight` should never be allowed to make the *entire dashboard* show an error toast just because one branch's AI summary call timed out. The dashboard UI, per your spec, must "hide gracefully when AI is disabled" and by extension when AI simply fails.

### Step 6.2 — Compute the deterministic badges without any AI at all

The `⚠️ Stale (>30d)`, `🔄 Diverged`, `✅ Ready to Merge` badges themselves are **pure math on the `BranchInfo` data from Phase 3** — stale = `(Date.now() - lastCommitDate) > 30 days`, diverged = `ahead > 0 && behind > 0`, ready-to-merge = `ahead > 0 && behind === 0`. Compute these in `git/index.ts` or a small pure helper, entirely without AI.

**Why this split matters architecturally:** The *badges* (deterministic, always available) and the *one-sentence suggestion text* (AI, optional) are two different pieces of UI that happen to sit next to each other. Keeping their computation in two separate functions — one pure/synchronous, one async/AI — is what makes "falls back to raw Git metadata" (your spec's exact words) trivially true: the badges never depend on the AI call succeeding at all.

---

## Phase 7 — Natural Language Git Interface `[AI: Optional]`

**Goal:** A text input where the user types intent in English, GitSnap shows the *exact* git command(s) it will run, and only executes on confirmation.

### Step 7.1 — This is a translation problem, not an execution problem

The critical design decision: **the AI's only job is text-in → git-command-plan-out.** It must never be given permission to execute anything itself. This is what makes "shows preview, executes on confirm" both a UX nicety and a safety boundary.

```ts
export const NL_TRANSLATION_PROMPT = `You translate plain-English Git requests into a JSON plan. Respond ONLY with JSON: { "commands": [{ "op": "checkout" | "branch" | "reset" | "log" | "stash", "args": {...}, "description": "human-readable one-liner" }] }. Never include destructive operations without setting "requiresConfirmation": true.`;
```

### Step 7.2 — A closed set of allowed operations, not arbitrary git

```ts
type NlOperation =
  | { op: 'switchBranch'; branch: string }
  | { op: 'createBranch'; name: string; from?: string }
  | { op: 'undoLastCommit' }
  | { op: 'showLog'; author?: string; since?: string; path?: string }
  | { op: 'stash'; description?: string };

function executeNlOperation(op: NlOperation): Promise<string> {
  switch (op.op) {
    case 'switchBranch': return git.switchBranch(op.branch);
    case 'createBranch': return git.createBranch(op.name, op.from);
    // ... one case per already-existing, already-error-handled git/ function
  }
}
```

**Why the AI's JSON output gets parsed into a strict, closed TypeScript union instead of being used to build a raw git command string:** This is the single most important safety decision in this whole feature. If the AI's text output were ever directly interpolated into a shell command or a raw `git.raw([...])` call, a subtly wrong or adversarially-crafted diff/prompt could produce an unexpected destructive command. By constraining the AI to choosing from a fixed menu of *already-implemented, already-tested* `git/index.ts` functions (the same ones the Dashboard and Commit Editor use), the AI can never invoke an operation that wasn't deliberately built and reviewed by you. "Never use terminal/raw shell execution" from your core rules extends naturally into "never let AI output become an executable command directly."

### Step 7.3 — Command history for reuse

Store the last N (say, 20) NL commands + their resolved plan in `context.workspaceState` (not `SecretStorage` — this isn't a secret, and not global `context.globalState` — it should be per-project, since "create a feature branch from main" means something different per repo).

**Why `workspaceState` specifically:** It's VS Code's built-in per-workspace-folder key/value store, already scoped correctly without you needing to manage file paths yourself, and it persists across VS Code restarts without you writing any file I/O — the natural fit for "history of past NL commands for quick reuse" tied to *this* project.

---

## Phase 8 — Advanced Git Toolkit `[AI: None, optional AI summaries]`

**Goal:** Stash Manager, Rebase Preview, Cherry-Pick Selector, Log Explorer, Worktree Quick-Create — all pure Git, following the exact same pattern established in Phase 3.

For each sub-feature, the pattern is identical, so build them in this order (roughly increasing complexity):

1. **Log Explorer** — wraps `git.log({ ...filters })`; simplest, read-only, good warm-up.
2. **Stash Manager** — wraps `git.stashList()`, `git.stash(['push', '-m', description])`, `git.stash(['apply', ref])`, `git.stash(['drop', ref])`. AI is optional here only for *summarizing* what a stash contains (reuse the Phase 6 pattern: pure data always available, AI summary is an optional enhancement layered on top, never blocking).
3. **Cherry-Pick Selector** — needs a commit picker UI (reuses the Log Explorer's list component) plus `git.raw(['cherry-pick', sha])`, wrapped with a **new, specific error type** `CherryPickConflictError` in `git/errors.ts` (cherry-pick conflicts are common and need their own friendly message distinct from `MergeConflictError`).
4. **Rebase Preview** — the trickiest: this should be **read-only by design for now**. Compute what `git rebase` *would* move using `git.log(['--oneline', `${base}..${branch}`])` to list the commits that would be replayed, and render them — but do not actually invoke `git rebase` yet. Your context doc explicitly excludes merge handling "for now," and rebase carries similar conflict-resolution complexity; shipping the *preview* without the *execution* gives users the visibility your spec asks for ("Visual commit log showing exactly what will move") while deferring the higher-risk actual rebase execution to a later phase.
5. **Worktree Quick-Create** — wraps `git.raw(['worktree', 'add', path, branch])` (simple-git doesn't have a first-class worktree method, so this is one of the few places you'll reach for `git.raw()` — keep it isolated in its own function with its own try/catch, same pattern as everything else).

**Why Rebase Preview stops short of executing, while the other four don't:** Consistency with your own stated exclusion ("NO merge command handling — deferred to a future phase"). Rebase is close enough to merge in terms of conflict complexity that shipping preview-only now, and execution later once you've built proper conflict-resolution UI, keeps the feature honest about what it currently does.

---

## Phase 9 — Team Collaboration Features `[AI: Optional]`

**Goal:** Shared commit templates, project-specific AI prompt presets, PR prep assistant, branch naming guardrails.

### Step 9.1 — Shared Commit Templates & Naming Guardrails via workspace settings

Add to `package.json`'s `configuration`:
```json
"gitsnap.commitTemplate.scopes": { "type": "array", "items": { "type": "string" }, "default": [] },
"gitsnap.branchNaming.pattern": { "type": "string", "default": "" }
```

**Why these live in regular workspace-scoped settings (`.vscode/settings.json`) instead of any GitSnap-specific storage:** Your spec says these are "synced via `.vscode/settings.json`" explicitly — that file is meant to be committed to the repo so the whole team gets the same conventions automatically the moment they clone the project and open it in VS Code. This is the *only* piece of GitSnap config that should ever be committed to source control (contrast with the API key, which must never be).

### Step 9.2 — AI Prompt Presets, stored locally only

```json
"gitsnap.ai.customSystemPrompt": { "type": "string", "default": "" }
```
If set, `ai/index.ts`'s commit-message generation uses this instead of the built-in `SYSTEM_PROMPT`.

**Why "stored locally, never uploaded" needs to be an explicit design choice here, not just an accident of where the setting lives:** A custom prompt could contain internal team terminology or project-specific context the team doesn't want leaving the machine except as part of the (already-consented-to) AI request itself. Keeping it in local `settings.json` (which, per Settings Sync being user-controlled, is not automatically pushed anywhere) satisfies this without extra engineering — but document it clearly in the setting's `description` field so users understand where the boundary is.

### Step 9.3 — PR Prep Assistant

New AI function `generatePrDescription(commits: string[], apiKey, model)`, using `git.log()` between the current branch and its base to gather commit subjects, feeding them to an AI prompt that produces a draft title + body. Output goes into a simple text-area panel (reusing the Commit Editor's "editable box" pattern) — **never auto-opens a PR itself**, since your spec says "manual edit required" and GitSnap has no GitHub/GitLab API integration described anywhere else in the plan. This stays a text-generation helper, not an automation that talks to external hosting providers.

### Step 9.4 — Branch Naming Guardrails

Pure regex check against `gitsnap.branchNaming.pattern` (e.g. `^(feature|bugfix|hotfix)/.+`), run inside `createBranch()` in `git/index.ts` — shows a **warning**, not a hard block (consistent with the Edit-Before-Commit format validation's "warns but allows override" philosophy established in Phase 5). This needs zero AI.

---

## Part 10 — Adding a Custom Extension Icon/Logo

**Goal:** Give GitSnap a real Marketplace/Extensions-view icon instead of the default puzzle-piece placeholder.

### Step 10.1 — Prepare the image

- **Format:** PNG (not SVG — the Marketplace requires a raster image for the extension icon itself, though SVG is fine *inside* webview UI).
- **Size:** 128×128 pixels minimum (square). Marketplace recommends up to 256×256 for retina display quality.
- **Background:** Should not be transparent-only if your logo has thin light-colored linework — VS Code's Extensions view shows icons on both light and dark backgrounds, so test against both, or include a subtle background fill.

Place the file at the project root, e.g. `gitsnap/resources/icon.png` (a `resources/` folder keeps branding assets separate from `src/` and `dist/`).

### Step 10.2 — Reference it in `package.json`

```json
{
  "name": "gitsnap",
  "displayName": "GitSnap",
  "icon": "resources/icon.png",
  ...
}
```

**Why this single `icon` field is all that's needed:** VS Code's packaging tool (`vsce`) reads this field and embeds the referenced image into the `.vsix` package's metadata automatically — no additional build step, no reference from any TypeScript file. It's purely declarative, exactly like `displayName` or `description`.

### Step 10.3 — Make sure it survives packaging

Check `.vscodeignore` — if it has an overly broad exclusion pattern (e.g. accidentally excluding all of `resources/`), the icon file won't make it into the final `.vsix` even though the manifest references it correctly. After running `vsce package`, unzip the resulting `.vsix` and confirm `resources/icon.png` is actually present inside it — this is a common, easy-to-miss packaging mistake.

### Step 10.4 — Optional: command icons using built-in Codicons

Notice your existing commands already use this pattern — `"icon": "$(zap)"`, `"icon": "$(gear)"`, `"icon": "$(key)"` in `package.json`'s `contributes.commands`. These `$(name)` references are VS Code's built-in **Codicon** font icons (free, no image file needed), distinct from the extension's own Marketplace icon set up in Step 10.2. For the new commands added in Phases 3–8, follow the same pattern — e.g. `"icon": "$(git-branch)"` for the dashboard, `"icon": "$(archive)"` for the stash manager, `"icon": "$(git-commit)"` for the commit editor. Browse the full Codicon set in VS Code's own icon reference before inventing custom SVGs for every toolbar button — it keeps GitSnap visually consistent with the rest of the editor for free.

---

## Cross-Cutting Concerns to Revisit as You Build Every Phase Above

### Error Handling Contract
Every new `git/` function needs the same three-part pattern your existing `push()`/`commit()` already use: (1) try the operation, (2) if it's already a `GitSnapError` subtype, rethrow as-is, (3) otherwise pattern-match the raw error string and translate it, falling back to a generic-but-still-friendly message. As you add `CherryPickConflictError`, `BranchAlreadyExistsError`, `UnmergedBranchDeleteError`, etc. in `git/errors.ts`, keep them all extending the existing `GitSnapError` base class — this is what lets `extension.ts`'s catch blocks and any future centralized error-to-toast logic treat them uniformly.

### Security & Privacy
Every new AI function added (branch insight, NL translation, PR description) must: read the key via `secrets.getApiKey()` (never store it anywhere else), never write diffs/commit history to disk or `workspaceState`/`globalState` (only the NL *command history* — not diff content — gets persisted, per Phase 7.3), and respect `isAiEnabled()` from Phase 1 before doing any network call at all.

### Testing
Every pure function (branch badge computation, NL operation validation, format-regex checks, `truncateDiff`/`cleanCommitMessage`) is a Vitest unit-test candidate with zero mocking needed. Every `git/` and `ai/` function needs the same mock-based testing pattern your existing `git/index.test.ts` and `ai/index.test.ts` already establish — mock `simple-git`'s factory, mock the `AiProvider` interface, never hit a real repo or real network in the unit suite.

### Packaging
As the webview grows to multiple Svelte bundles (Settings, Branch Dashboard, Commit Editor), double check `vite.config.ts`'s webview `rollupOptions.input` includes every entry point, and `.vscodeignore` still correctly excludes `src/` and test files while including everything under `dist/` and `resources/`.

---

## Suggested Overall Build Order

1. Phase 1 — AI-optional toggle (foundational, small, unblocks everything else)
2. Phase 2 — Provider-agnostic AI module (foundational, matches your BYOK principle)
3. Phase 3 — Branch Dashboard (`[AI: None]`, biggest visible feature, no AI risk)
4. Phase 4 — Keyboard shortcuts (`[AI: None]`, quick win, low complexity)
5. Phase 10 — Custom icon (`[AI: None]`, cosmetic, can be done anytime, listed last only because it's independent of everything else)
6. Phase 5 — Edit-Before-Commit Flow (`[AI: Optional]`, depends on Phases 1–2 being solid)
7. Phase 6 — AI Branch Intelligence (depends on Phase 3's data + Phases 1–2's AI layer)
8. Phase 8 — Advanced Toolkit (`[AI: None]` mostly, depends on Phase 3's panel patterns)
9. Phase 7 — Natural Language Interface (most complex, depends on Phase 8's operations existing as callable functions)
10. Phase 9 — Team Collaboration Features (depends on almost everything above existing first)

---

*This guide assumes you already have the working core engine (stage → AI commit → push, Settings UI, SecretStorage) verified in your repo. Tell me which phase or specific file you want to start writing first, and we'll build it together, file by file.*
