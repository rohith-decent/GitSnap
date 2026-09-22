# GitSnap

**One-Click, AI-Powered Git Automation & Developer Workflow Suite for VS Code**

GitSnap is an all-in-one Git companion built for Visual Studio Code that bridges raw Git mechanics with local and cloud intelligence. Whether you need an instant AI-drafted conventional commit pushed upstream in a single keystroke, an interactive side-by-side staged diff review, a branch health dashboard, or natural language command translation, GitSnap automates the friction points of source control without ever sacrificing transparency, safety, or privacy.

---

## ⚡ Core Philosophy & Architecture

GitSnap was engineered from the ground up around four strict architectural principles:

1. **Dual-Runtime Process Isolation**
   VS Code extensions operate in two distinct environments. GitSnap isolates Node.js backend logic (`src/extension/*`) from sandboxed browser webview panels (`src/webview/*`). The extension host handles raw filesystem I/O, Git operations, and network requests, while Svelte 5 webviews communicate solely over typed discriminated union contracts via `postMessage`.

2. **AI-Optional by Design** (`gitsnap.ai.enabled: false`)
   GitSnap is a complete, high-performance Git productivity suite even with zero AI configured. When AI features are toggled off or network timeouts occur, every workflow falls back gracefully to deterministic Git metadata and manual text prompts without crashing or blocking operations.

3. **Provider-Agnostic "Bring Your Own Key" (BYOK)**
   Connect to high-throughput cloud providers (Groq, OpenAI, Anthropic) or run 100% offline with zero external network egress using self-hosted models (Ollama, Tabby).

4. **OS-Level Credential Protection**
   API keys are never written to plain-text workspace configuration files (`settings.json`) or committed to repositories; they reside exclusively in VS Code's encrypted `SecretStorage` (Keychain on macOS, Credential Manager on Windows, and `libsecret` on Linux).

5. **Deterministic Git Safety**
   GitSnap relies on typed wrappers around `simple-git` rather than vulnerable child process command strings. Destructive operations (like branch deletions or resets) require explicit user confirmations and display real-time progress indicators.

---

## 🚀 Key Features

### 1. Fast AI Commit & Push
Inspects workspace diffs, truncates large payloads on the tail end to retain the most recent changes within model token budgets, generates an accurate Conventional Commit message (`feat`, `fix`, `refactor`, `chore`, etc.), commits staged changes, and pushes to upstream remotes.

### 2. Interactive Side-by-Side Commit Editor
A dedicated review workspace launched prior to committing:
- **Staged Diff Viewer** — Real-time diff syntax highlighting with additive (`+`) and subtractive (`-`) visual cues.
- **Live Conventional Commit Validator** — Evaluates commit messages in real time against standard format expressions (`type(scope): description`), providing inline warnings without blocking overrides.
- **On-Demand AI Drafting** — Trigger 💡 **AI Suggest** inside the panel to generate a message based on the current staged diff, or author custom messages manually.

### 3. Branch Intelligence Dashboard
A centralized visual command center for branch lifecycle management:
- **Tracking Visualizer** — Inspect ahead/behind counts against remote tracking branches calculated directly from `git branch -vv`.
- **Deterministic Status Badges** — Pure math calculations identify stale branches (>30d), diverged states (`ahead > 0 && behind > 0`), and branches ready for merging.
- **AI Branch Insights** — Generates concise, actionable health summaries for individual branches.
- **One-Click Operations** — Switch, create (locally or from base branches), fetch, or delete branches without touching the terminal.

### 4. Advanced Git Toolkit
A comprehensive suite of essential everyday developer utilities:
- **Log Explorer** — Query, filter, and inspect structured commit history.
- **Stash Manager** — Push unstaged/staged work into named stashes, preview stash diffs with optional AI summaries, and execute apply, pop, or drop safely.
- **Cherry-Pick Selector** — Select specific commits from a graphical log to apply cleanly onto the current HEAD with friendly conflict handling.
- **Rebase Preview** — Inspect a read-only projection of commits that will be replayed against a selected base branch before initiating rebase workflows.
- **Worktree Quick-Create** — Spawn isolated worktree checkouts instantly to work across multiple branches concurrently without stashing.

### 5. Pull Request (PR) Prep Assistant
Prepares feature branches for upstream code reviews:
- Computes commit lists and change deltas between the current working branch and a configurable base branch (`main`/`master`).
- Automatically drafts PR titles and comprehensive Markdown summaries outlining key architectural changes, ready to copy directly into GitHub or GitLab.

### 6. Natural Language Git Commander
Translates plain English prompts (e.g., *"switch to main and fetch latest"*, *"stash current work with label WIP"*, *"undo last commit"*) into a structured JSON execution plan.
- **Closed Execution Safety Boundary** — AI responses are strictly parsed into predefined, validated TypeScript operation unions; AI output is never executed directly as raw shell strings.
- **Preview & Confirmation** — Users review the exact commands and danger warnings before execution.
- **Project History** — Keeps an audit log of recent natural language commands in VS Code `workspaceState` for rapid reuse.

### 7. Safe Undo (Soft Reset)
Accidentally committed work? The undo action executes `git reset --soft HEAD~1`, unwinding the commit while keeping all modified files safely staged in your working tree.

---

## ⌨️ Shortcuts & Keybindings

GitSnap features ergonomic, single-stroke shortcuts designed to avoid chords, key collisions, and system menu interference:

| Action | Windows / Linux | macOS | Toolbar Codicon |
|---|---|---|---|
| Fast AI Commit & Push | `Ctrl+Alt+Enter` | `Cmd+Alt+Enter` | `$(zap)` |
| Open Commit Editor | `Ctrl+Alt+C` | `Cmd+Alt+C` | `$(git-commit)` |
| Open Branch Dashboard | `Ctrl+Alt+B` | `Cmd+Alt+B` | `$(git-branch)` |
| Open Advanced Toolkit | `Ctrl+Alt+T` | `Cmd+Alt+T` | `$(tools)` |
| Open PR Prep Assistant | `Ctrl+Alt+P` | `Cmd+Alt+P` | `$(git-pull-request)` |
| Natural Language Command | `Ctrl+Alt+N` | `Cmd+Alt+N` | `$(sparkle)` |
| Undo Last Commit (Soft) | `Ctrl+Alt+Z` | `Cmd+Alt+Z` | `$(discard)` |

> **Source Control (SCM) Integration:** All primary tools are also pinned directly to the Source Control Title Bar in VS Code's sidebar for instant one-click access.

---

## ⚙️ Configuration & Team Guardrails

GitSnap configurations can be customized globally or committed to `.vscode/settings.json` to enforce consistent standards across development teams:

```json
{
  // Toggle AI capabilities globally (commit suggestions, insights, NL commands)
  "gitsnap.ai.enabled": true,

  // Selected AI provider: "groq" | "openai" | "anthropic" | "ollama" | "tabby"
  "gitsnap.ai.provider": "groq",

  // Suggested team scopes for conventional commit validation (e.g., ["auth", "api", "ui"])
  "gitsnap.commitTemplate.scopes": [
    "auth",
    "core",
    "ui",
    "docs",
    "infra"
  ],

  // Regex pattern to enforce branch naming conventions across team workspaces
  "gitsnap.branchNaming.pattern": "^(feature|bugfix|hotfix|chore)/.+",

  // Custom system prompt override for commit generation (stored locally)
  "gitsnap.ai.customSystemPrompt": ""
}
```

### Managing Credentials

To configure your API key securely:

1. Open the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **GitSnap: Set API Key** or open **GitSnap: Open Settings**.
3. Enter your secret token. GitSnap writes the key to VS Code's OS-encrypted `SecretStorage`.

---

## 🔑 Setting Up Your AI API Key (BYOK — Groq)

GitSnap follows a **Bring Your Own Key (BYOK)** model[cite: 6]. It uses high-speed cloud inference (defaulting to **Groq**) so commit messages and branch summaries generate in milliseconds without subscriptions or platform lock-in[cite: 4, 6].

---

### Step 1: Get a Free Groq API Key

1. Navigate to the **[Groq Console](https://console.groq.com/)**.
2. Sign in or create a free account.
3. Open the **API Keys** section in the left sidebar (or visit [console.groq.com/keys](https://console.groq.com/keys)).
4. Click **Create API Key**.
5. Give your key a name (e.g. `GitSnap-VSCode`), copy the generated secret key (`gsk_...`), and save it securely.

---

### Step 2: Store the Key in GitSnap

You can save your key using either of the following methods:

#### Method A: Command Palette (Fastest)
1. Open the VS Code Command Palette:
   * **Windows/Linux**: `Ctrl + Shift + P`[cite: 5]
   * **macOS**: `Cmd + Shift + P`[cite: 5]
2. Type and select **`GitSnap: Set API Key`**[cite: 4, 6].
3. Paste your Groq API key (`gsk_...`) and press `Enter`.

#### Method B: GitSnap Settings Webview
1. Run **`GitSnap: Open Settings`** from the Command Palette or the quick action menu (`Ctrl + Alt + M` / `Cmd + Alt + M`)[cite: 4, 6].
2. Select **Groq** from the AI Provider dropdown[cite: 4, 6].
3. Paste your key into the API key field and click **Save**[cite: 5].


## 🛠️ Build & Developer Workflow

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Git CLI**: Installed and available on your system `PATH`
- **VS Code**: Version 1.134.0 or higher

### Setup Instructions

Clone the repository and install all development dependencies:

```bash
git clone https://github.com/rohith-decent/GitSnap.git
cd GitSnap
npm install
```

### Compilation Pipeline

GitSnap leverages a custom Vite configuration that compiles the Node extension host and Svelte webview apps into independent distribution bundles:

```bash
# Full dual build (Extension host + Webview bundles)
npm run build

# Concurrent watch mode for active development
npm run watch

# Run test suite
npm run test
```

### Debugging in VS Code

1. Open the project root in VS Code.
2. Press `F5` (or execute **Run Extension** from the Run & Debug view).
3. A clean Extension Development Host window will open with GitSnap activated.

---

## 🔒 Security & Privacy Commitments

- **In-Memory Volatility** — Diffs are loaded into memory exclusively for commit analysis and are immediately discarded — code diffs are never cached to disk, logged to telemetry, or stored beyond the active session.
- **Encrypted Secrets** — Sensitive API credentials never hit disk files or `.vscode/settings.json`.
- **Friendly Error Isolation** — Git errors are trapped internally, mapped to actionable advice, and logged to the GitSnap Output Channel; raw terminal stack traces or environment paths are never leaked in error notifications.
- **Offline Execution** — With local Ollama or Tabby instances configured, all prompt analysis runs locally with zero external network transmission.

---

## 📄 License

Distributed under the **MIT License**. Authored by **RohithSGowda**.
