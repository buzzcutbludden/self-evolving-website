// Shared helpers for the serverless agent. Uses only Node built-ins + global fetch.
const REPO = process.env.GITHUB_REPO || 'buzzcutbludden/self-evolving-website';
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com';
const SOURCE_FILES = ['public/index.html', 'public/admin.html', 'public/styles.css'];

function ghHeaders() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'self-evolving-website-agent',
    'Content-Type': 'application/json'
  };
}

async function gh(endpoint, options = {}) {
  if (!TOKEN) throw new Error('GITHUB_TOKEN is not configured');
  const res = await fetch(API + endpoint, {
    method: options.method || 'GET',
    headers: ghHeaders(),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`GitHub ${endpoint} -> ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function getFile(filePath) {
  try {
    const data = await gh(`/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`);
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function getJSON(filePath, fallback) {
  const text = await getFile(filePath);
  return text ? JSON.parse(text) : fallback;
}

// Commit many files in one commit using the Git Data API.
async function commitFiles(files, message) {
  const entries = Object.entries(files).filter(([, content]) => content != null);
  if (!entries.length) return null;

  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const parent = await gh(`/repos/${REPO}/git/commits/${ref.object.sha}`);
  const tree = [];

  for (const [filePath, content] of entries) {
    const blob = await gh(`/repos/${REPO}/git/blobs`, {
      method: 'POST',
      body: { content, encoding: 'utf-8' }
    });
    tree.push({ path: filePath.replace(/^\//, ''), mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await gh(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: { base_tree: parent.tree.sha, tree }
  });
  const commit = await gh(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [ref.object.sha] }
  });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: { sha: commit.sha }
  });
  return commit.sha;
}

function validateFile(filePath, content, original) {
  if (typeof content !== 'string' || content.length < 20) return 'File content is too short';
  if (filePath.endsWith('.css')) {
    const opens = (content.match(/\{/g) || []).length;
    const closes = (content.match(/\}/g) || []).length;
    if (opens !== closes) return 'CSS has unbalanced braces';
  }
  if (filePath.endsWith('.html')) {
    if (!/<html[\s>]/i.test(content) || !/<\/html>/i.test(content)) return 'HTML missing root element';
    if (!/<body[\s>]/i.test(content) || !/<\/body>/i.test(content)) return 'HTML missing body element';
  }

  // The agent may edit the site, but it must not replace it with a generic
  // template. Require every essential marker and most original lines to survive.
  const required = {
    'public/index.html': ['id="feedbackForm"', 'post-feedback', 'admin.html', 'class="hero"'],
    'public/admin.html': ['id="adminPanel"', 'x-admin-token', '/.netlify/functions/status', 'id="historyList"'],
    'public/styles.css': ['.hero', '.feedback-section', '.admin-layout']
  }[filePath] || [];
  for (const marker of required) {
    if (!content.includes(marker)) return `Removed required functionality (${marker})`;
  }

  if (original) {
    const originalLines = original.split('\n').map(l => l.trim()).filter(l => l.length > 12);
    const newLines = new Set(content.split('\n').map(l => l.trim()));
    const kept = originalLines.filter(l => newLines.has(l)).length;
    const ratio = originalLines.length ? kept / originalLines.length : 1;
    if (ratio < 0.7) return `Rewrote too much of the file (kept ${Math.round(ratio * 100)}% of original lines)`;
  }
  return null;
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) { try { return JSON.parse(match[1]); } catch {} }
  throw new Error('Could not parse JSON from LLM response');
}

async function setState(task, extra = {}) {
  const state = { currentTask: task, lastRun: new Date().toISOString(), ...extra };
  await commitFiles({ 'data/agent-state.json': JSON.stringify(state, null, 2) }, `agent: ${task}`);
  return state;
}

async function callLLM(prompt) {
  const base = (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not configured');

  const headers = {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.SITE_URL || 'https://self-evolving-website.netlify.app',
    'X-Title': 'Self-Evolving Website'
  };
  const payload = {
    model: process.env.OPENAI_MODEL || 'openai/gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' }
  };
  let res = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  // Some free models reject response_format; retry without it and parse tolerantly.
  if (res.status === 400) {
    delete payload.response_format;
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(payload)
    });
  }
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return extractJSON(data.choices[0].message.content);
}

async function runAgentCycle() {
  const feedback = await getJSON('data/feedback.json', []);
  const unprocessed = feedback.filter(f => f.status === 'new');

  if (!unprocessed.length) {
    await setState('No new feedback');
    return { deployed: 0, task: 'No new feedback' };
  }

  try {
    await setState(`Analyzing ${unprocessed.length} feedback items...`);

    const source = {};
    for (const filePath of SOURCE_FILES) {
      source[filePath] = await getFile(filePath);
    }

    const versionId = `v${Date.now()}`;
    const snapshot = {};
    for (const filePath of SOURCE_FILES) {
      snapshot[`versions/${versionId}/${filePath.split('/').pop()}`] = source[filePath];
    }

    const feedbackText = unprocessed
      .map(f => `[${f.category}] ${f.name || 'Anonymous'}: ${f.message}`)
      .join('\n');

    const prompt = `You are an autonomous web improvement agent. Analyze the visitor feedback and the current website source files. Decide what improvements would be beneficial and return the complete updated files.

Files: ${SOURCE_FILES.join(', ')}

Visitor feedback:
${feedbackText}

Respond with ONLY valid JSON:
{
  "analysis": "Brief summary of findings",
  "changes": [
    { "file": "public/index.html", "description": "What changed and why", "content": "Complete new file content" }
  ]
}

Only include files that need changes. Use the exact file paths listed above. Content must be valid for its file type.

CRITICAL: Preserve ALL existing sections, elements, styles and functionality verbatim. Make the smallest possible targeted edit for the feedback. Do NOT rewrite, simplify, replace or "improve" the overall design or content — the original markup, classes, IDs, form, dashboard and CSS rules must all remain intact. Return the full original file with only the requested change applied.`;

    await setState('Consulting AI...');
    const result = await callLLM(prompt);

    await setState('Testing changes in staging...');
    const staged = {};
    const errors = [];
    for (const change of (result.changes || [])) {
      const filePath = String(change.file || '').replace(/^\//, '');
      if (!SOURCE_FILES.includes(filePath)) continue;
      const error = validateFile(filePath, change.content, source[filePath]);
      if (error) { errors.push(`${filePath}: ${error}`); continue; }
      staged[filePath] = change.content;
    }

    if (!Object.keys(staged).length) {
      const task = `Validation failed: ${errors[0] || 'no valid changes proposed'}`;
      await setState(task);
      return { deployed: 0, task };
    }

    await setState('Deploying tested changes...');
    const history = await getJSON('data/history.json', []);
    const deployed = [];
    for (const [filePath, content] of Object.entries(staged)) {
      history.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        version: versionId,
        timestamp: new Date().toISOString(),
        action: 'improve',
        file: filePath,
        description: (result.changes.find(c => c.file === filePath) || {}).description || 'AI improvement',
        agentAnalysis: result.analysis
      });
      deployed.push(filePath);
    }

    const updatedFeedback = feedback.map(f => f.status === 'new' ? { ...f, status: 'processed' } : f);
    await commitFiles({
      ...Object.fromEntries(Object.entries(staged).map(([p, c]) => [p, c])),
      ...snapshot,
      'data/history.json': JSON.stringify(history, null, 2),
      'data/feedback.json': JSON.stringify(updatedFeedback, null, 2)
    }, `agent: improve ${deployed.join(', ')} (${versionId})`);

    const finalTask = `Deployed ${deployed.length} tested improvements`;
    await setState(finalTask, { version: versionId });
    return { deployed: deployed.length, task: finalTask, version: versionId };

  } catch (err) {
    await setState(`Error: ${err.message}`);
    throw err;
  }
}

async function rollbackTo(version) {
  const versionPath = `versions/${String(version).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!/^v\d+$/.test(versionPath.split('/').pop())) throw new Error('Invalid version id');

  const restored = {};
  for (const filePath of SOURCE_FILES) {
    const name = filePath.split('/').pop();
    const content = await getFile(`${versionPath}/${name}`);
    if (content != null) restored[filePath] = content;
  }
  if (!Object.keys(restored).length) throw new Error('Version not found');

  const history = await getJSON('data/history.json', []);
  history.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action: 'rollback',
    version: versionPath.split('/').pop(),
    description: `Rolled back to version ${versionPath.split('/').pop()}`
  });

  await commitFiles({ ...restored, 'data/history.json': JSON.stringify(history, null, 2) }, `agent: rollback to ${version}`);
  return { restored: Object.keys(restored) };
}

function response(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function requireAdmin(event) {
  const token = (event.headers && (event.headers['x-admin-token'] || event.headers['X-Admin-Token'])) ||
    (event.queryStringParameters && event.queryStringParameters.token);
  return token && token === process.env.ADMIN_TOKEN;
}

module.exports = {
  REPO, BRANCH, SOURCE_FILES, gh, getFile, getJSON, commitFiles, runAgentCycle, rollbackTo,
  response, requireAdmin, setState, validateFile
};
