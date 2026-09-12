# Design Document: Automated Google Apps Script Deployment via Clasp

## Overview
This document specifies the design for setting up automated Google Apps Script deployment in **MyFinancialBot** using Google's official CLI tool (`@google/clasp`).

---

## 1. Tool Selection Analysis
Google's official `@google/clasp` tool was selected after evaluating deployment tools for Google Apps Script. 
Key reasons:
- **Official Support**: Maintained by Google for local Apps Script project workflows.
- **File Management**: Supports multi-file `.gs` uploads and syncs cleanly with standard local Git repositories.
- **npm Integration**: Runs cleanly via `package.json` scripts (`npm run push`, `npm run deploy`).
- **Deployment Control**: Supports versioned Web App creation directly from the command line.

---

## 2. Configuration Files & Architecture

### 2.1 Dependencies (`package.json`)
Add `@google/clasp` as a `devDependency` and configure standard CLI scripts:
- `npm run login`: Launches browser OAuth login flow to authenticate `clasp` locally.
- `npm run push`: Pushes local `src/*.gs` files and manifest to Google Apps Script.
- `npm run deploy`: Creates a versioned Web App deployment in Google Apps Script.
- `npm run watch`: Auto-syncs file changes on save during active development.
- `npm run status`: Shows local modified/untracked files relative to Apps Script.

### 2.2 Ignore Rules (`.claspignore`)
Prevents non-Apps Script code (node_modules, unit tests, env files, docs) from being uploaded:
```gitignore
**/*
!src/**/*.gs
!src/appsscript.json
!appsscript.json
```

### 2.3 Manifest File (`appsscript.json`)
Placed at `src/appsscript.json`:
- V8 runtime configuration (`runtimeVersion: "V8"`).
- Timezone (`timeZone: "America/Argentina/Buenos_Aires"`).
- Web App execution settings (`executeAs: "USER_DEPLOYING"`, `access: "ANYONE_ANONYMOUS"`).

### 2.4 Project Link Template (`.clasp.json.example`)
Template for linking local repository to an existing Apps Script project ID:
```json
{
  "scriptId": "YOUR_APPS_SCRIPT_ID_HERE",
  "rootDir": "./src"
}
```

### 2.5 Git Security (`.gitignore`)
Add `.clasp.json` to `.gitignore` to prevent committing developer-specific Apps Script project IDs.

---

## 3. Documentation & Guide Integration (`README.md`)
Update `README.md` to include CLI-based deployment steps alongside manual paste steps:
- **Prerequisite**: Enabling Google Apps Script API at `https://script.google.com/home/usersettings`.
- **Step 1**: Install dependencies (`npm install`).
- **Step 2**: Authenticate (`npm run login`).
- **Step 3**: Link project (`.clasp.json` setup or `npx clasp create`).
- **Step 4**: Push code (`npm run push`).
- **Step 5**: Deploy Web App (`npm run deploy`).
