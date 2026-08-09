# ProbeIQ — Free-Tier Deployment Plan

Target: **$0/month** deployment of both halves of ProbeIQ.

```text
Browser
   │  https://probeiq.vercel.app
   ▼
Vercel (free) — Next.js frontend
   │  /backend/*  →  server-side rewrite
   ▼
Render (free)  — FastAPI backend (main.py)   ──►  OpenRouter API
   │  SQLite probeiq.db (ephemeral on free tier)
```

- **Frontend → Vercel free**: Next.js is natively supported; one git import.
- **Backend → Render free tier**: Python service running the codebase exactly as-is (no code changes to the backend logic).
- **LLM → OpenRouter** via `llm_client.py`; falls back to local-Ollama/mock if the key is absent, so the app never crashes without it.

Local dev keeps working unchanged: the frontend rewrite defaults to `http://127.0.0.1:8000` when `BACKEND_URL` is not set.

---

## Code changes already made (in this branch)

| File | Change | Why |
| --- | --- | --- |
| `frontend/next.config.js` | Rewrite destination reads `process.env.BACKEND_URL` (default `http://127.0.0.1:8000`) | Same config works locally and on Vercel — just set `BACKEND_URL` to the Render URL |
| `render.yaml` | Render Blueprint for the backend service | One-click deploy, declares build/start commands and env vars |
| `DEPLOYMENT.md` | This document | |

No backend Python files were touched.

---

## Part 1 — Backend on Render (free)

Render free web services sleep after **15 minutes of inactivity**; the first request after sleep takes ~30–60 s to wake up. Sessions (`probeiq.db`, in-memory state) live on an ephemeral disk and are **lost on restart/wake-up**. This is fine for live-demo use; see "Optional upgrades" at the end if you need durability.

### Steps

1. Push this branch to GitHub (your fork is `Sujit-1509/ProbeIQ`):
   ```bash
   git push fork fix-heuristics
   ```
2. Go to https://render.com → **New → Blueprint** → select the `ProbeIQ` repo → branch `fix-heuristics`. Render finds `render.yaml` and creates the `probeiq-api` web service automatically.
   - If Blueprint import is unavailable, use **New → Web Service** instead and copy the values from `render.yaml` (runtime: Python, region: any, branch: `fix-heuristics`, build: `pip install -r requirements.txt`, start: `uvicorn main:app --host 0.0.0.0 --port $PORT`, plan: Free).
3. In the service → **Environment** tab, add:
   - `OPENROUTER_API_KEY` — your real key (leave empty if you want the mock fallback for a fully offline demo).
   - `LLM_MODEL` — default `openai/gpt-4o-mini`.
   - Optional: `OLLAMA_BASE_URL`, `OLLAMA_MODEL` (unused unless you run a reachable Ollama).
4. Wait for the deploy to finish. Note the service URL, e.g. `https://probeiq-api.onrender.com`.
5. Verify:
   ```bash
   curl https://probeiq-api.onrender.com/health
   # {"status":"ok","sessions":0}
   ```

---

## Part 2 — Frontend on Vercel (free)

1. Go to https://vercel.com → **Add New → Project** → import the `Sujit-1509/ProbeIQ` repo.
2. Project settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Next.js (auto-detected)
   - Build/install commands: leave defaults (`npm run build`)
3. **Environment Variables** (Project → Settings → Environment Variables):
   - `BACKEND_URL` = `https://probeiq-api.onrender.com` (the Render URL from Part 1)
4. **Deploy.** Vercel serves the app at `https://<project>.vercel.app`.

The frontend calls `/backend/api/...`; Vercel rewrites those server-side to the Render URL, so there are no CORS issues (the backend already allows all origins anyway).

### Verify end-to-end
1. Open the Vercel URL → pick a candidate → **Start the interview**.
2. First reply takes a few seconds extra on the first request (Render cold start). Subsequent turns are fast.
3. Finish an interview → check `/dashboard` for the history + review UI.

---

## Environment variables summary

| Where | Key | Value | Required? |
| --- | --- | --- | --- |
| Render | `OPENROUTER_API_KEY` | `sk-or-v1-...` | No — mock fallback if unset |
| Render | `LLM_MODEL` | `openai/gpt-4o-mini` | No (has default) |
| Render | `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | default `http://localhost:11434/v1`, `qwen2.5-coder` | No |
| Vercel | `BACKEND_URL` | `https://probeiq-api.onrender.com` | Yes (no default in prod) |

Local development needs no variables — everything falls back to localhost defaults.

---

## Free-tier caveats (read before demoing)

1. **Render sleep**: backend spins down after 15 min idle → first request after idle takes 30–60 s, and **any in-progress interview is lost** (404 on the next turn). Keep an active tab or re-run the interview for demos.
2. **Ephemeral storage**: `probeiq.db` (interview history, reviewer decisions) is wiped on every backend restart. Render's free tier has no persistent disk.
3. **Python on Vercel**: we are *not* using Vercel serverless functions for the backend — they are stateless and can't run uvicorn natively; that's why the backend lives on Render.
4. **OpenRouter quota**: the free key tier applies; if exceeded, `llm_client.py` degrades to the offline mock fallback rather than crashing.

## Optional upgrades (if you later want durability)

- **Persistent sessions/history**: swap `session_store.py` to a free hosted store (Upstash Redis or Supabase Postgres) — the `save`/`get` interface already takes a single JSON blob per session, so the change is contained to one file.
- **Always-awake backend**: Render Starter ($7/mo) or fly.io — no more cold starts or session loss.
- **Custom domains**: free on Vercel Hobby; Render free gives an `onrender.com` subdomain.
