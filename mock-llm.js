// Mock OpenAI-compatible LLM server for end-to-end testing.
// Reads the real index.html, injects a green hero-title rule, returns it as an "AI change".
const http = require('http');
const fs = require('fs');

const PORT = 4001;
const INDEX = 'C:/Users/lucas/self-evolving-website/public/index.html';

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const result = {
        analysis: 'Visitor asked for a green hero title. Adding a CSS rule to change the hero h1 colour to green.',
        changes: [{
          file: 'public/index.html',
          description: 'Changed hero title colour to green per visitor feedback',
          patches: [{
            find: '<title>Self-Evolving Website</title>',
            replace: '<title>Self-Evolving Website</title>\n  <style>.hero h1 { color: #4ade80; }</style>'
          }]
        }]
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock', object: 'chat.completion', created: Date.now(), model: 'gpt-4o-mini',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(result) }, finish_reason: 'stop' }]
      }));
    });
  } else {
    res.writeHead(404); res.end();
  }
}).listen(PORT, () => console.log(`Mock LLM listening on ${PORT}`));
