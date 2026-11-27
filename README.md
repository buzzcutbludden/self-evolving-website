# Self-Evolving Website

A prototype of an autonomous website that improves itself based on visitor feedback.

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
