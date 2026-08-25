// 从 todo.html 提取 /* PURE CORE START */ 与 /* PURE CORE END */ 之间的代码，
// 在 vm 沙箱中执行并导出（浏览器内同一块代码通过块尾的 module 判断导出）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'todo.html'), 'utf8');
const m = html.match(/\/\* PURE CORE START \*\/([\s\S]*?)\/\* PURE CORE END \*\//);
if (!m) { throw new Error('PURE CORE block not found in todo.html'); }
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(m[1], sandbox);
if (!Object.keys(sandbox.module.exports).length) { throw new Error('PURE CORE exported nothing'); }
module.exports = sandbox.module.exports;
