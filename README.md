# Self-Evolving Website

Live: https://self-evolving-website.netlify.app
Repo: https://github.com/buzzcutbludden/self-evolving-website

## Deployment setup (one time)

1. Netlify → this project → **Environment variables** → add:
   - `GITHUB_TOKEN` = a GitHub classic PAT with `repo` scope (secret)
   - `OPENAI_API_KEY` = your OpenRouter API key (secret)
   - Already configured: `GITHUB_REPO`, `OPENAI_BASE_URL=https://openrouter.ai/api/v1`, `OPENAI_MODEL=openai/gpt-4o-mini`, `ADMIN_TOKEN`, `SITE_URL`.
2. Netlify → **Build & deploy → Link repository** → link `buzzcutbludden/self-evolving-website`.
   After this, every commit the agent makes triggers a real redeploy.
3. Open `/admin.html`, log in with `ADMIN_TOKEN`, and click **Run Agent Now**.

## Architecture (deployed)

- Static site in `public/`, served by Netlify.
- Netlify Functions in `netlify/functions/` handle feedback, status, history,
  versions, rollback and the agent. They use only Node built-ins + `fetch`.
- The GitHub repo is the database: `data/feedback.json`, `data/history.json`,
  `data/agent-state.json`, and `versions/v*/` snapshots.
- The agent snapshots source, asks the LLM for complete files, validates them,
  and commits source + history + snapshots in one Git Data API commit.
- `agent-cron` is scheduled hourly via `netlify.toml` (30 s function limit).

## Local development (legacy Express version)

`server.js` still runs the original single-process version on port 4000. The
frontend now targets Netlify Functions, so use the deployed site or the local
function harness (`test-harness.js` with `mock-llm.js`) for the current code.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and add your OpenAI API key:
   ```bash
   cp .env.example .env
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Visit http://localhost:4000 for the website, http://localhost:4000/admin.html for the admin dashboard.

## How it works

- Visitors submit feedback via the form on the main page.
- The AI agent periodically reads feedback, analyzes it, and modifies the website's source code.
- All changes are backed up and can be rolled back from the admin dashboard.
- The agent runs autonomously every 10 minutes (configurable via AGENT_INTERVAL in .env).

## Admin Token

Default token is `changeme`. Change it in `.env` for security.

## Testing without an API key

`mock-llm.js` is a local OpenAI-compatible stub used to exercise the full agent
pipeline (feedback → LLM → validation → staging → deploy → history → rollback)
without spending API credits. To use it:

1. In `.env`, set `OPENAI_BASE_URL=http://localhost:4001/v1` and any dummy `OPENAI_API_KEY`.
2. Run `node mock-llm.js` in one terminal, and `npm start` in another.
3. Submit feedback, then click "Run Agent Now" in the admin dashboard.

## Architecture

- `server.js` - Backend with Express, AI agent loop, and admin API
- `public/` - Static website files (HTML, CSS, JS)
- `data/` - Feedback and history JSON files
- `versions/` - Backups of source files before each agent modification

## Automatic deploys

The Netlify site is linked to this repository's `main` branch with a deploy key.
Every commit pushed by the agent triggers a production deploy automatically.
