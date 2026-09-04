# ⚡ GitSnap

One-click AI-powered Git stage, commit, and push for VS Code.

## ✨ Features

- **AI-Generated Commit Messages**: Automatically analyzes your staged changes and generates a conventional commit message.
- **One-Click Workflow**: Stage all changes → Generate Message → Commit → Push, triggered directly from the status bar.
- **Secure API Key Storage**: Keys are safely stored in your OS credential manager (Keychain, Credential Manager, libsecret) — never plain text.
- **Provider Agnostic**: Works with Groq, OpenAI-compatible endpoints, and other LLM providers.
- **Native Progress UI**: Uses VS Code's built-in loading states for a seamless, theme-correct experience.
- **Friendly Error Handling**: Clear, actionable messages instead of raw terminal output or stack traces.

## 🚀 Installation

1. Download the `gitsnap-*.vsix` file.
2. Open VS Code and go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Click the `...` (More Actions) menu in the top-right corner.
4. Select **Install from VSIX...** and choose the downloaded file.
5. Reload VS Code when prompted.

## 🛠️ Usage

1. Open a Git repository in VS Code.
2. Run `GitSnap: Open Settings` from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to securely store your AI API key.
3. Make changes to your code.
4. Click the **⚡ GitSnap** button in the bottom-left status bar.
5. GitSnap will automatically stage your changes, generate a commit message via AI, commit, and push to your remote.

## ⚙️ Settings

All configuration is handled securely via VS Code's `SecretStorage` API:
- **AI Provider API Key**: Required for message generation. Supports Groq and OpenAI-compatible keys.
- **AI Model**: Select your preferred model (defaults to a fast, low-latency option).

## 📋 Requirements

- VS Code `^1.85.0`
- Git CLI installed and available in your system `PATH`
- Active internet connection (for AI API calls)

## 🤝 Contributing

Pull requests and issue reports are welcome! Please maintain the existing architecture:
- Keep extension host (`node`) and webview (`browser`) code strictly separated.
- Never leak raw terminal/SDK errors to the user UI.
- Use `SecretStorage` for all sensitive data.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.