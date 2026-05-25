# Installation & Setup

This document lists all packages, tools, and commands needed to run this project on Windows (primary), with notes for WSL/Linux/macOS. It focuses on three dependency surfaces:

- System / native binaries (ffmpeg, pdftoppm / Poppler, etc.)
- Python dependencies (requirements.txt)
- Node / JavaScript dependencies (package.json)

If you prefer, this can be merged into the existing README.md — say "merge" and I will integrate it.

---

## 1) System prerequisites (Windows)

These binaries are required for media processing and PDF->images conversion used by the project:

- ffmpeg (ffmpeg, ffprobe, ffplay)
- Poppler (pdftoppm, pdftotext, pdffonts, etc.)
- Visual C++ redistributable (often installed as a dependency of Poppler packages)

Recommended installer via winget (Windows):

- Update winget sources (recommended):

  ```powershell
  winget source update
  ```

- Install FFmpeg (Gyan build):

  ```powershell
  winget install --id Gyan.FFmpeg -e
  ```

  Alternate: `Gyan.FFmpeg.Shared` if you prefer the shared build.

- Install Poppler (provides `pdftoppm`):

  ```powershell
  winget install --id oschwartz10612.Poppler -e
  ```

Notes and alternatives:
- If you use Chocolatey:
  ```powershell
  choco install ffmpeg -y
  choco install poppler -y
  ```
- If you use Scoop:
  ```powershell
  scoop install ffmpeg
  scoop bucket add extras
  scoop install poppler
  ```
- After installation, restart your shell or VS Code terminal so PATH updates are picked up.

Verification (run in PowerShell):

```powershell
where.exe ffmpeg
ffmpeg -version
where.exe pdftoppm
pdftoppm -h
```

---

## 2) Python environment (virtualenv)

Create and activate a venv, then install Python requirements from `requirements.txt`.

PowerShell (Windows):

```powershell
# Create virtual environment
python -m venv .venv

# If activation is blocked by execution policy, allow scripts for the session
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned

# Activate
& .\\.venv\\Scripts\\Activate.ps1

# Upgrade packaging tooling and install dependencies
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

Compact one-liner (PowerShell):

```powershell
python -m venv .venv; Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned; & .\\.venv\\Scripts\\Activate.ps1; python -m pip install --upgrade pip setuptools wheel; pip install -r requirements.txt
```

WSL / Linux / macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

Verify Python packages:

```powershell
pip freeze
pip show <package-name>
```

Note: `requirements.txt` lists Python package dependencies only. The project also needs the system binaries and Node packages (see below).

---

## 3) Node / JavaScript dependencies

This repository uses Next.js / TypeScript. Install Node packages before running the dev server.

- Install (in project root):

```powershell
npm install
# or, if you prefer pnpm/yarn
# pnpm install
# yarn install
```

- Start dev server:

```powershell
npm run dev
```

Verify installed packages:

```powershell
npm ls --depth=0
```

---

## 4) Environment variables and external services

This project may require API keys and endpoints stored in environment variables for features such as OpenAI/Ollama, Supabase, etc. Check these files and values before running:

- `.env` or `.env.local` (not committed to repo). See `next.config.ts` and `README.md` for expected variables.
- Common variables to set (example names — confirm in your code):
  - `OPENAI_API_KEY`
  - `OLLAMA_URL` / `OLLAMA_API_KEY`
  - `SUPABASE_URL` / `SUPABASE_KEY`
  - `PDFTOPPM_PATH` (optional) — absolute path to `pdftoppm` if you installed it to a non-standard location
  - `FFMPEG_PATH` (optional)

How to set a variable for local dev (PowerShell):

```powershell
$env:OPENAI_API_KEY = "sk-xxxx"
# or add to .env.local for Next.js (restart dev server after changes)
```

---

## 5) Verify end-to-end readiness

1. Ensure system binaries are installed and visible on PATH:
   - `ffmpeg -version`
   - `pdftoppm -h`
2. Activate venv and confirm Python packages installed:
   - `pip freeze`
3. Ensure Node modules are installed:
   - `npm ls --depth=0`
4. Start the dev server and exercise endpoints used for processing:
   - `npm run dev`
   - Use REST client or curl to call `POST /api/lecture` with `action=process` for a sample `contentId`.

Example request (PowerShell):

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/lecture' -Method Post -Body '{"action":"process","contentId":"<contentId>","language":"en"}' -ContentType 'application/json'
```

If you get an error like `Binary not found: pdftoppm` or `ffmpeg`, confirm the PATH and restart the terminal.

---

## 6) Troubleshooting & notes

- Winget may require admin elevation to install system packages — run PowerShell as Administrator if the install fails.
- If `winget install` returns "No package found", run `winget source update` and `winget search ffmpeg` / `winget search poppler` to find available ids.
- Some Python packages with native extensions may require Visual C++ build tools. Install `Build Tools for Visual Studio` if you encounter wheel/build errors.
- The repository intentionally preserves internal `lecture_id` storage while exposing `contentId` publicly. The on-disk folders were renamed from `lectures` → `content` and the server code updated to point to the new locations.

---

## 7) Option: Merge into README

If you want this content incorporated into the project's README, say `merge` and I will add a concise "Setup" section to README.md and keep this file as an expanded reference.

---

Last updated: 2026-05-25
