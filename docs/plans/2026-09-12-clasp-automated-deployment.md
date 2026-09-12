# Clasp Automated Deployment Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Configure `@google/clasp` CLI automated deployment for Google Apps Script with npm scripts, manifest/ignore files, and update `README.md` with CLI deployment instructions.

**Architecture:** Integrate `@google/clasp` as a devDependency in `package.json` with helper scripts (`npm run push`, `npm run deploy`, `npm run login`, `npm run watch`). Add `.claspignore` and `src/appsscript.json` to scope pushes exclusively to Apps Script source code. Document the automated CLI workflow alongside manual setup in `README.md`.

**Tech Stack:** `@google/clasp`, Node.js, Google Apps Script V8 Runtime, Markdown.

---

### Task 1: Add `@google/clasp` dependency and npm deployment scripts to `package.json`

**Files:**
- Modify: [`package.json`](file:///home/javier/projects/misc/javierfinancebot/package.json)

**Step 1: Add `@google/clasp` to `devDependencies` and add scripts**

Modify [`package.json`](file:///home/javier/projects/misc/javierfinancebot/package.json):
```json
{
  "name": "myfinancialbot",
  "version": "1.0.0",
  "description": "A zero-cost serverless Telegram bot for personal expense tracking using Google Apps Script, Gemini AI, and Google Sheets",
  "main": "src/Code.gs",
  "scripts": {
    "test": "node --test tests/**/*.test.js",
    "login": "clasp login",
    "push": "clasp push -f",
    "deploy": "clasp deploy",
    "watch": "clasp push --watch",
    "status": "clasp status"
  },
  "devDependencies": {
    "@google/clasp": "^2.4.2"
  },
  "keywords": ["telegram", "google-apps-script", "gemini-ai", "expense-tracker"],
  "author": "",
  "license": "MIT"
}
```

**Step 2: Install npm dependencies**

Run: `npm install`
Expected output: `added X packages` with `@google/clasp` installed in `node_modules`.

**Step 3: Run `npx clasp --version` to verify clasp binary works**

Run: `npx clasp --version`
Expected output: `2.4.2` (or current version).

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(deploy): add clasp devDependency and npm deployment scripts"
```

---

### Task 2: Create `.claspignore`, `src/appsscript.json`, `.clasp.json.example`, and update `.gitignore`

**Files:**
- Create: [`.claspignore`](file:///home/javier/projects/misc/javierfinancebot/.claspignore)
- Create: [`src/appsscript.json`](file:///home/javier/projects/misc/javierfinancebot/src/appsscript.json)
- Create: [`.clasp.json.example`](file:///home/javier/projects/misc/javierfinancebot/.clasp.json.example)
- Modify: [`.gitignore`](file:///home/javier/projects/misc/javierfinancebot/.gitignore)

**Step 1: Create `.claspignore`**

Write content to [`.claspignore`](file:///home/javier/projects/misc/javierfinancebot/.claspignore):
```gitignore
**/*
!src/**/*.gs
!src/appsscript.json
!appsscript.json
```

**Step 2: Create `src/appsscript.json`**

Write content to [`src/appsscript.json`](file:///home/javier/projects/misc/javierfinancebot/src/appsscript.json):
```json
{
  "timeZone": "America/Argentina/Buenos_Aires",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

**Step 3: Create `.clasp.json.example`**

Write content to [`.clasp.json.example`](file:///home/javier/projects/misc/javierfinancebot/.clasp.json.example):
```json
{
  "scriptId": "YOUR_APPS_SCRIPT_ID_HERE",
  "rootDir": "./src"
}
```

**Step 4: Update `.gitignore` to ignore `.clasp.json`**

Append `.clasp.json` to [`.gitignore`](file:///home/javier/projects/misc/javierfinancebot/.gitignore):
```gitignore
.clasp.json
```

**Step 5: Verify tests still pass**

Run: `npm test`
Expected output: All unit tests pass cleanly.

**Step 6: Commit**

```bash
git add .claspignore src/appsscript.json .clasp.json.example .gitignore
git commit -m "feat(deploy): add clasp manifest, ignore, template config, and gitignore rule"
```

---

### Task 3: Add Automated CLI Deployment section to `README.md`

**Files:**
- Modify: [`README.md`](file:///home/javier/projects/misc/javierfinancebot/README.md)

**Step 1: Update `README.md` setup guide**

Add **Phase 4 (Option B): Automated CLI Deployment via `clasp`** in [`README.md`](file:///home/javier/projects/misc/javierfinancebot/README.md) under the deployment instructions:

```markdown
### Phase 4 (Option B): Automated CLI Deployment via `clasp`

Instead of manually copying code into the web editor, you can push and deploy code directly from your terminal using `clasp`:

1. **Enable Apps Script API**:
   - Go to [Google Apps Script Settings](https://script.google.com/home/usersettings).
   - Switch the **Google Apps Script API** toggle to **ON**.

2. **Authenticate Local CLI**:
   ```bash
   npm run login
   ```
   Follow the browser login prompt to authorize Google Apps Script access.

3. **Link Your Apps Script Project**:
   - **For an existing project**: Copy `.clasp.json.example` to `.clasp.json` and replace `YOUR_APPS_SCRIPT_ID_HERE` with your Script ID (found under ⚙️ **Project Settings** > **IDs** > **Script ID**):
     ```bash
     cp .clasp.json.example .clasp.json
     ```
   - **For a new project**: Run clasp to create a new Apps Script Web App:
     ```bash
     npx clasp create --type webapp --title "MyFinancialBot" --rootDir src
     ```

4. **Push Code Updates**:
   ```bash
   npm run push
   ```
   This automatically uploads `Config.gs`, `Prompt.gs`, `Code.gs`, and `appsscript.json` to Google Apps Script.

5. **Deploy Web App**:
   ```bash
   npm run deploy
   ```
   This creates a new versioned deployment of your Web App and prints the Web App URL.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add clasp automated deployment guide to README"
```

---

### Task 4: Final Verification & Task List Update

**Files:**
- Modify: [`docs/plans/task.md`](file:///home/javier/projects/misc/javierfinancebot/docs/plans/task.md)

**Step 1: Run project unit tests**

Run: `npm test`
Expected output: All unit tests pass.

**Step 2: Update `task.md`**

Mark all deployment tasks as done.

**Step 3: Commit**

```bash
git add docs/plans/task.md
git commit -m "docs: update task tracker for clasp deployment completed"
```
