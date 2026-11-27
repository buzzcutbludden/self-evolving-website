require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const VERSIONS_DIR = path.join(__dirname, 'versions');
const SOURCE_FILES = ['index.html', 'admin.html', 'styles.css'];
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme';

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
}

async function initDataFiles() {
  const feedbackPath = path.join(DATA_DIR, 'feedback.json');
  const historyPath = path.join(DATA_DIR, 'history.json');
  try { await fs.access(feedbackPath); } catch { await fs.writeFile(feedbackPath, JSON.stringify([], null, 2)); }
  try { await fs.access(historyPath); } catch { await fs.writeFile(historyPath, JSON.stringify([], null, 2)); }
}

async function readJSON(file) {
  const content = await fs.readFile(file, 'utf-8');
  return JSON.parse(content);
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function extractJSON(text) {
  try { return JSON.parse(text); }
  catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); }
    catch {}
  }
  throw new Error('Could not parse JSON from LLM response');
}

function validateFile(file, content) {
  if (typeof content !== 'string' || content.length < 20) return 'File content is too short';
  if (file.endsWith('.css')) {
    const opens = (content.match(/\{/g) || []).length;
    const closes = (content.match(/\}/g) || []).length;
    if (opens !== closes) return 'CSS has unbalanced braces';
  }
  if (file.endsWith('.html')) {
    if (!/<html[\s>]/i.test(content) || !/<\/html>/i.test(content)) return 'HTML missing root element';
    if (!/<body[\s>]/i.test(content) || !/<\/body>/i.test(content)) return 'HTML missing body element';
  }
  return null;
}

let agentRunning = false;
let lastRunTime = null;
let agentTask = 'Idle';

async function runAgentCycle() {
  if (agentRunning) return;
  agentRunning = true;
  agentTask = 'Reading feedback...';
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      agentTask = 'Missing OPENAI_API_KEY';
      return;
    }
    
    const feedbacks = await readJSON(path.join(DATA_DIR, 'feedback.json'));
    const unprocessed = feedbacks.filter(f => f.status === 'new');
    
    if (unprocessed.length === 0) {
      agentTask = 'No new feedback';
      return;
    }
    
    agentTask = `Analyzing ${unprocessed.length} feedback items...`;
    
    const files = {};
    for (const file of SOURCE_FILES) {
      try {
        files[file] = await fs.readFile(path.join(PUBLIC_DIR, file), 'utf-8');
      } catch (e) {
        console.error(`Could not read ${file}:`, e);
      }
    }
    
    const versionId = `v${Date.now()}`;
    const versionPath = path.join(VERSIONS_DIR, versionId);
    await fs.mkdir(versionPath, { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      await fs.writeFile(path.join(versionPath, file), content);
    }
    
    const feedbackText = unprocessed.map(f => 
      `[${f.category}] ${f.name || 'Anonymous'}: ${f.message}`
    ).join('\n');
    
    const prompt = `You are an autonomous web improvement agent. Analyze the following visitor feedback and the current website source code. Determine what improvements would be beneficial and provide the complete updated files.

Current source files: ${Object.keys(files).join(', ')}

Visitor feedback:
${feedbackText}

Respond with ONLY valid JSON (no markdown, no extra text):
{
  "analysis": "Brief summary of what you found and what you plan to improve",
  "changes": [
    {
      "file": "index.html",
      "description": "Brief explanation of what changed and why",
      "content": "Complete new file content"
    }
  ]
}

Only include files that need changes. Ensure the content is valid for its file type.`;

    agentTask = 'Consulting AI...';
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined
    });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });
    
    const result = extractJSON(completion.choices[0].message.content);
    
    agentTask = 'Testing changes in staging...';
    const stagingDir = path.join(DATA_DIR, 'staging');
    await fs.mkdir(stagingDir, { recursive: true });
    
    const validatedChanges = [];
    for (const change of (result.changes || [])) {
      if (!SOURCE_FILES.includes(change.file)) continue;
      const targetPath = path.join(PUBLIC_DIR, change.file);
      if (!targetPath.startsWith(PUBLIC_DIR)) continue;
      
      const error = validateFile(change.file, change.content);
      if (error) {
        console.error(`Validation failed for ${change.file}: ${error}`);
        continue;
      }
      
      await fs.writeFile(path.join(stagingDir, change.file), change.content);
      validatedChanges.push(change);
    }
    
    agentTask = 'Deploying tested changes...';
    const history = await readJSON(path.join(DATA_DIR, 'history.json'));
    const changedFiles = [];
    
    for (const change of validatedChanges) {
      await fs.copyFile(path.join(stagingDir, change.file), path.join(PUBLIC_DIR, change.file));
      changedFiles.push(change.file);
      
      history.push({
        id: uuidv4(),
        version: versionId,
        timestamp: new Date().toISOString(),
        action: 'improve',
        file: change.file,
        description: change.description,
        agentAnalysis: result.analysis
      });
    }
    
    await writeJSON(path.join(DATA_DIR, 'history.json'), history);
    
    const allFeedbacks = await readJSON(path.join(DATA_DIR, 'feedback.json'));
    for (const f of allFeedbacks) {
      if (f.status === 'new') f.status = 'processed';
    }
    await writeJSON(path.join(DATA_DIR, 'feedback.json'), allFeedbacks);
    
    lastRunTime = new Date().toISOString();
    agentTask = `Deployed ${changedFiles.length} tested improvements`;
    
  } catch (error) {
    console.error('Agent cycle failed:', error);
    agentTask = `Error: ${error.message}`;
  } finally {
    agentRunning = false;
  }
}

app.get('/api/agent/status', requireAdmin, async (req, res) => {
  const history = await readJSON(path.join(DATA_DIR, 'history.json'));
  const feedbacks = await readJSON(path.join(DATA_DIR, 'feedback.json'));
  const unprocessed = feedbacks.filter(f => f.status === 'new').length;
  res.json({
    running: agentRunning,
    lastRun: lastRunTime,
    totalImprovements: history.filter(h => h.action === 'improve').length,
    unprocessedFeedback: unprocessed,
    currentTask: agentTask
  });
});

app.get('/api/agent/history', requireAdmin, async (req, res) => {
  const history = await readJSON(path.join(DATA_DIR, 'history.json'));
  res.json(history.reverse());
});

app.post('/api/agent/improve', requireAdmin, async (req, res) => {
  res.json({ success: true, message: 'Improvement cycle triggered' });
  runAgentCycle();
});

app.post('/api/agent/rollback', requireAdmin, async (req, res) => {
  const { version } = req.body;
  const versionPath = path.join(VERSIONS_DIR, version);
  try { await fs.access(versionPath); } catch { return res.status(404).json({ error: 'Version not found' }); }
  
  const files = await fs.readdir(versionPath);
  for (const file of files) {
    const content = await fs.readFile(path.join(versionPath, file), 'utf-8');
    await fs.writeFile(path.join(PUBLIC_DIR, file), content);
  }
  
  const history = await readJSON(path.join(DATA_DIR, 'history.json'));
  history.push({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    action: 'rollback',
    version: version,
    description: `Rolled back to version ${version}`
  });
  await writeJSON(path.join(DATA_DIR, 'history.json'), history);
  res.json({ success: true });
});

app.get('/api/agent/versions', requireAdmin, async (req, res) => {
  const versions = await fs.readdir(VERSIONS_DIR).catch(() => []);
  res.json(versions.reverse());
});

app.get('/api/feedback', requireAdmin, async (req, res) => {
  const data = await readJSON(path.join(DATA_DIR, 'feedback.json'));
  res.json(data);
});

app.post('/api/feedback', async (req, res) => {
  const { name, email, category, message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  
  const feedback = {
    id: uuidv4(),
    name: name || 'Anonymous',
    email: email || '',
    category: category || 'general',
    message,
    timestamp: new Date().toISOString(),
    status: 'new'
  };
  
  const feedbacks = await readJSON(path.join(DATA_DIR, 'feedback.json'));
  feedbacks.push(feedback);
  await writeJSON(path.join(DATA_DIR, 'feedback.json'), feedbacks);
  res.json({ success: true, id: feedback.id });
});

ensureDirs().then(initDataFiles).then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
    const interval = parseInt(process.env.AGENT_INTERVAL || '600000');
    setInterval(runAgentCycle, interval);
    setTimeout(runAgentCycle, 30000);
  });
});
