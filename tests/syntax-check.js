const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'todo.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error('no <script> found'); process.exit(1); }
scripts.forEach((code, i) => {
  try { new Function(code); }
  catch (e) { console.error('script #' + i + ' syntax error: ' + e.message); process.exit(1); }
});
console.log('syntax OK (' + scripts.length + ' script block)');
