const fs = require('fs');
const { validateFile } = require('./netlify/functions/_lib.js');
const original = fs.readFileSync('public/index.html', 'utf8');
const minor = original.replace('</head>', '<style>.hero h1 { color: #4ade80; }</style>\n  </head>');
const destroyed = '<!DOCTYPE html><html><head><title>Home</title></head><body><h1>Welcome</h1><p>Now powered by OpenRouter.</p></body></html>';
console.log('minor edit:', validateFile('public/index.html', minor, original) || 'ACCEPTED');
console.log('destructive rewrite:', validateFile('public/index.html', destroyed, original) || 'ACCEPTED');
