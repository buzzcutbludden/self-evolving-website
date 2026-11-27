// Local harness for exercising the Netlify Functions against the real GitHub repo.
// Usage: node test-harness.js <function> <METHOD> '<json body>'
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GITHUB_TOKEN = fs.readFileSync(path.join(os.homedir(), '.github-pat.txt'), 'utf8').trim();
process.env.GITHUB_REPO = process.env.GITHUB_REPO || 'buzzcutbludden/self-evolving-website';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'testtoken';
process.env.OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'http://localhost:4001/v1';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test';

const fn = process.argv[2];
const method = process.argv[3] || 'GET';
const body = process.argv[4] || '{}';
const handler = require(`./netlify/functions/${fn}`).handler;

handler({
  httpMethod: method,
  headers: { 'x-admin-token': 'testtoken', 'Content-Type': 'application/json' },
  body,
  queryStringParameters: {}
}).then(result => {
  console.log(`STATUS ${result.statusCode}`);
  console.log(result.body);
}).catch(err => {
  console.error('HARNESS ERROR:', err);
  process.exit(1);
});
