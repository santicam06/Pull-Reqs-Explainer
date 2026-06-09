# 📬🧑‍🏫 Pull-Requests-Explainer

AI-powered Pull Request review tool. Provides a detailed and intuitive report that explains the code changes occured in the Pull Request. Sends the PR's **.patch file** and **user comments** to an LLM, which explains the changes acting as a Principal Engineer mentoring a junior developer.

The LLM can call back a tool to fetch specific GitHub files in the PR's repo, for deeper context when the .patch and comments alone aren't enough.

## LLMs used in this application:
- [Google Gemini 2.5 Pro](https://openrouter.ai/google/gemini-2.5-pro) — for large/complex PRs (>50K chars)
- [Google Gemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash) — for standard PRs (≤50K chars)

The tool automatically selects the model based on the PR patch size. Patches under 50,000 characters use Gemini 2.5 Flash (4x cheaper), while larger patches use Gemini 2.5 Pro for deeper reasoning.

## ⚙️ Setup Instructions

Before running the application, follow these steps:

1. For this repository, create a **GitHub Codespace (Cloud)** OR clone it locally and open it with your preferred code editor (e.g. Visual Studio Code, ...).

>[!IMPORTANT]
From this point on, make sure that your present working directory on your terminal is the root directory of the application: `Pull-Reqs-Explainer`.

2. **Install Node.js** (v18 or later required):
   - **Windows**: Download the latest installer from [nodejs.org](https://nodejs.org/) or use: `winget install OpenJS.NodeJS.LTS`
   - **macOS**: Use Homebrew: `brew install node`
   - **Linux (Ubuntu/Debian)**:
     ```sh
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
     nvm install 20
     ```
   - **Cloud Workspaces (Codespaces, etc.)**: Node.js is usually pre-installed. Run `node --version` to verify and skip this step.

3. **Install Python**:
   - **Windows**: Download the latest installer from [python.org](https://www.python.org/downloads/windows/) or use: `winget install Python.Python.3.12`
   - **macOS**: `brew install python`
   - **Linux (Ubuntu/Debian)**: `sudo apt install python3 python3-pip`
   - **Cloud Workspaces (Codespaces, etc.)**: Python is usually pre-installed. Run `python3 --version` to verify and skip this step.

4. **Create and Activate a Virtual Environment**:
   - Create the environment:
      - **Windows**: `python -m venv .venv`
      - **macOS**: `python3 -m venv .venv`
      - **Linux (Ubuntu/Debian)**: `sudo apt install python3-venv && python3 -m venv .venv`
   - Activate it:
     - **Windows**: `.\.venv\Scripts\activate`
     - **macOS/Linux**: `source .venv/bin/activate`

5. **Install Python `requests` package**:
   ```sh
   pip install requests
   ```

6. **Install Dependencies**:
   ```sh
   npm install
   ```

7. **Environment Configuration**:
   - Create a local `.env` file by copying the template file `.env.example`: This file contains all required API keys for the application:
   ```sh
     # On Windows (Command Prompt)
     copy .env.example .env
     # On macOS/Linux or PowerShell
     cp .env.example .env
   ```
> [!IMPORTANT]
> Always **copy** the template. Do not rename `.env.example` directly, as it must remain in the repository as a reference for required environment variables.

   - Open the newly created `.env` file and fill in your `OPENROUTER_API_KEY`. The application **will not** function without a valid `.env` file in the **repository root**.

8. **Main Directories Glossary**:
   - `./src/pr-explain.ts`: Main script to run application.
   - `./src/tools.py`: Python helper for fetching raw GitHub files (with local `.cache/` support)
   - `./src/INSTRUCTIONS.md`: LLM System prompt template (mutated at runtime with patch/comment data)
   - `./node_modules/`: Installed npm dependencies
   - `./.cache/`: Auto-created cache directory for fetched GitHub files (avoids refetching the URL to control rate limit)

> [!TIP]
> Do not delete the `./.cache/` as it will allow to rapidly retrieve Pull Requests that you had previously run in the application.

### 🚨 Troubleshooting
- **Missing API Key**: Ensure `OPENROUTER_API_KEY` is correctly set in your `.env` file at the repository root.

- **Dependency Issues**: If running in a new environment, ensure you have executed `pip install requests` inside your **activated Virtual Environment** (**Step 5**) and `npm install` (**Step 6**).

- **Python not found**: Ensure Python is installed and available on your PATH as `python` (**Step 3**).

- **TypeScript errors**: Run `npx tsc --noEmit` to typecheck.

---

## 🚀 Usage

#### Provide a full GitHub Pull Request URL as: `https://github.com/owner/repo/pull/pullNumber`.

Examples: 
- `https://github.com/microsoft/vscode/pull/320333`
- `https://github.com/google/googletest/pull/4994`

### Run Command
```sh
npx tsx src/pr-explain.ts "<GitHub PR URL>" [--verbose]
```

> [!NOTE]
> Verbose flag (`--verbose`) generates a `src/debug.txt` file with log traces (overridden per run), use it for engineering purposes only.

### Output
The final response is a Markdown report inside `./reports/`. The report includes four sections:
- **Summary**: What is the goal of this PR?
- **The Discussion**: Who agreed, who disagreed, any blockers?
- **Assessment**: Potential bugs, unhandled edge cases, hidden assumptions.
- **Socratic Questions**: 3 questions to test understanding of the changes.
