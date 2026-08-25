# 离线单页待办管理工具 todo.html · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建单文件零依赖离线待办管理网页 `todo.html`，实现设计文档中的全部 19 项功能规格（今日工作流、聚焦计时、休息提醒、跨天归档、导入导出备份等）。

**Architecture:** 单 HTML 文件，内联一个 `<script>`。脚本分两层：**纯函数核心**（位于 `/* PURE CORE START */` 与 `/* PURE CORE END */` 注记之间，不接触 DOM/localStorage，可被 Node 测试提取执行）与 **DOM 层**（store、渲染、事件）。状态为单一 JSON 对象存 localStorage 键 `todoApp.v1`，每次变更调用 `save()`。

**Tech Stack:** 原生 HTML/CSS/JS（无任何库、无构建）。测试用 Node 内置能力（`assert` 不需要，用自写微型 harness）+ `vm` 模块提取纯函数。

**Spec:** `docs/superpowers/specs/2026-08-26-offline-todo-design.md`（本计划从该文档出发，执行者需同时阅读 spec）

## Global Constraints

- 目标环境：Windows + Edge/Chrome，`file://` 协议打开，**完全离线**。禁止：外部资源引用（CDN/字体/图标库）、ES modules（`import/export`）、`fetch`/`XHR`
- 单文件交付：所有 HTML/CSS/JS 内联于仓库根目录 `todo.html`
- localStorage 键名 `todoApp.v1`；日期一律本地时区字符串 `YYYY-MM-DD`；时间戳为毫秒整数
- 所有 UI 文案为中文；spec 中逐字给出的文案必须原样使用（如休息提醒「站起来动动老胳膊老腿！！！」）
- 纯函数必须整体位于 `/* PURE CORE START */` 与 `/* PURE CORE END */` 之间，不得引用 `document`/`window`/`localStorage`
- 测试命令：`node tests/core.test.js`（纯函数断言）、`node tests/syntax-check.js`（全脚本语法检查）；不得引入任何 npm 依赖
- 每个任务完成即 `git commit`（消息见各任务末步）
- 视觉遵循 spec §6：浅色为主+三态主题、卡片圆角 12px、accent `#4F6DF5`、字体 `"Segoe UI", system-ui`、计时数字 `tabular-nums`、动效 150–250ms

## 文件结构

| 文件 | 职责 |
|---|---|
| `todo.html` | 唯一交付物。`<style>`（CSS 变量主题+全部样式）→ `<body>`（静态骨架+弹窗）→ 单个 `<script>`（纯函数核心 + store + 渲染 + 事件） |
| `tests/extract.js` | 从 todo.html 抽出 PURE CORE 块，vm 执行后 `module.exports` 纯函数集合 |
| `tests/core.test.js` | 纯函数断言测试（自写 harness，`process.exit(failed?1:0)`） |
| `tests/syntax-check.js` | 抽出全部 `<script>` 内容用 `new Function` 做语法检查 |

**贯穿全程的命名约定**（所有任务共享，后文不再重复解释）：

- 纯核心函数：`todayStr`, `formatDuration`, `genId`, `computeProgress`, `defaultState`, `rollover`, `formatTasksAsText`, `parseBulkText`, `buildDailySummary`, `checkMinLine`, `settleFocusSession`, `deepClone`
- DOM 层：`state`（全局状态对象）、`save()`（写 localStorage + `renderAll()` + `scheduleBackup()`，一切变更经它）、`currentView`（`'today'|'done'|'history'`）、`showView(name)`、`renderAll()`、`renderTopbar()`、`renderChips()`、`renderToday()`、`renderDone()`、`renderHistory()`、`buildTaskCard(task)`、`showToast(msg)`、`copyText(text)`
- 任务对象字段（spec §2）：`id, text, zone('inbox'|'doing'|'done'), labels[], subtasks[{id,text,done}], focusMs, focusMsToday, minLine, minLineMet, rolledOver, createdAt, completedAt`

---

### Task 1: 脚手架、测试提取机制与基础纯函数

**Files:**
- Create: `todo.html`
- Create: `tests/extract.js`
- Create: `tests/core.test.js`
- Create: `tests/syntax-check.js`

**Interfaces:**
- Produces: `todo.html` 骨架（空 body + 单 script 含 PURE CORE 标记）；纯函数 `todayStr(now: Date|number): string`、`formatDuration(ms: number): string`、`genId(now?: number): string`、`computeProgress(tasks): {done,total,pct}`、`defaultState(now?: number): State`、`deepClone(obj)`；`tests/extract.js` 导出这些函数（`require('./extract')`）
- 后续所有纯函数任务向 PURE CORE 块内追加函数，并在测试文件追加用例

- [ ] **Step 1: 写失败测试与提取脚本**

`tests/extract.js`：

```js
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
```

`tests/core.test.js`（微型 harness + 本任务用例）：

```js
const core = require('./extract');
let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ok ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n    ' + e.message); }
}
function eq(actual, expected, msg) {
  const ja = JSON.stringify(actual), je = JSON.stringify(expected);
  if (ja !== je) throw new Error((msg || '') + ' want=' + je + ' got=' + ja);
}

t('todayStr 本地时区 YYYY-MM-DD', () => {
  eq(core.todayStr(new Date(2026, 7, 26, 23, 59)), '2026-08-26');
  eq(core.todayStr(new Date(2026, 0, 2, 0, 0)), '2026-01-02');
});
t('formatDuration 不足1小时省略小时段', () => {
  eq(core.formatDuration(0), '0min');
  eq(core.formatDuration(23 * 60000), '23min');
});
t('formatDuration 超一小时 Xh YYmin', () => {
  eq(core.formatDuration(83 * 60000), '1h 23min');
  eq(core.formatDuration(3600000), '1h 0min');
});
t('computeProgress 完成占比', () => {
  eq(core.computeProgress([{zone:'done'},{zone:'inbox'},{zone:'done'},{zone:'doing'}]), {done:2,total:4,pct:50});
});
t('computeProgress 空列表', () => {
  eq(core.computeProgress([]), {done:0,total:0,pct:0});
});
t('defaultState 含8个预设标签与默认参数', () => {
  const s = core.defaultState(0);
  eq(s.settings.labels.length, 8);
  eq(s.settings.labels[0], {name:'AI处理', color:'#7C5CFF'});
  eq(s.settings.maxDoing, 2);
  eq(s.settings.focusRemindMin, 45);
  eq(s.settings.restMin, 5);
  eq(s.tasks, []); eq(s.history, []); eq(s.focusSession, null);
});
t('genId 格式且不重复', () => {
  const a = core.genId(1000), b = core.genId(1000);
  if (!/^t_\d+_\d+$/.test(a)) throw new Error('bad id format: ' + a);
  if (a === b) throw new Error('ids not unique');
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
```

`tests/syntax-check.js`：

```js
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
```

- [ ] **Step 2: 运行验证失败**

Run: `node tests/core.test.js`
Expected: FAIL —— `PURE CORE block not found in todo.html`（todo.html 尚不存在或无标记）

- [ ] **Step 3: 写 todo.html 骨架与最小实现**

`todo.html`（本任务先立骨架；Task 5 再填充 HTML/CSS）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>今日待办</title>
<style>
/* Task 5 起填充 */
</style>
</head>
<body>
<div id="app"></div>
<div id="toast" class="toast"></div>
<script>
/* PURE CORE START */
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function todayStr(now) {
  const d = (now instanceof Date) ? now : new Date(now);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatDuration(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  const h = Math.floor(min / 60);
  return h > 0 ? (h + 'h ' + (min % 60) + 'min') : (min + 'min');
}

let __idCounter = 0;
function genId(now) {
  return 't_' + (now || Date.now()) + '_' + (++__idCounter) + String(Math.random() * 1e6 | 0);
}

function computeProgress(tasks) {
  const total = tasks.length;
  const done = tasks.filter(function (t) { return t.zone === 'done'; }).length;
  return { done: done, total: total, pct: total ? Math.round(done * 100 / total) : 0 };
}

function defaultState(now) {
  now = now || Date.now();
  return {
    version: 1,
    lastActiveDate: todayStr(now),
    tasks: [],
    todayFocusMs: 0,
    focusSession: null,
    history: [],
    settings: {
      theme: 'auto',
      labels: [
        { name: 'AI处理', color: '#7C5CFF' }, { name: '抛球', color: '#F59E0B' },
        { name: '脚本', color: '#5B8DEF' },   { name: '时效', color: '#EF4444' },
        { name: '等回复', color: '#94A3B8' }, { name: '无脑', color: '#10B981' },
        { name: '深度', color: '#1E293B' },   { name: '沟通', color: '#EC4899' }
      ],
      dailyFixed: [],
      maxDoing: 2,
      focusRemindMin: 45,
      restMin: 5,
      autoBackup: { enabled: false, lastBackupAt: null }
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deepClone, todayStr, formatDuration, genId, computeProgress, defaultState };
}
/* PURE CORE END */

/* DOM 层：Task 5 起填充 */
</script>
</body>
</html>
```

- [ ] **Step 4: 运行测试通过**

Run: `node tests/core.test.js` → `7 passed, 0 failed`；Run: `node tests/syntax-check.js` → `syntax OK (1 script block)`

- [ ] **Step 5: Commit**

```bash
git add todo.html tests/
git commit -m "feat: 单文件骨架与测试提取机制、基础纯函数(todayStr/formatDuration/progress/defaultState)"
```

---

### Task 2: 跨天引擎 rollover（纯函数）

**Files:**
- Modify: `todo.html`（PURE CORE 块内 `defaultState` 之后追加）
- Modify: `tests/core.test.js`（文件末尾 `console.log` 汇总行之前追加用例）

**Interfaces:**
- Consumes: Task 1 的 `deepClone/todayStr/genId`
- Produces: `rollover(state, now: Date|number) → {state, changed}` —— 纯函数；同日返回 `{state, changed:false}` 原对象；跨日返回全新 state。Task 12 的 DOM 接线将调用它

- [ ] **Step 1: 追加失败测试**

在 `tests/core.test.js` 的汇总行前追加（并新增两个文件级 helper，放在 harness 定义之后）：

```js
// ---- helpers ----
function mkState(opts) { const s = core.defaultState(0); return Object.assign(s, opts); }
function mkTask(zone, text, extra) {
  return Object.assign({ id: core.genId(1), text: text, zone: zone, labels: [], subtasks: [],
    focusMs: 0, focusMsToday: 0, minLine: null, minLineMet: false, rolledOver: false,
    createdAt: 1, completedAt: null }, extra || {});
}
function by(st, txt) { return st.tasks.find(t => t.text === txt); }

// ---- Task 2: rollover ----
t('同日不触发', () => {
  const s = mkState({ lastActiveDate: '2026-08-26' });
  const r = core.rollover(s, new Date(2026, 7, 26, 10, 0));
  eq(r.changed, false);
});
t('昨日done归档、未完成滚入inbox并清理当日字段', () => {
  const s = mkState({ lastActiveDate: '2026-08-25', todayFocusMs: 60000, tasks: [
    mkTask('done', 'A', { completedAt: 5 }),
    mkTask('inbox', 'B', { minLine: { type: 'focus', minutes: 30 }, focusMsToday: 120000 }),
    mkTask('doing', 'C', { focusMs: 300000 })
  ]});
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.changed, true);
  eq(r.state.history.length, 1);
  eq(r.state.history[0].date, '2026-08-25');
  eq(r.state.history[0].focusMs, 60000);
  eq(r.state.history[0].tasks.map(x => x.text), ['A']);
  eq(r.state.tasks.map(x => x.text).sort(), ['B', 'C']);
  eq(r.state.tasks.every(x => x.zone === 'inbox' && x.rolledOver === true), true);
  eq(by(r.state, 'B').minLine, null);
  eq(by(r.state, 'B').focusMsToday, 0);
  eq(by(r.state, 'C').focusMs, 300000);
  eq(r.state.todayFocusMs, 0);
  eq(r.state.lastActiveDate, '2026-08-26');
});
t('每日固定事项注入且按文本去重', () => {
  const s = mkState({ lastActiveDate: '2026-08-25', tasks: [mkTask('inbox', '日报')],
    settings: Object.assign(core.defaultState(0).settings, { dailyFixed: [
      { text: '日报', labels: ['无脑'], subtasks: [] },
      { text: '晨间回顾', labels: ['深度'], subtasks: [{ text: '过一遍昨日遗留', done: false }] }
    ]}) });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.state.tasks.filter(x => x.text === '日报').length, 1);   // 已存在不重复注入
  const fx = by(r.state, '晨间回顾');
  eq(fx.zone, 'inbox'); eq(fx.labels, ['深度']);
  eq(fx.subtasks, [{ text: '过一遍昨日遗留', done: false }]);
});
t('聚焦会话跨天：已聚焦时长入昨日归档、会话延续到今天', () => {
  const task = mkTask('doing', 'A');
  const startAt = new Date(2026, 7, 25, 23, 0).getTime();
  const now = new Date(2026, 7, 26, 9, 0);
  const s = mkState({ lastActiveDate: '2026-08-25', todayFocusMs: 600000,
    tasks: [task], focusSession: { taskId: task.id, startAt: startAt } });
  const r = core.rollover(s, now);
  eq(r.state.history[0].focusMs, 600000 + 10 * 3600000);        // 10h 会话时长计入昨日
  eq(r.state.focusSession.taskId, task.id);
  eq(r.state.focusSession.startAt, now.getTime());               // 会话起点重置为现在
  eq(r.state.todayFocusMs, 0);
});
t('多天空缺一次性合并，只为最后活跃日建条目、中间空日不建', () => {
  const s = mkState({ lastActiveDate: '2026-08-20', tasks: [mkTask('done', 'A', { completedAt: 5 }), mkTask('inbox', 'B')] });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.state.history.length, 1);              // 只有 8-20 一条，8-21..8-25 不生成
  eq(r.state.history[0].date, '2026-08-20');
  eq(r.state.history[0].tasks.map(x => x.text), ['A']);
  eq(by(r.state, 'B').zone, 'inbox');
});
t('昨日无完成且无聚焦不生成空历史条目', () => {
  const s = mkState({ lastActiveDate: '2026-08-25', tasks: [mkTask('inbox', 'B')] });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.state.history.length, 0);
});
```

- [ ] **Step 2: 运行验证失败**

Run: `node tests/core.test.js` → 新增 6 条 FAIL（`core.rollover is not a function`）

- [ ] **Step 3: 实现 rollover**

PURE CORE 内（`defaultState` 之后、导出块之前；导出块加入 `rollover`）：

```js
function rollover(state, now) {
  const nowMs = (now instanceof Date) ? now.getTime() : now;
  const today = todayStr(nowMs);
  if (state.lastActiveDate === today) return { state: state, changed: false };
  const next = deepClone(state);
  // 1) 归档：聚焦会话截至此刻的时长计入昨日（会话本身延续，起点重置为现在）
  let archivedFocusMs = next.todayFocusMs;
  if (next.focusSession) {
    archivedFocusMs += Math.max(0, nowMs - next.focusSession.startAt);
    next.focusSession = { taskId: next.focusSession.taskId, startAt: nowMs };
  }
  const doneTasks = next.tasks.filter(t => t.zone === 'done');
  if (doneTasks.length > 0 || archivedFocusMs > 0) {
    const entry = next.history.find(h => h.date === next.lastActiveDate);
    if (entry) { entry.focusMs += archivedFocusMs; entry.tasks = entry.tasks.concat(doneTasks); }
    else next.history.unshift({ date: next.lastActiveDate, focusMs: archivedFocusMs, tasks: doneTasks });
    next.history.sort((a, b) => b.date.localeCompare(a.date));
  }
  // 2) 未完成滚入今日 inbox：清当日字段，保留累计 focusMs/标签/子任务
  next.tasks = next.tasks.filter(t => t.zone !== 'done').map(t => Object.assign({}, t, {
    zone: 'inbox', rolledOver: true, focusMsToday: 0, minLine: null, minLineMet: false, completedAt: null
  }));
  // 3) 注入每日固定事项（与今日已有事项按文本去重）
  next.settings.dailyFixed.forEach(f => {
    if (next.tasks.some(t => t.text === f.text)) return;
    next.tasks.push({ id: genId(nowMs), text: f.text, zone: 'inbox',
      labels: (f.labels || []).slice(), subtasks: (f.subtasks || []).map(s => ({ text: s.text, done: false })),
      focusMs: 0, focusMsToday: 0, minLine: null, minLineMet: false, rolledOver: false,
      createdAt: nowMs, completedAt: null });
  });
  // 4) 重置
  next.todayFocusMs = 0;
  next.lastActiveDate = today;
  return { state: next, changed: true };
}
```

同步更新导出块：`module.exports = { deepClone, todayStr, formatDuration, genId, computeProgress, defaultState, rollover };`

- [ ] **Step 4: 运行测试通过**

Run: `node tests/core.test.js` → `13 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add todo.html tests/core.test.js
git commit -m "feat: 跨天引擎 rollover（归档/滚入/固定事项注入/会话跨天/多天合并）"
```

---

### Task 3: 复制格式与批量添加解析（纯函数）

**Files:**
- Modify: `todo.html`（PURE CORE 内追加，导出块加两个函数）
- Modify: `tests/core.test.js`

**Interfaces:**
- Produces: `formatTasksAsText(tasks: Task[]) → string`（spec §5.5 格式）；`parseBulkText(text: string) → Array<{text, labels: string[], subtasks: Array<{text, done}>, done: boolean}>`。Task 15 的复制按钮/批量添加 UI 消费

- [ ] **Step 1: 追加失败测试**

```js
// ---- Task 3: 复制格式与批量解析 ----
t('格式化：完成态前缀/标签#/缩进子任务', () => {
  const tasks = [
    mkTask('inbox', 'MySQL 压测', { labels: ['脚本', '时效'], subtasks: [
      { id: 's1', text: '建表造数', done: false }, { id: 's2', text: '跑压测', done: true }] })
  ];
  eq(core.formatTasksAsText(tasks),
    '[ ] MySQL 压测  #脚本 #时效\n    [ ] 建表造数\n    [x] 跑压测');
});
t('格式化：完成事项为 [x]', () => {
  eq(core.formatTasksAsText([mkTask('done', 'A', { labels: ['沟通'] })]), '[x] A  #沟通');
});
t('解析：普通多行每行一事', () => {
  eq(core.parseBulkText('任务A\n任务B'), [
    { text: '任务A', labels: [], subtasks: [], done: false },
    { text: '任务B', labels: [], subtasks: [], done: false }]);
});
t('解析：剥离 - [ ] / [x] 前缀，[x] 视为完成', () => {
  const r = core.parseBulkText('- [ ] 任务A\n- [x] 任务B');
  eq(r[0], { text: '任务A', labels: [], subtasks: [], done: false });
  eq(r[1].done, true);
});
t('解析：复制格式完整恢复（round-trip）', () => {
  const text = '[ ] MySQL 压测  #脚本 #时效\n    [ ] 建表造数\n    [x] 跑压测\n[x] 回复 XXX  #沟通';
  const r = core.parseBulkText(text);
  eq(r[0], { text: 'MySQL 压测', labels: ['脚本', '时效'],
    subtasks: [{ text: '建表造数', done: false }, { text: '跑压测', done: true }], done: false });
  eq(r[1], { text: '回复 XXX', labels: ['沟通'], subtasks: [], done: true });
});
t('解析：空行跳过；无前置任务的缩进行按独立事项', () => {
  const r = core.parseBulkText('\n  孤行\n');
  eq(r.length, 1); eq(r[0].text, '孤行');
});
t('解析：重复标签去重', () => {
  const r = core.parseBulkText('A #脚本 #脚本');
  eq(r[0].labels, ['脚本']);
});
```

- [ ] **Step 2: 运行验证失败**

Run: `node tests/core.test.js` → 新增用例 FAIL

- [ ] **Step 3: 实现两个函数**

```js
function formatTasksAsText(tasks) {
  return tasks.map(t => {
    let line = (t.zone === 'done' ? '[x] ' : '[ ] ') + t.text;
    if (t.labels && t.labels.length) line += '  ' + t.labels.map(l => '#' + l).join(' ');
    return [line].concat((t.subtasks || []).map(s => '    ' + (s.done ? '[x] ' : '[ ] ') + s.text)).join('\n');
  }).join('\n');
}

function parseBulkText(text) {
  const out = [];
  String(text || '').split(/\r?\n/).forEach(raw => {
    if (!raw.trim()) return;
    const indented = /^[ \t]/.test(raw);
    const line = raw.trim();
    let done = false, body = line;
    const m = line.match(/^-\s*\[( |x|X)\]\s*(.*)$/) || line.match(/^\[( |x|X)\]\s*(.*)$/);
    if (m) { done = m[1].toLowerCase() === 'x'; body = m[2]; }
    const labels = [];
    body = body.replace(/#([^\s#]+)/g, (_, name) => { if (!labels.includes(name)) labels.push(name); return ''; })
      .replace(/\s{2,}/g, ' ').trim();
    if (indented && out.length > 0) out[out.length - 1].subtasks.push({ text: body, done: done });
    else out.push({ text: body, labels: labels, subtasks: [], done: done });
  });
  return out;
}
```

- [ ] **Step 4: 运行测试通过**

Run: `node tests/core.test.js` → `20 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add todo.html tests/core.test.js
git commit -m "feat: 复制格式生成与批量添加解析（前缀剥离/#标签/缩进子任务 round-trip）"
```

---

### Task 4: 收尾总结、最低完成线判定与聚焦结算（纯函数）

**Files:**
- Modify: `todo.html`（PURE CORE 内追加，导出块加三个函数）
- Modify: `tests/core.test.js`

**Interfaces:**
- Produces: `buildDailySummary(tasks, todayFocusMs, dateStr) → string`（spec §5.9 格式，空节省略）；`checkMinLine(task) → task'`（达标则 `minLineMet=true` 的浅拷贝）；`settleFocusSession(state, nowMs) → {state, sessionMs, needRest}`。Task 8/9/11/18 的 UI 消费

- [ ] **Step 1: 追加失败测试**

```js
// ---- Task 4 ----
t('收尾总结完整格式', () => {
  const tasks = [
    mkTask('done', 'MySQL 压测', { subtasks: [
      { id: '1', text: '建表造数', done: true }, { id: '2', text: '跑压测', done: true }] }),
    mkTask('done', '监控脚本'),
    mkTask('inbox', '整理监控结论'),
    mkTask('doing', 'Hermes 排查')
  ];
  eq(core.buildDailySummary(tasks, 4980000, '2026-08-26'),
`2026-08-26
聚焦总时长：1h 23min

完成 2 项
遗留 1 项
正在处理 1 项

今天完成：
✓ MySQL 压测
    ✓ 建表造数
    ✓ 跑压测
✓ 监控脚本

遗留：
→ 整理监控结论

正在处理：
→ Hermes 排查`);
});
t('收尾总结：空节省略、无小时段时长', () => {
  const tasks = [mkTask('done', 'A'), mkTask('inbox', 'B')];
  eq(core.buildDailySummary(tasks, 1200000, '2026-08-26'),
`2026-08-26
聚焦总时长：20min

完成 1 项
遗留 1 项
正在处理 0 项

今天完成：
✓ A

遗留：
→ B`);
});
t('checkMinLine：focus 型按当日聚焦达成', () => {
  eq(core.checkMinLine(mkTask('doing', 'A', { minLine: { type: 'focus', minutes: 30 }, focusMsToday: 1800000 })).minLineMet, true);
  eq(core.checkMinLine(mkTask('doing', 'A', { minLine: { type: 'focus', minutes: 30 }, focusMsToday: 1799999 })).minLineMet, false);
});
t('checkMinLine：subtask 型按已勾选总数达成', () => {
  const t1 = mkTask('doing', 'A', { minLine: { type: 'subtask', count: 1 },
    subtasks: [{ id: '1', text: 'x', done: true }, { id: '2', text: 'y', done: false }] });
  eq(core.checkMinLine(t1).minLineMet, true);
});
t('checkMinLine：已绿不再计算、未设置返回原对象语义', () => {
  const t1 = mkTask('doing', 'A', { minLine: { type: 'focus', minutes: 30 }, minLineMet: true, focusMsToday: 0 });
  eq(core.checkMinLine(t1).minLineMet, true);
  eq(core.checkMinLine(mkTask('inbox', 'B')).minLineMet, false);
});
t('settleFocusSession：累计到事项与今日总量并触发min-line', () => {
  const task = mkTask('doing', 'A', { minLine: { type: 'focus', minutes: 30 } });
  const s = mkState({ tasks: [task], todayFocusMs: 60000, focusSession: { taskId: task.id, startAt: 1000000 } });
  const r = core.settleFocusSession(s, 1000000 + 1800000);   // 会话30min
  eq(r.state.focusSession, null);
  eq(r.state.tasks[0].focusMs, 1800000);
  eq(r.state.tasks[0].focusMsToday, 1800000);
  eq(r.state.todayFocusMs, 1860000);
  eq(r.state.tasks[0].minLineMet, true);
  eq(r.needRest, false);   // 30 < 45
});
t('settleFocusSession：达到提醒阈值', () => {
  const task = mkTask('doing', 'A');
  const s = mkState({ tasks: [task], focusSession: { taskId: task.id, startAt: 0 } });
  const r = core.settleFocusSession(s, 46 * 60000);
  eq(r.needRest, true); eq(r.sessionMs, 46 * 60000);
});
t('settleFocusSession：无会话/事项已删仍安全', () => {
  const s0 = mkState({});
  eq(core.settleFocusSession(s0, 100).state.todayFocusMs, 0);
  const s1 = mkState({ todayFocusMs: 0, focusSession: { taskId: 'ghost', startAt: 0 } });
  const r1 = core.settleFocusSession(s1, 60000);
  eq(r1.state.todayFocusMs, 60000); eq(r1.state.tasks, []);
});
```

- [ ] **Step 2: 运行验证失败**

Run: `node tests/core.test.js` → 新增用例 FAIL

- [ ] **Step 3: 实现三个函数**

```js
function buildDailySummary(tasks, todayFocusMs, dateStr) {
  const done = tasks.filter(t => t.zone === 'done');
  const leftover = tasks.filter(t => t.zone === 'inbox');
  const doing = tasks.filter(t => t.zone === 'doing');
  let s = dateStr + '\n聚焦总时长：' + formatDuration(todayFocusMs) + '\n\n';
  s += '完成 ' + done.length + ' 项\n';
  s += '遗留 ' + leftover.length + ' 项\n';
  s += '正在处理 ' + doing.length + ' 项\n';
  if (done.length) {
    s += '\n今天完成：\n' + done.map(t =>
      '✓ ' + t.text + (t.subtasks || []).filter(x => x.done).map(x => '\n    ✓ ' + x.text).join('')
    ).join('\n') + '\n';
  }
  if (leftover.length) s += '\n遗留：\n' + leftover.map(t => '→ ' + t.text).join('\n') + '\n';
  if (doing.length) s += '\n正在处理：\n' + doing.map(t => '→ ' + t.text).join('\n') + '\n';
  return s.replace(/\n+$/, '');
}

function checkMinLine(task) {
  if (!task.minLine || task.minLineMet) return task;
  if (task.minLine.type === 'focus' && task.focusMsToday >= task.minLine.minutes * 60000)
    return Object.assign({}, task, { minLineMet: true });
  if (task.minLine.type === 'subtask' &&
      (task.subtasks || []).filter(s => s.done).length >= task.minLine.count)
    return Object.assign({}, task, { minLineMet: true });
  return task;
}

function settleFocusSession(state, nowMs) {
  if (!state.focusSession) return { state: state, sessionMs: 0, needRest: false };
  const sessionMs = Math.max(0, nowMs - state.focusSession.startAt);
  const next = deepClone(state);
  const idx = next.tasks.findIndex(t => t.id === next.focusSession.taskId);
  if (idx >= 0) {
    next.tasks[idx].focusMs += sessionMs;
    next.tasks[idx].focusMsToday += sessionMs;
    next.tasks[idx] = checkMinLine(next.tasks[idx]);
  }
  next.todayFocusMs += sessionMs;
  next.focusSession = null;
  const needRest = sessionMs >= next.settings.focusRemindMin * 60000;
  return { state: next, sessionMs: sessionMs, needRest: needRest };
}
```

- [ ] **Step 4: 运行测试通过**

Run: `node tests/core.test.js` → `28 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add todo.html tests/core.test.js
git commit -m "feat: 收尾总结生成、最低完成线判定、聚焦会话结算（纯函数）"
```

---

### Task 5: HTML 骨架、主题系统、store 与子界面切换

**Files:**
- Modify: `todo.html`（替换 `<style>` 与 `<body>` 内容，DOM 层脚本区写 store/渲染骨架/事件）

**Interfaces:**
- Produces: 全局 `state`、`save()`、`loadState()`、`saveState()`、`migrate()`、`currentView`、`showView(name)`、`renderAll()`、`renderTopbar()`、`renderChips()`、`showToast(msg)`、`copyText(text) → Promise<bool>`、`escapeHtml(s)`、`applyTheme()`；以下 id 可被后续任务直接引用：
  - 顶栏：`#date-label`、`#focus-total`、`#progress-bar`、`#progress-text`、`#tab-today`、`#tab-done`、`#tab-history`、`#search-input`、`#label-chips`、`#btn-theme`、`#btn-settings`、`#btn-export`、`#btn-summary`
  - 视图：`#view-today`（内含 `#zone-doing`、`#zone-inbox`、`#input-add`、`#btn-bulk-add`）、`#view-done`、`#view-history`
  - 通用：`#toast`、`.modal-backdrop`（弹窗基类，后续任务追加具体弹窗）、`body[data-view]`、`body.focusing`/`body.resting` 预留类

- [ ] **Step 1: 写 HTML 骨架与 CSS 主题**

`<style>` 全量替换为（后续任务在标记处追加）：

```css
:root {
  --bg: #F5F6FA; --card: #FFFFFF; --card-border: #E5E7EB; --text: #1F2430;
  --text-2: #6B7280; --accent: #4F6DF5; --accent-weak: #EEF1FE;
  --danger: #EF4444; --ok: #10B981; --shadow: 0 1px 3px rgba(15,23,42,.06);
  --blur-bg: rgba(245,246,250,.55);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #111521; --card: #1A1F2E; --card-border: #2A3040; --text: #E5E7EB;
    --text-2: #9CA3AF; --accent-weak: #232A45; --shadow: 0 1px 3px rgba(0,0,0,.4);
    --blur-bg: rgba(17,21,33,.55);
  }
}
:root[data-theme="dark"] {
  --bg: #111521; --card: #1A1F2E; --card-border: #2A3040; --text: #E5E7EB;
  --text-2: #9CA3AF; --accent-weak: #232A45; --shadow: 0 1px 3px rgba(0,0,0,.4);
  --blur-bg: rgba(17,21,33,.55);
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif; font-size: 15px;
}
#app { max-width: 860px; margin: 0 auto; padding: 16px 20px 80px; }
header.topbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
#date-label { font-size: 17px; font-weight: 600; margin-right: auto; }
.focus-total { font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 600; }
.progress-wrap { width: 100%; display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.progress-track { flex: 1; height: 8px; border-radius: 4px; background: var(--card-border); overflow: hidden; }
#progress-bar { height: 100%; width: 0; background: var(--accent); border-radius: 4px; transition: width .25s; }
#progress-text { font-size: 13px; color: var(--text-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
nav.tabs { display: flex; gap: 6px; margin: 14px 0 10px; }
nav.tabs button {
  border: none; background: transparent; padding: 7px 14px; border-radius: 999px;
  font-size: 14px; color: var(--text-2); cursor: pointer; font-family: inherit;
}
nav.tabs button.active { background: var(--accent); color: #fff; font-weight: 600; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
#search-input {
  flex: 1; min-width: 160px; padding: 7px 12px; border: 1px solid var(--card-border);
  border-radius: 8px; background: var(--card); color: var(--text); font-family: inherit; font-size: 14px;
}
#label-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  border: 1px solid var(--card-border); background: var(--card); border-radius: 999px;
  font-size: 12px; padding: 3px 10px; cursor: pointer; color: var(--text-2); font-family: inherit;
}
.chip.on { color: #fff; font-weight: 600; }
.btn {
  border: 1px solid var(--card-border); background: var(--card); color: var(--text);
  border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; font-family: inherit;
}
.btn:hover { border-color: var(--accent); color: var(--accent); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.danger { color: var(--danger); }
section.zone { margin-bottom: 18px; }
.zone-head { display: flex; align-items: center; gap: 8px; margin: 10px 0 6px; }
.zone-head h2 { font-size: 14px; margin: 0; color: var(--text-2); font-weight: 600; }
.zone-head .count { font-size: 12px; color: var(--text-2); }
.zone-head .zone-copy { margin-left: auto; }
.task-card {
  background: var(--card); border: 1px solid var(--card-border); border-radius: 12px;
  box-shadow: var(--shadow); padding: 10px 12px; margin-bottom: 8px;
  transition: transform .15s, border-color .15s, filter .3s, opacity .3s;
}
.task-card:hover { transform: translateY(-1px); }
.task-card.doing { border-left: 3px solid var(--accent); }
.task-card.focused { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak), var(--shadow); }
.task-row { display: flex; align-items: center; gap: 8px; }
.task-text { flex: 1; cursor: pointer; }
.task-card.done-item .task-text { color: var(--text-2); text-decoration: line-through; }
.card-badges { display: flex; align-items: center; gap: 6px; }
.tag-badge { font-size: 11px; padding: 1px 7px; border-radius: 999px; color: #fff; }
.sub-count { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.rollover-mark { font-size: 11px; color: var(--danger); border: 1px solid currentColor; border-radius: 4px; padding: 0 3px; }
.min-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
.min-dot.met { background: var(--ok); }
.icon-btn {
  border: none; background: transparent; color: var(--text-2); cursor: pointer;
  font-size: 13px; padding: 2px 6px; border-radius: 6px; font-family: inherit;
}
.icon-btn:hover { color: var(--accent); background: var(--accent-weak); }
.add-row { display: flex; gap: 8px; }
.add-row input {
  flex: 1; padding: 9px 12px; border: 1px solid var(--card-border); border-radius: 10px;
  background: var(--card); color: var(--text); font-family: inherit; font-size: 14px;
}
.add-row input:focus { outline: none; border-color: var(--accent); }
.empty-hint { color: var(--text-2); font-size: 13px; text-align: center; padding: 18px 0; }
.toast {
  position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(20px);
  background: var(--text); color: var(--bg); padding: 9px 18px; border-radius: 10px;
  font-size: 14px; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; z-index: 300;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,.35); display: none;
  align-items: center; justify-content: center; z-index: 200; padding: 20px;
}
.modal-backdrop.show { display: flex; }
.modal {
  background: var(--card); border-radius: 14px; padding: 20px; width: 100%;
  max-width: 520px; max-height: 82vh; overflow: auto; box-shadow: var(--shadow);
}
.modal h3 { margin: 0 0 12px; font-size: 16px; }
.modal .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
body.focusing .blurable { filter: blur(7px); opacity: .55; pointer-events: none; }
body.focusing .task-card.focused { filter: none; opacity: 1; pointer-events: auto; }
/* Task 7+ 追加样式在此之后 */
```

`<body>` 内 `#app` 替换为：

```html
<div id="app">
  <header class="topbar">
    <span id="date-label"></span>
    <span class="focus-total">⏱ 今日聚焦 <span id="focus-total">0min</span></span>
    <button class="btn" id="btn-theme" title="切换主题">🌓</button>
    <button class="btn" id="btn-summary">今日收尾</button>
    <button class="btn" id="btn-export">导出/导入</button>
    <button class="btn" id="btn-settings">设置</button>
  </header>
  <div class="progress-wrap">
    <div class="progress-track"><div id="progress-bar"></div></div>
    <span id="progress-text">0/0</span>
  </div>
  <nav class="tabs">
    <button id="tab-today" class="active">今天</button>
    <button id="tab-done">今日已完成</button>
    <button id="tab-history">历史归档</button>
  </nav>
  <div class="toolbar">
    <input id="search-input" type="text" placeholder="搜索事项或子任务…（/ 聚焦到此）">
    <div id="label-chips"></div>
  </div>
  <section id="view-today">
    <section class="zone" id="zone-doing-wrap">
      <div class="zone-head"><h2>正在处理</h2><span class="count" id="count-doing"></span><button class="btn zone-copy" id="copy-doing">复制</button></div>
      <div id="zone-doing"></div>
    </section>
    <section class="zone" id="zone-inbox-wrap">
      <div class="zone-head"><h2>Inbox</h2><span class="count" id="count-inbox"></span><button class="btn zone-copy" id="copy-inbox">复制</button></div>
      <div id="zone-inbox"></div>
      <div class="add-row" style="margin-top:8px">
        <input id="input-add" type="text" placeholder="添加今日事项，回车确认">
        <button class="btn" id="btn-bulk-add">批量添加</button>
      </div>
    </section>
  </section>
  <section id="view-done" style="display:none">
    <div class="zone-head"><h2>今日已完成</h2><span class="count" id="count-done"></span><button class="btn zone-copy" id="copy-done">复制</button></div>
    <div id="zone-donelist"></div>
  </section>
  <section id="view-history" style="display:none">
    <div id="history-list"></div>
  </section>
</div>
<!-- 后续任务在此之后追加弹窗 -->
```

- [ ] **Step 2: 写 DOM 层 store 与骨架渲染**

替换 script 末尾 `/* DOM 层 */` 注释区为：

```js
/* ============ DOM 层 ============ */
const STORAGE_KEY = 'todoApp.v1';
let state = loadState();
let currentView = 'today';

function migrate(s) {
  const d = defaultState();
  s.settings = Object.assign({}, d.settings, s.settings || {});
  if (!Array.isArray(s.tasks)) s.tasks = [];
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.settings.labels) || !s.settings.labels.length) s.settings.labels = d.settings.labels;
  return s;
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.version === 1) return migrate(s); }
  } catch (e) { /* 损坏则重建 */ }
  const fresh = defaultState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function save() { saveState(); renderAll(); scheduleBackup(); }   // scheduleBackup 由 Task 16 提供，之前为空函数占位
function scheduleBackup() {}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  return ok;
}

const WEEK = ['日','一','二','三','四','五','六'];
function renderTopbar() {
  const d = new Date();
  document.getElementById('date-label').textContent =
    (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
  document.getElementById('focus-total').textContent = formatDuration(state.todayFocusMs);
  const p = computeProgress(state.tasks);
  document.getElementById('progress-bar').style.width = p.pct + '%';
  document.getElementById('progress-text').textContent = p.done + '/' + p.total + '（' + p.pct + '%）';
}
function renderChips() {
  const box = document.getElementById('label-chips');
  box.innerHTML = '';
  state.settings.labels.forEach(l => {
    const b = document.createElement('button');
    b.className = 'chip' + (activeLabels.has(l.name) ? ' on' : '');
    b.textContent = l.name;
    if (activeLabels.has(l.name)) b.style.background = l.color;
    b.onclick = () => {   // 过滤逻辑 Task 14 接线；此前仅切换选中态
      activeLabels.has(l.name) ? activeLabels.delete(l.name) : activeLabels.add(l.name);
      renderChips();
    };
    box.appendChild(b);
  });
}
const activeLabels = new Set();

function renderAll() {
  renderTopbar(); renderChips();
  renderToday(); renderDone(); renderHistory();   // 后续任务逐个实现，先定义为空
}
function renderToday() {}
function renderDone() {}
function renderHistory() {}

function showView(name) {
  currentView = name;
  document.body.dataset.view = name;
  ['today','done','history'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === name ? '' : 'none';
    document.getElementById('tab-' + v).classList.toggle('active', v === name);
  });
  renderAll();
}
['today','done','history'].forEach(v =>
  document.getElementById('tab-' + v).addEventListener('click', () => showView(v)));

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme === 'auto' ? '' : state.settings.theme;
}
document.getElementById('btn-theme').addEventListener('click', () => {
  const order = ['auto','light','dark'];
  state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % order.length];
  applyTheme(); saveState();
  showToast('主题：' + { auto: '跟随系统', light: '浅色', dark: '深色' }[state.settings.theme]);
});

applyTheme();
showView('today');
```

- [ ] **Step 3: 语法与测试检查**

Run: `node tests/syntax-check.js` → OK；Run: `node tests/core.test.js` → 仍 `28 passed`（纯核心未动）

- [ ] **Step 4: 手工冒烟**

用本机浏览器打开 `todo.html`：顶栏/进度条/三个 Tab 可切换且互斥；主题按钮三态循环（macOS 系统深色下 auto 呈深色）；控制台无报错；刷新后 Tab 回到「今天」但 localStorage 已写入 `todoApp.v1`（DevTools → Application → Local Storage 可见）。

- [ ] **Step 5: Commit**

```bash
git add todo.html
git commit -m "feat: HTML骨架、三态主题、store与子界面切换"
```

---

### Task 6: 今日页渲染与基础交互（添加/勾选完成/删除）

**Files:**
- Modify: `todo.html`（DOM 层：实现 `renderToday`/`buildTaskCard`/`createTask`/`completeTask`/`deleteTask`；CSS 末尾追加勾选框样式）

**Interfaces:**
- Consumes: Task 5 的 id 与 `save()`；Task 1 的 `genId`
- Produces: `buildTaskCard(task) → HTMLElement`（含 `data-id`；checkbox 勾选→完成；`data-action` 按钮：`focus`/`copy`/`minline`/`delete` —— 本任务只实现 delete，其余按钮先渲染出来、handler 由 Task 8/9/11/15 接线）、`createTask(text, labels?, subtasks?) → task`、`completeTask(id)`、`deleteTask(id)`、`zoneTasks(zone)`。事件采用容器级委托：`#zone-doing`/`#zone-inbox` 上监听 click，`closest('[data-action]')` 分发

- [ ] **Step 1: 实现渲染与交互**

`renderToday` 空函数替换为（并新增以下函数）：

```js
function zoneTasks(zone) { return state.tasks.filter(t => t.zone === zone); }

function createTask(text, labels, subtasks) {
  const now = Date.now();
  const t = { id: genId(now), text: text, zone: 'inbox', labels: labels || [],
    subtasks: (subtasks || []).map(s => ({ id: genId(now), text: s.text, done: !!s.done })),
    focusMs: 0, focusMsToday: 0, minLine: null, minLineMet: false, rolledOver: false,
    createdAt: now, completedAt: null };
  state.tasks.push(t);
  return t;
}

function labelColor(name) {
  const l = state.settings.labels.find(x => x.name === name);
  return l ? l.color : '#94A3B8';
}

function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card' + (task.zone === 'doing' ? ' doing' : '') + (task.zone === 'done' ? ' done-item' : '');
  card.dataset.id = task.id;
  card.draggable = true;   // Task 8 使用
  const doneSubs = (task.subtasks || []).filter(s => s.done).length;
  const labelsHtml = task.labels.map(l =>
    '<span class="tag-badge" style="background:' + labelColor(l) + '">' + escapeHtml(l) + '</span>').join('');
  card.innerHTML =
    '<div class="task-row">' +
      '<input type="checkbox" class="task-check" ' + (task.zone === 'done' ? 'checked' : '') + '>' +
      '<span class="task-text">' + escapeHtml(task.text) + '</span>' +
      '<span class="card-badges">' + labelsHtml +
        (task.subtasks && task.subtasks.length ? '<span class="sub-count">' + doneSubs + '/' + task.subtasks.length + '</span>' : '') +
        (task.rolledOver ? '<span class="rollover-mark" title="昨日遗留">遗</span>' : '') +
        (task.minLine ? '<span class="min-dot' + (task.minLineMet ? ' met' : '') + '" title="最低完成线"></span>' : '') +
      '</span>' +
      '<span class="card-actions">' +
        '<button class="icon-btn" data-action="focus" title="聚焦">◉</button>' +
        '<button class="icon-btn" data-action="copy" title="复制">⧉</button>' +
        '<button class="icon-btn" data-action="minline" title="最低完成线">⑂</button>' +
        '<button class="icon-btn" data-action="delete" title="删除">✕</button>' +
      '</span>' +
    '</div>' +
    '<div class="subtask-box" style="display:none"></div>';   // Task 7 使用
  return card;
}

function completeTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.zone = 'done';
  t.completedAt = Date.now();
  save();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(x => x.id !== id);
  save();
}

function dispatchCardAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) {
    const chk = e.target.closest('.task-check');
    if (chk) { completeTask(chk.closest('.task-card').dataset.id); }
    return;
  }
  const id = btn.closest('.task-card').dataset.id;
  if (btn.dataset.action === 'delete') { deleteTask(id); showToast('已删除'); }
  // focus/copy/minline 的 handler 由 Task 8/9/11/15 在此 switch 追加 case
}

function renderToday() {
  const doingBox = document.getElementById('zone-doing');
  const inboxBox = document.getElementById('zone-inbox');
  doingBox.innerHTML = ''; inboxBox.innerHTML = '';
  const doing = zoneTasks('doing'), inbox = zoneTasks('inbox');
  document.getElementById('count-doing').textContent = doing.length + '/' + state.settings.maxDoing;
  document.getElementById('count-inbox').textContent = String(inbox.length);
  doing.forEach(t => doingBox.appendChild(buildTaskCard(t)));
  inbox.forEach(t => inboxBox.appendChild(buildTaskCard(t)));
  expandedIds.forEach(id => {   // renderAll 重建后恢复展开盒（Task 7 修复轮裁定）
    const card = document.querySelector('.task-card[data-id="' + id + '"]');
    const t = state.tasks.find(x => x.id === id);
    if (card && t) fillSubtaskBox(card, t);
  });
  if (!doing.length) doingBox.innerHTML = '<div class="empty-hint">从 inbox 拖入或聚焦一条，最多 ' + state.settings.maxDoing + ' 条</div>';
  if (!inbox.length) inboxBox.innerHTML = '<div class="empty-hint">Inbox 为空，用下方输入框添加</div>';
}
['zone-doing','zone-inbox'].forEach(zid =>
  document.getElementById(zid).addEventListener('click', dispatchCardAction));

document.getElementById('input-add').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const text = e.target.value.trim();
  if (!text) return;
  createTask(text);
  e.target.value = '';
  save();
});
```

CSS 追加：

```css
.card-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .15s; }
.task-card:hover .card-actions, .task-card.focused .card-actions { opacity: 1; }
.task-check { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
```

- [ ] **Step 2: 检查**

Run: `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟**

打开页面：输入框回车添加事项出现在 inbox；勾选 → 移出今日页、切到「今日已完成」Tab 可见；hover 卡片出现 4 个操作按钮，✕ 删除；进度条数字随完成变化；「遗」/红点标记位置正确（造数据可在控制台 `state.tasks[0].rolledOver=true; save()` 验证后还原）。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 今日页渲染、卡片构建、添加/完成/删除"
```

---

### Task 7: 子任务与标签（展开、子任务 CRUD、标签指定）

**Files:**
- Modify: `todo.html`（DOM 层 + CSS）

**Interfaces:**
- Consumes: Task 6 的 `buildTaskCard`/`dispatchCardAction`
- Produces: `toggleExpand(id, forceOpen?)`（同时被 Task 8 聚焦时复用）；`refreshCard(id)`（单卡片就地重绘，避免整列表重绘打断输入）；卡片展开态含子任务列表与「＋子任务」输入、标签选择弹出层。勾选子任务后：更新 `sub-count`、调用 `checkMinLine`（Task 4）置绿点

- [ ] **Step 1: 实现子任务与标签 UI**

在 `buildTaskCard` 的 `.task-row` 中、`.card-actions` 之前插入展开箭头（有子任务或聚焦时显示）：

```js
(task.subtasks && task.subtasks.length
  ? '<button class="icon-btn expand-btn" data-action="expand" title="子任务">' +
    (expandedIds.has(task.id) ? '▾' : '▸') + '</button>' : '')
```

并新增（DOM 层）：

```js
const expandedIds = new Set();

function refreshCard(id) {
  const t = state.tasks.find(x => x.id === id);
  const old = document.querySelector('.task-card[data-id="' + id + '"]');
  if (!old || !t) { renderToday(); return; }
  const fresh = buildTaskCard(t);
  if (expandedIds.has(id)) fillSubtaskBox(fresh, t);
  old.replaceWith(fresh);
}

function fillSubtaskBox(card, task) {
  const box = card.querySelector('.subtask-box');
  box.style.display = '';
  box.innerHTML = (task.subtasks || []).map(s =>
    '<div class="sub-row">' +
      '<input type="checkbox" class="sub-check" data-sid="' + s.id + '"' + (s.done ? ' checked' : '') + '>' +
      '<span class="' + (s.done ? 'sub-done' : '') + '">' + escapeHtml(s.text) + '</span>' +
      '<button class="icon-btn sub-del" data-sid="' + s.id + '">✕</button>' +
    '</div>').join('') +
    '<div class="add-row" style="margin-top:6px"><input class="sub-input" type="text" placeholder="添加子任务，回车确认"></div>' +
    '<div class="label-picker">' + state.settings.labels.map(l =>
      '<button class="chip' + (task.labels.includes(l.name) ? ' on' : '') + '" data-label="' + escapeHtml(l.name) + '"' +
      (task.labels.includes(l.name) ? ' style="background:' + l.color + '"' : '') + '>' + escapeHtml(l.name) + '</button>').join('') +
    '</div>';
  box.querySelector('.sub-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const text = e.target.value.trim();
    if (!text) return;
    task.subtasks.push({ id: genId(), text: text, done: false });
    save(); refreshCard(task.id);
    const again = document.querySelector('.task-card[data-id="' + task.id + '"] .sub-input');
    if (again) again.focus();
  });
  box.addEventListener('change', e => {
    const sid = e.target.dataset && e.target.dataset.sid;
    if (!sid) return;
    const s = task.subtasks.find(x => x.id === sid);
    if (s) { s.done = e.target.checked; state.tasks[state.tasks.indexOf(task)] = checkMinLine(task); save(); refreshCard(task.id); }
  });
  box.addEventListener('click', e => {
    const del = e.target.closest('.sub-del');
    if (del) { task.subtasks = task.subtasks.filter(x => x.id !== del.dataset.sid); save(); refreshCard(task.id); return; }
    const chip = e.target.closest('[data-label]');
    if (chip) {
      const name = chip.dataset.label;
      task.labels = task.labels.includes(name) ? task.labels.filter(x => x !== name) : task.labels.concat(name);
      save(); refreshCard(task.id);
    }
  });
}

function toggleExpand(id, forceOpen) {
  if (forceOpen) expandedIds.add(id);
  else expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id);
  refreshCard(id);
}
```

`dispatchCardAction` 中追加 case（delete 之前）：

```js
  if (btn.dataset.action === 'expand') { toggleExpand(id); return; }
```

`.task-text` 点击也触发展开：在 `dispatchCardAction` 开头 `closest('.task-text')` 分支调用 `toggleExpand(id)`。

CSS 追加：

```css
.subtask-box { margin-top: 8px; padding-left: 24px; }
.sub-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; font-size: 14px; }
.sub-row .sub-done { color: var(--text-2); text-decoration: line-through; }
.sub-del { opacity: 0; } .sub-row:hover .sub-del { opacity: 1; }
.sub-check { width: 14px; height: 14px; accent-color: var(--accent); }
.label-picker { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.expand-btn { font-size: 12px; }
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 展开箭头展开/收起；添加 3 条子任务、勾选 2 条 → 徽标 `2/3`；勾选子任务触发 min-line 绿点（控制台造 `minLine:{type:'subtask',count:1}` 验证）；标签 chip 可加可去且带色；删除子任务正常。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 子任务展开/增删/勾选与标签指定"
```

---

### Task 8: 拖拽排序与区域互移（doing 上限、Tab 拖放完成）

**Files:**
- Modify: `todo.html`（DOM 层 + CSS）

**Interfaces:**
- Consumes: Task 6 的 `buildTaskCard`（卡片已 `draggable=true`）
- Produces: `moveTask(id, toZone, toIndex)`（一切区域变更的统一入口，后续 Tab/复活也复用）；`dragCtx`；今日页 zone 内排序、inbox↔doing 互拖、拖到「今日已完成」Tab = 完成；`#tab-done` 成为 drop 目标

- [ ] **Step 1: 实现拖拽**

```js
let dragCtx = null;   // {taskId, fromZone}

function moveTask(id, toZone, toIndex) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return false;
  if (toZone === 'doing' && t.zone !== 'doing' &&
      zoneTasks('doing').length >= state.settings.maxDoing) {
    showToast('正在处理最多 ' + state.settings.maxDoing + ' 条，先移出一条'); return false;
  }
  state.tasks = state.tasks.filter(x => x.id !== id);
  t.zone = toZone;
  t.completedAt = toZone === 'done' ? Date.now() : null;
  const zoneList = state.tasks.filter(x => x.zone === toZone && x.id !== id);
  const idxInState = toIndex == null ? Infinity : toIndex;
  // 重建整表：目标区按新顺序、其余区保持原相对顺序
  const before = zoneList.slice(0, idxInState), after = zoneList.slice(idxInState);
  state.tasks = state.tasks.filter(x => x.zone !== toZone).concat(before, [t], after);
  save();
  return true;
}

function bindDragSource(container) {
  container.addEventListener('dragstart', e => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    dragCtx = { taskId: card.dataset.id, fromZone: card.closest('[id^="zone-"]').id.replace('zone-','') };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
  });
  container.addEventListener('dragend', () => { dragCtx = null; clearDropHints(); });
}
function bindDropTarget(el, zone, getInsertIndex) {
  el.addEventListener('dragover', e => { e.preventDefault(); markDropHint(el); });
  el.addEventListener('dragleave', () => unmarkDropHint(el));
  el.addEventListener('drop', e => {
    e.preventDefault(); unmarkDropHint(el);
    if (!dragCtx) return;
    const idx = getInsertIndex ? getInsertIndex(e) : null;
    moveTask(dragCtx.taskId, zone, idx);
  });
}
function markDropHint(el) { el.classList.add('drop-hint'); }
function unmarkDropHint(el) { el.classList.remove('drop-hint'); }
function clearDropHints() { document.querySelectorAll('.drop-hint').forEach(unmarkDropHint); }

// 今日页两区：源 + 目标（含按鼠标位置计算插入下标）
['zone-doing','zone-inbox'].forEach(zid => {
  const el = document.getElementById(zid);
  bindDragSource(el);
  bindDropTarget(el, zid.replace('zone-',''), e => {
    const cards = [...el.querySelectorAll('.task-card:not([data-id="' + dragCtx.taskId + '"])')];
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  });
});
// 拖到「今日已完成」Tab = 完成
bindDropTarget(document.getElementById('tab-done'), 'done', null);
// doing 满员时 Tab 也给视觉反馈：dragover 里若 doing 满且目标为 doing 由 moveTask 拦截并 toast

document.getElementById('tab-done').addEventListener('drop', () => { if (dragCtx) showToast('已完成 ✓'); });
```

注意：drop 到 `#tab-done` 时 `dragCtx` 在 `dragend` 前仍有效，顺序为先 moveTask 后 toast。`dragend` 里 `clearDropHints` 已覆盖异常路径。

CSS 追加：

```css
.drop-hint { outline: 2px dashed var(--accent); outline-offset: 2px; border-radius: 12px; }
#tab-done.drop-hint { outline-offset: -2px; }
.task-card.dragging { opacity: .45; }
```

（`dragstart` 时给卡片加 `.dragging`，`dragend` 移除——在 `bindDragSource` 的对应回调中各加一行 `card.classList.add/remove`。）

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — inbox 内上下拖动排序生效且顺序刷新后保留；inbox→doing 拖入正常；doing 已 2 条时拖第 3 条被拒并 toast；拖卡片到「今日已完成」Tab 松手 → 完成并可在该 Tab 查看。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 拖拽排序、inbox/doing互移、Tab拖放完成、doing上限拦截"
```

---

### Task 9: 聚焦模式与计时（毛玻璃、实时顶栏、刷新持久化、退出结算）

**Files:**
- Modify: `todo.html`（DOM 层 + CSS）

**Interfaces:**
- Consumes: Task 4 `settleFocusSession`；Task 7 `toggleExpand`
- Produces: `startFocus(id)`、`exitFocus(showRestPromptIfNeeded=true)`、`focusTick()`（1s interval）、`ensureFocusUi()`（页面加载时若 `state.focusSession` 存在则恢复聚焦态——刷新不丢）；`body.focusing`；毛玻璃类 `.blurable` 施加到顶栏/导航/工具栏/其他卡片

- [ ] **Step 1: 实现聚焦**

```js
let focusTimer = null;

function startFocus(id) {
  if (state.focusSession) { showToast('已在聚焦中，先退出当前聚焦'); return; }
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  state.focusSession = { taskId: id, startAt: Date.now() };
  saveState();
  expandedIds.add(id);
  applyFocusUi();
  renderAll();
  showToast('聚焦开始，其余界面已模糊');
}

function exitFocus() {
  if (!state.focusSession) return;
  const r = settleFocusSession(state, Date.now());
  state = r.state;
  save();
  applyFocusUi();
  if (r.needRest) showRestPrompt();   // Task 10 实现，先留空函数
}

function applyFocusUi() {
  const on = !!state.focusSession;
  document.body.classList.toggle('focusing', on);
  document.querySelectorAll('.task-card').forEach(c => c.classList.remove('focused'));
  if (on) {
    const card = document.querySelector('.task-card[data-id="' + state.focusSession.taskId + '"]');
    if (card) {
      card.classList.add('focused');
      // 聚焦卡片内加计时条与退出按钮
      let bar = card.querySelector('.focus-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'focus-bar';
        bar.innerHTML = '<span class="focus-clock" style="font-size:26px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums"></span>' +
          '<button class="btn danger" data-action="exitfocus" style="margin-left:auto">取消聚焦</button>';
        card.appendChild(bar);
        bar.querySelector('[data-action="exitfocus"]').addEventListener('click', exitFocus);
      }
    }
  }
}

function focusTick() {
  if (!state.focusSession) return;
  const elapsed = Date.now() - state.focusSession.startAt;
  const shown = state.todayFocusMs + elapsed;   // 今日总聚焦实时含进行中会话
  document.getElementById('focus-total').textContent = formatDuration(shown);
  const clock = document.querySelector('.task-card.focused .focus-clock');
  if (clock) clock.textContent = formatDuration(elapsed);
}
setInterval(focusTick, 1000);

function ensureFocusUi() {   // 刷新/重开后恢复聚焦态
  if (!state.focusSession) return;
  const t = state.tasks.find(x => x.id === state.focusSession.taskId);
  if (!t) { exitFocus(); return; }
  expandedIds.add(t.id);
  applyFocusUi();
  renderAll();   // renderAll 会重建卡片，随后 applyFocusUi 补挂 focus-bar
  applyFocusUi();
}
```

`dispatchCardAction` 追加 case：

```js
  if (btn.dataset.action === 'focus') { startFocus(id); return; }
```

`completeTask`（Task 6）开头插入：若完成的是聚焦中的事项，先 `exitFocus()` 结算：

```js
  if (state.focusSession && state.focusSession.taskId === id) exitFocus();
```

`renderAll` 末尾调用 `applyFocusUi()`（重绘后重新挂 focused 态与计时条）。启动序列（Task 5 末尾 `showView('today')` 之后）追加 `ensureFocusUi();`。

毛玻璃施加：`renderAll` 里对 `header.topbar, nav.tabs, .toolbar, .task-card:not(.focused), .zone-head, .add-row` 统一加/去 `blurable`：

```js
function applyBlurTargets() {
  const on = !!state.focusSession;
  document.querySelectorAll('header.topbar, nav.tabs, .toolbar, .task-card, .zone-head, .add-row')
    .forEach(el => el.classList.toggle('blurable', on && !el.classList.contains('focused')));
}
```

（`renderAll` 中 `applyFocusUi()` 之后调用 `applyBlurTargets()`。）

`showRestPrompt` 本任务先放空函数 `function showRestPrompt() {}`（Task 10 实现）。

CSS 追加：

```css
.focus-bar { display: flex; align-items: center; margin-top: 10px; }
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK；`node tests/core.test.js` → 28 passed

- [ ] **Step 3: 手工冒烟** — 点 ◉ 聚焦：其余区域/卡片毛玻璃、聚焦卡片大计时器每秒跳动、顶栏今日聚焦实时增长；刷新页面 → 聚焦态与计时恢复且继续；点「取消聚焦」→ 毛玻璃解除、事项聚焦时长可在收尾弹窗/控制台 `state.tasks` 验证已累计；聚焦中完成该事项 → 自动结算并解除。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 聚焦模式（毛玻璃/计时/刷新持久化/退出结算/完成自动结算）"
```

---

### Task 10: 休息提醒与全屏休息倒计时

**Files:**
- Modify: `todo.html`（弹窗 HTML + DOM 层 + CSS）

**Interfaces:**
- Consumes: Task 9 `exitFocus` 的 `needRest` 分支
- Produces: `showRestPrompt()`、`startRest()`、`skipRest()`；`#modal-rest-prompt`、`#rest-overlay`（全屏倒计时，`body.resting`）

- [ ] **Step 1: 实现提醒与倒计时**

弹窗 HTML（`#toast` 之前追加）：

```html
<div class="modal-backdrop" id="modal-rest-prompt">
  <div class="modal" style="text-align:center">
    <h3 style="font-size:22px">站起来动动老胳膊老腿！！！</h3>
    <p style="color:var(--text-2)">本次聚焦已满 {{min}} 分钟</p>
    <div class="modal-actions" style="justify-content:center">
      <button class="btn primary" id="btn-rest-go">休息一下</button>
      <button class="btn" id="btn-rest-skip">暂时忽略</button>
    </div>
  </div>
</div>
<div id="rest-overlay">
  <div class="rest-inner">
    <div class="rest-title">休息中</div>
    <div id="rest-countdown">05:00</div>
    <button class="btn" id="btn-rest-exit">跳过休息</button>
  </div>
</div>
```

DOM 层：

```js
function showRestPrompt() {
  const m = document.getElementById('modal-rest-prompt');
  m.querySelector('p').textContent = '本次聚焦已满 ' + state.settings.focusRemindMin + ' 分钟';
  m.classList.add('show');
}
document.getElementById('btn-rest-skip').addEventListener('click', () =>
  document.getElementById('modal-rest-prompt').classList.remove('show'));
document.getElementById('btn-rest-go').addEventListener('click', () => {
  document.getElementById('modal-rest-prompt').classList.remove('show');
  startRest();
});

let restTimer = null, restEndsAt = 0;
function startRest() {
  restEndsAt = Date.now() + state.settings.restMin * 60000;
  document.body.classList.add('resting');
  document.getElementById('rest-overlay').classList.add('show');
  restTimer = setInterval(() => {
    const left = restEndsAt - Date.now();
    if (left <= 0) { endRest(); return; }
    const s = Math.ceil(left / 1000);
    document.getElementById('rest-countdown').textContent =
      String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 500);
}
function endRest() {
  clearInterval(restTimer); restTimer = null;
  document.body.classList.remove('resting');
  document.getElementById('rest-overlay').classList.remove('show');
  showToast('休息结束，继续吧');
}
document.getElementById('btn-rest-exit').addEventListener('click', endRest);
```

CSS 追加：

```css
#rest-overlay {
  position: fixed; inset: 0; z-index: 400; display: none;
  align-items: center; justify-content: center;
  background: var(--blur-bg); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
#rest-overlay.show { display: flex; }
.rest-inner { text-align: center; }
.rest-title { font-size: 18px; color: var(--text-2); margin-bottom: 8px; }
#rest-countdown { font-size: 72px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); }
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 控制台临时设 `state.settings.focusRemindMin=0; saveState();` 后聚焦一条再取消 → 弹「站起来动动老胳膊老腿！！！」；点休息 → 全屏倒计时（可临时把 restMin 设 1 快速验证走完）→ 自动结束 toast；跳过按钮立即结束；还原设置。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 休息提醒弹窗与全屏休息倒计时"
```

---

### Task 11: 最低完成线 UI 与红绿点

**Files:**
- Modify: `todo.html`（弹窗 + DOM 层）

**Interfaces:**
- Consumes: Task 4 `checkMinLine`；Task 6 卡片上的 `.min-dot`
- Produces: `#modal-minline`（两个单选 + 数字输入）、`openMinLineDialog(id)`；设置后红点出现；`save()` 后 `renderToday` 已渲染红/绿点（Task 6 已含），本任务保证：聚焦结算（Task 9 已接 `checkMinLine`）与子任务勾选（Task 7 已接）触发变绿

- [ ] **Step 1: 实现对话框**

HTML（弹窗区追加）：

```html
<div class="modal-backdrop" id="modal-minline">
  <div class="modal">
    <h3>设置最低完成线</h3>
    <p style="color:var(--text-2);font-size:13px">只对今天有效，明天自动失效。达成后红点变绿点。</p>
    <div class="minline-form">
      <label><input type="radio" name="mltype" value="focus" checked> 最低聚焦</label>
      <input type="number" id="ml-focus-min" min="1" style="width:70px"> 分钟
      <span style="margin:0 8px;color:var(--text-2)">或</span>
      <label><input type="radio" name="mltype" value="subtask"> 至少完成</label>
      <input type="number" id="ml-sub-count" min="1" value="1" style="width:70px"> 个子任务
    </div>
    <div class="modal-actions">
      <button class="btn" id="btn-ml-clear">清除完成线</button>
      <button class="btn" id="btn-ml-cancel">取消</button>
      <button class="btn primary" id="btn-ml-save">保存</button>
    </div>
  </div>
</div>
```

DOM 层：

```js
let minLineTaskId = null;
function openMinLineDialog(id) {
  minLineTaskId = id;
  const t = state.tasks.find(x => x.id === id);
  const m = document.getElementById('modal-minline');
  m.classList.add('show');
  document.getElementById('ml-focus-min').value = t.minLine && t.minLine.type === 'focus' ? t.minLine.minutes : 30;
  document.getElementById('ml-sub-count').value = t.minLine && t.minLine.type === 'subtask' ? t.minLine.count : 1;
  const type = t.minLine ? t.minLine.type : 'focus';
  m.querySelector('input[name="mltype"][value="' + type + '"]').checked = true;
}
document.getElementById('btn-ml-cancel').addEventListener('click', () =>
  document.getElementById('modal-minline').classList.remove('show'));
document.getElementById('btn-ml-save').addEventListener('click', () => {
  const t = state.tasks.find(x => x.id === minLineTaskId);
  const m = document.getElementById('modal-minline');
  if (!t) { m.classList.remove('show'); return; }
  const type = m.querySelector('input[name="mltype"]:checked').value;
  if (type === 'focus') {
    const minutes = parseInt(document.getElementById('ml-focus-min').value, 10);
    if (!minutes || minutes < 1) { showToast('请输入有效分钟数'); return; }
    t.minLine = { type: 'focus', minutes: minutes };
  } else {
    if (!t.subtasks || !t.subtasks.length) { showToast('该事项还没有子任务，无法按子任务设线'); return; }
    const count = parseInt(document.getElementById('ml-sub-count').value, 10);
    if (!count || count < 1) { showToast('请输入有效个数'); return; }
    t.minLine = { type: 'subtask', count: count };
  }
  t.minLineMet = false;
  state.tasks[state.tasks.indexOf(t)] = checkMinLine(t);   // 设置时已达成立即变绿
  m.classList.remove('show');
  save();
});
document.getElementById('btn-ml-clear').addEventListener('click', () => {
  const t = state.tasks.find(x => x.id === minLineTaskId);
  if (t) { t.minLine = null; t.minLineMet = false; save(); }
  document.getElementById('modal-minline').classList.remove('show');
});
```

`dispatchCardAction` 追加 case：

```js
  if (btn.dataset.action === 'minline') { openMinLineDialog(id); return; }
```

CSS 追加：

```css
.minline-form { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 12px 0; }
.minline-form input[type="number"] { padding: 6px 8px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--card); color: var(--text); font-family: inherit; }
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 设「最低聚焦 1 分钟」→ 红点出现；聚焦该事项 1 分钟后取消 → 绿点；无子任务事项选 subtask 型被拦截 toast；「清除完成线」红点消失。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 最低完成线设置弹窗与红绿点状态"
```

---

### Task 12: 跨天接线、「遗」角标与启动归档

**Files:**
- Modify: `todo.html`（DOM 层）

**Interfaces:**
- Consumes: Task 2 `rollover`；Task 6 卡片已渲染「遗」角标、Task 9 `ensureFocusUi`
- Produces: `checkRollover()`（boot + `setInterval` 60s + `visibilitychange` 三处调用）；跨天 toast 提示

- [ ] **Step 1: 实现接线**

```js
function checkRollover() {
  const r = rollover(state, Date.now());
  if (!r.changed) return;
  state = r.state;
  saveState();
  renderAll();
  ensureFocusUi();
  showToast('新的一天：昨日已完成已归档，遗留事项已滚入 inbox');
}
setInterval(checkRollover, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRollover(); });
```

启动序列中 `showView('today')` 之前调用 `checkRollover();`（首次启动 `lastActiveDate` 即今天，不会误触发）。

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK；`node tests/core.test.js` → 28 passed

- [ ] **Step 3: 手工冒烟** — 控制台把 `state.lastActiveDate='2026-08-25'; saveState();` 后刷新页面 → toast、昨日 done 进历史 Tab、遗留项回 inbox 且带「遗」角标、minLine 被清、今日聚焦归零、每日固定事项（若设置）注入；再刷新不重复触发。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 跨天引擎接线（boot/定时/可见性检测）与遗角标"
```

---

### Task 13: 今日已完成页与历史归档页（退回/恢复/当日聚焦时长）

**Files:**
- Modify: `todo.html`（DOM 层 + CSS）

**Interfaces:**
- Consumes: Task 5 `#zone-donelist`/`#history-list`、Task 6 `buildTaskCard`/`moveTask`
- Produces: `renderDone()`、`renderHistory()`、`restoreToToday(task)`；done 页卡片按钮：退回 inbox（复活）、复制、删除；历史卡片按钮：复制、恢复到今日

- [ ] **Step 1: 实现两个视图**

```js
function renderDone() {
  const box = document.getElementById('zone-donelist');
  box.innerHTML = '';
  const done = zoneTasks('done').slice().sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  document.getElementById('count-done').textContent = String(done.length);
  done.forEach(t => {
    const card = buildTaskCard(t);
    const actions = card.querySelector('.card-actions');
    actions.innerHTML =
      '<button class="icon-btn" data-action="revive" title="退回 inbox">↩</button>' +
      '<button class="icon-btn" data-action="copy" title="复制">⧉</button>' +
      '<button class="icon-btn" data-action="delete" title="删除">✕</button>';
    box.appendChild(card);
  });
  if (!done.length) box.innerHTML = '<div class="empty-hint">今天还没有完成的事项</div>';
}
document.getElementById('zone-donelist').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.closest('.task-card').dataset.id;
  if (btn.dataset.action === 'revive') { moveTask(id, 'inbox', null); showToast('已退回 inbox'); }
  if (btn.dataset.action === 'delete') { deleteTask(id); showToast('已删除'); }
  // copy 由 Task 15 统一接线
});

function renderHistory() {
  const box = document.getElementById('history-list');
  box.innerHTML = '';
  if (!state.history.length) {
    box.innerHTML = '<div class="empty-hint">暂无历史归档。跨天时昨日已完成会自动归档到这里。</div>';
    return;
  }
  state.history.forEach(day => {
    const d = new Date(day.date + 'T00:00:00');
    const sec = document.createElement('section');
    sec.className = 'zone';
    sec.innerHTML = '<div class="zone-head"><h2>' + (d.getMonth() + 1) + '月' + d.getDate() + '日</h2>' +
      '<span class="count">聚焦 ' + formatDuration(day.focusMs) + ' · ' + day.tasks.length + ' 项</span></div>';
    day.tasks.forEach(t => {
      const card = buildTaskCard(t);   // zone 为 done → done-item 样式
      const actions = card.querySelector('.card-actions');
      actions.innerHTML =
        '<button class="icon-btn" data-action="copy" title="复制">⧉</button>' +
        '<button class="icon-btn" data-action="restore" title="恢复到今日">↺</button>';
      const dt = day.date, tid = t.id;
      actions.querySelector('[data-action="restore"]').addEventListener('click', () => restoreToToday(t, dt));
      sec.appendChild(card);
    });
    box.appendChild(sec);
  });
}

function restoreToToday(archivedTask, fromDate) {
  const now = Date.now();
  const clone = deepClone(archivedTask);
  clone.id = genId(now);
  clone.zone = 'inbox';
  clone.subtasks = (clone.subtasks || []).map(s => ({ id: genId(now), text: s.text, done: false }));
  clone.focusMs = 0; clone.focusMsToday = 0;
  clone.minLine = null; clone.minLineMet = false;
  clone.rolledOver = false; clone.createdAt = now; clone.completedAt = null;
  state.tasks.push(clone);
  save();
  showToast('已恢复到今日 inbox' + (fromDate ? '（来自 ' + fromDate + '）' : ''));
}
```

历史卡片的勾选框禁用：`renderHistory` 中 `card.querySelector('.task-check').disabled = true;`。历史卡片子任务展开复用 `dispatchCardAction`（把 `#history-list` 与 `#zone-donelist` 也接入 expand 委托——在 Task 7 的 `.task-text`/expand 分支统一处理的容器列表里加入这两个容器 id；若当前实现绑定在具体容器上，则为这两个容器各挂一份 `dispatchCardAction`）。

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 完成几条后进「今日已完成」：按完成时间倒序、退回 inbox 生效（复活后可再次完成）；控制台造历史数据 `state.history.push({date:'2026-08-25',focusMs:3600000,tasks:[…]}); save();` → 历史页分组显示「8月25日 聚焦 1h 0min · N 项」、恢复到今日生成干净副本（子任务未勾选、focusMs=0）。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 今日已完成页（退回复活）与历史归档页（分组/当日聚焦时长/恢复到今日）"
```

---

### Task 14: 搜索与标签过滤（今日/历史分开）

**Files:**
- Modify: `todo.html`（DOM 层）

**Interfaces:**
- Consumes: Task 5 `#search-input`/`activeLabels`/`renderChips`
- Produces: `searchQuery`（string）、`taskMatches(task, query, labels)`、`filterToday(list)`/`filterHistory(list)`；chips 点击后触发 `renderAll()`（真实过滤）

- [ ] **Step 1: 实现过滤**

```js
let searchQuery = '';
function taskMatches(task, query, labels) {
  if (labels && labels.size) {
    for (const l of labels) if (!task.labels.includes(l)) return false;
  }
  if (query) {
    const q = query.toLowerCase();
    const inText = task.text.toLowerCase().includes(q) ||
      (task.subtasks || []).some(s => s.text.toLowerCase().includes(q));
    if (!inText) return false;
  }
  return true;
}
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderAll();
});
```

`renderChips` 的 `b.onclick` 改为切换选中后调用 `renderAll()`（而非仅 `renderChips()`）。

接线到三个视图：

- `renderToday`：`const doing = zoneTasks('doing').filter(t => taskMatches(t, searchQuery, activeLabels));`（inbox 同理）；两区都空且存在过滤条件时 empty-hint 文案「无匹配事项」
- `renderDone`：`zoneTasks('done')` 同样 `.filter(...)`；空时若在过滤态显示「无匹配事项」
- `renderHistory`：`day.tasks.filter(t => taskMatches(t, searchQuery, activeLabels))`，过滤后为空的日期分组整体隐藏；无任何匹配显示「无匹配事项」

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 今日页搜索关键字（含子任务文本）即时过滤、大小写不敏感；点标签 chip 只留带该标签的事项、多 chip 叠加为 AND、清空恢复；历史页同样生效且空分组隐藏；今日与历史各自独立搜索互不影响。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 搜索与标签过滤（今日/历史分开、子任务文本命中、AND叠加）"
```

---

### Task 15: 区域复制、单事项复制与批量添加 UI

**Files:**
- Modify: `todo.html`（弹窗 + DOM 层）

**Interfaces:**
- Consumes: Task 3 `formatTasksAsText`/`parseBulkText`；Task 5 `copyText`；Task 6 `createTask`；Task 7 `refreshCard`
- Produces: 三个区域「复制」按钮、卡片 `copy` action、`#modal-bulk` 批量添加弹窗（粘贴 → 预览条数 → 添加）；`applyParsed(parsed)` 把解析结果转成任务

- [ ] **Step 1: 实现复制与批量添加**

HTML（弹窗区追加）：

```html
<div class="modal-backdrop" id="modal-bulk">
  <div class="modal">
    <h3>批量添加</h3>
    <p style="color:var(--text-2);font-size:13px">每行一个事项。行首 <code>- [ ] </code> 会忽略；粘贴复制格式（含 #标签 与缩进子任务）可完整恢复。</p>
    <textarea id="bulk-text" rows="9" style="width:100%;padding:10px;border:1px solid var(--card-border);border-radius:10px;background:var(--card);color:var(--text);font-family:inherit;font-size:14px" placeholder="[ ] MySQL 压测  #脚本&#10;    [ ] 建表造数&#10;- [ ] 回复 XXX"></textarea>
    <div class="modal-actions">
      <button class="btn" id="btn-bulk-cancel">取消</button>
      <button class="btn primary" id="btn-bulk-add-confirm">添加</button>
    </div>
  </div>
</div>
```

DOM 层：

```js
function copyZone(zone) {
  const list = zoneTasks(zone).filter(t => taskMatches(t, searchQuery, activeLabels));
  if (!list.length) { showToast('该区域没有可复制的事项'); return; }
  copyText(formatTasksAsText(list)).then(ok => showToast(ok ? '已复制 ' + list.length + ' 项' : '复制失败'));
}
['doing','inbox'].forEach(z =>
  document.getElementById('copy-' + z).addEventListener('click', () => copyZone(z)));
document.getElementById('copy-done').addEventListener('click', () => copyZone('done'));

function copyOne(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) copyText(formatTasksAsText([t])).then(ok => showToast(ok ? '已复制（可直接粘贴回批量添加恢复）' : '复制失败'));
}
```

`dispatchCardAction` 与 done/history 视图的委托里 `copy` case 统一调用 `copyOne(id)`（历史页卡片无 `state.tasks` 命中，见 Step 2 处理）。

历史页复制：`renderHistory` 中 card 的 `copy` 按钮直接 `copyText(formatTasksAsText([t]))`（就地闭包，不查 state.tasks）。

批量添加：

```js
function applyParsed(parsed) {
  let n = 0;
  parsed.forEach(p => {
    createTask(p.text, p.labels, p.subtasks);
    const t = state.tasks[state.tasks.length - 1];
    if (p.done) { t.zone = 'done'; t.completedAt = Date.now(); }
    n++;
  });
  save();
  return n;
}
document.getElementById('btn-bulk-add').addEventListener('click', () => {
  document.getElementById('modal-bulk').classList.add('show');
  document.getElementById('bulk-text').focus();
});
document.getElementById('btn-bulk-cancel').addEventListener('click', () =>
  document.getElementById('modal-bulk').classList.remove('show'));
document.getElementById('btn-bulk-add-confirm').addEventListener('click', () => {
  const parsed = parseBulkText(document.getElementById('bulk-text').value);
  if (!parsed.length) { showToast('没有解析到事项'); return; }
  const n = applyParsed(parsed);
  document.getElementById('bulk-text').value = '';
  document.getElementById('modal-bulk').classList.remove('show');
  showToast('已添加 ' + n + ' 项到 inbox' + (parsed.some(p => p.done) ? '（部分直接完成）' : ''));
});
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — inbox 复制按钮 → 粘贴到文本编辑器核对格式（`[ ]/#标签/缩进子任务`）；单卡片 ⧉ 复制 → 打开批量添加粘贴 → 恢复出带标签与子任务的同款事项；普通多行（含 `- [ ] ` 前缀行）添加成功；`[x]` 行直接进今日已完成；历史页单事项复制正常。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 区域复制/单事项复制/批量添加弹窗（完整格式恢复）"
```

---

### Task 16: 导出/导入与自动备份（File System Access API）

**Files:**
- Modify: `todo.html`（弹窗 + DOM 层）

**Interfaces:**
- Consumes: Task 5 `save()`/`scheduleBackup()` 占位、`migrate()`
- Produces: `#modal-io`（导出今日/导出全部/导入文件三按钮 + 模式选择）；`downloadJson(obj, filename)`；备份：`bindBackupFile()`、`writeBackup()`、`scheduleBackup()` 实装（debounce 2s + 每 5min）、IndexedDB 句柄存取 `idbPut/idbGet`

- [ ] **Step 1: 实现导出/导入**

HTML：

```html
<div class="modal-backdrop" id="modal-io">
  <div class="modal">
    <h3>导出 / 导入</h3>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn" id="btn-export-today">导出今日（JSON 文件）</button>
      <button class="btn" id="btn-export-all">导出全部数据（含历史与设置）</button>
      <button class="btn" id="btn-import">从文件导入…</button>
      <input type="file" id="import-file" accept=".json,application/json" style="display:none">
    </div>
    <p style="color:var(--text-2);font-size:13px;margin-top:12px">导入可选择「合并进 inbox」或「整体替换」。整体替换会覆盖当前全部数据。</p>
  </div>
</div>
<div class="modal-backdrop" id="modal-import-mode">
  <div class="modal">
    <h3>导入模式</h3>
    <p id="import-summary" style="color:var(--text-2);font-size:13px"></p>
    <div class="modal-actions">
      <button class="btn" id="btn-import-cancel">取消</button>
      <button class="btn" id="btn-import-merge">合并进 inbox</button>
      <button class="btn danger" id="btn-import-replace">整体替换</button>
    </div>
  </div>
</div>
```

DOM 层：

```js
function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const exportDate = () => todayStr(Date.now());
document.getElementById('btn-export').addEventListener('click', () =>
  document.getElementById('modal-io').classList.add('show'));
// modal-io 关闭：点 backdrop 空白处统一关闭（见 Step 3 通用绑定）
document.getElementById('btn-export-today').addEventListener('click', () => {
  downloadJson({ type: 'todo-export', scope: 'today', exportedAt: Date.now(),
    labels: state.settings.labels, tasks: state.tasks }, 'todo-today-' + exportDate() + '.json');
  showToast('已导出今日');
});
document.getElementById('btn-export-all').addEventListener('click', () => {
  downloadJson({ type: 'todo-export', scope: 'all', exportedAt: Date.now(), data: state },
    'todo-backup-' + exportDate() + '.json');
  showToast('已导出全部');
});

let pendingImport = null;
document.getElementById('btn-import').addEventListener('click', () =>
  document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const j = JSON.parse(reader.result);
      if (!j || j.type !== 'todo-export') throw new Error('bad');
      pendingImport = j;
      const n = j.scope === 'all' ? (j.data.tasks || []).length + ' 今日 + ' + (j.data.history || []).length + ' 历史天'
                                 : (j.tasks || []).length + ' 个今日事项';
      document.getElementById('import-summary').textContent = '文件包含：' + n;
      document.getElementById('modal-import-mode').classList.add('show');
    } catch (err) { showToast('文件格式无法识别'); }
  };
  reader.readAsText(f);
});
function importTasksIntoInbox(tasks) {
  let n = 0;
  tasks.forEach(src => {
    const c = deepClone(src);
    const now = Date.now();
    c.id = genId(now);
    if (c.zone !== 'done') { c.zone = 'inbox'; c.completedAt = null; }
    else if (!c.completedAt) c.completedAt = now;
    c.rolledOver = false; c.focusMsToday = 0; c.minLine = null; c.minLineMet = false;
    state.tasks.push(c); n++;
  });
  return n;
}
document.getElementById('btn-import-cancel').addEventListener('click', () =>
  document.getElementById('modal-import-mode').classList.remove('show'));
document.getElementById('btn-import-merge').addEventListener('click', () => {
  if (!pendingImport) return;
  const n = importTasksIntoInbox(pendingImport.scope === 'all' ? pendingImport.data.tasks : pendingImport.tasks);
  pendingImport = null;
  document.getElementById('modal-import-mode').classList.remove('show');
  save(); showToast('已合并 ' + n + ' 项');
});
document.getElementById('btn-import-replace').addEventListener('click', () => {
  if (!pendingImport) return;
  if (!window.confirm('整体替换将覆盖当前全部数据，确定？')) return;
  if (pendingImport.scope === 'all') state = migrate(deepClone(pendingImport.data));
  else { state = defaultState(); importTasksIntoInbox(pendingImport.tasks); state.lastActiveDate = todayStr(Date.now()); }
  pendingImport = null;
  document.getElementById('modal-import-mode').classList.remove('show');
  saveState(); renderAll(); showToast('已替换');
});
```

- [ ] **Step 2: 实现自动备份**

```js
let backupHandle = null, backupTimer = null;
function idbOpen() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('todoAppBak', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('handles');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbPut(k, v) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('handles', 'readwrite'); tx.objectStore('handles').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function idbGet(k) { const db = await idbOpen(); return new Promise((res, rej) => { const rq = db.transaction('handles').objectStore('handles').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }

async function bindBackupFile() {
  if (!('showSaveFilePicker' in window)) { showToast('此浏览器不支持自动备份，请用手动导出'); return; }
  try {
    backupHandle = await window.showSaveFilePicker({ suggestedName: 'todo-backup.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
    await idbPut('backup', backupHandle);
    state.settings.autoBackup.enabled = true;
    saveState();
    await writeBackup();
    showToast('已绑定备份文件，数据将自动写入');
  } catch (e) { /* 用户取消 */ }
}
async function writeBackup() {
  if (!backupHandle) return;
  try {
    const w = await backupHandle.createWritable();
    await w.write(JSON.stringify({ type: 'todo-export', scope: 'all', exportedAt: Date.now(), data: state }, null, 2));
    await w.close();
    state.settings.autoBackup.lastBackupAt = Date.now();
    saveState();   // 注意：saveState 不触发 renderAll/scheduleBackup，避免循环
  } catch (e) { /* 句柄失效（文件被删/改名）则静默，下次绑定修复 */ }
}
function scheduleBackup() {   // 替换 Task 5 的空占位
  if (!backupHandle) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(writeBackup, 2000);
}
setInterval(() => { if (backupHandle) writeBackup(); }, 5 * 60 * 1000);
// 启动时恢复句柄（需一次用户交互内 queryPermission；不足则等设置页重新绑定）
(async () => {
  try {
    const h = await idbGet('backup');
    if (h) {
      const p = await h.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') backupHandle = h;
      else state.settings.autoBackup.enabled = true;   // 标记已绑定但待重新授权，设置页显示提示
    }
  } catch (e) {}
})();
```

- [ ] **Step 3: 通用弹窗关闭绑定**

```js
document.querySelectorAll('.modal-backdrop').forEach(bd =>
  bd.addEventListener('click', e => { if (e.target === bd) bd.classList.remove('show'); }));
```

- [ ] **Step 4: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 5: 手工冒烟** — 导出今日/全部生成下载文件、内容含 `type:"todo-export"`；导入「合并」后事项出现在 inbox 且 done 保持完成态；导入「替换」有 confirm；绑定备份文件后改一条数据 → 2s 后打开该 JSON 文件核实已写入。Safari 不支持 FSA → 绑定按钮 toast 提示（在 mac 上可顺带验证降级路径）。

- [ ] **Step 6: Commit**

```bash
git add todo.html
git commit -m "feat: 导出/导入（合并/替换）与 File System Access 自动备份"
```

---

### Task 17: 设置页（标签管理、每日固定事项、参数、备份绑定）

**Files:**
- Modify: `todo.html`（弹窗 + DOM 层 + CSS）

**Interfaces:**
- Consumes: Task 16 `bindBackupFile`；Task 5 `applyTheme`
- Produces: `#modal-settings` 完整实现；`renderSettings()`；标签改名同步所有 `task.labels`/`dailyFixed[].labels` 引用，删标签移除引用；每日固定事项编辑（文本/标签逗号分隔/子任务每行一条）

- [ ] **Step 1: 实现设置页**

HTML：

```html
<div class="modal-backdrop" id="modal-settings">
  <div class="modal" style="max-width:600px">
    <h3>设置</h3>
    <h4>标签</h4>
    <div id="settings-labels"></div>
    <div style="margin-top:6px"><button class="btn" id="btn-label-add">＋ 新增标签</button></div>
    <h4 style="margin-top:18px">每日固定事项 <span style="font-size:12px;color:var(--text-2)">（每天自动加入 inbox）</span></h4>
    <div id="settings-daily"></div>
    <div style="margin-top:6px"><button class="btn" id="btn-daily-add">＋ 新增固定事项</button></div>
    <h4 style="margin-top:18px">参数</h4>
    <div class="settings-params">
      <label>聚焦提醒 <input type="number" id="set-focus-min" min="1" style="width:64px"> 分钟</label>
      <label>休息时长 <input type="number" id="set-rest-min" min="1" style="width:64px"> 分钟</label>
      <label>正在处理上限 <input type="number" id="set-max-doing" min="1" style="width:64px"> 条</label>
    </div>
    <h4 style="margin-top:18px">自动备份</h4>
    <p id="backup-status" style="font-size:13px;color:var(--text-2)"></p>
    <button class="btn" id="btn-bind-backup">绑定备份文件</button>
    <div class="modal-actions"><button class="btn primary" id="btn-settings-close">完成</button></div>
  </div>
</div>
```

DOM 层（核心逻辑）：

```js
function renderSettings() {
  const lb = document.getElementById('settings-labels');
  lb.innerHTML = '';
  state.settings.labels.forEach((l, i) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = '<input type="text" class="lbl-name" value="' + escapeHtml(l.name) + '">' +
      '<input type="color" class="lbl-color" value="' + l.color + '">' +
      '<button class="icon-btn lbl-del">✕</button>';
    row.querySelector('.lbl-name').addEventListener('change', e => {
      const nn = e.target.value.trim();
      if (!nn) { e.target.value = l.name; return; }
      state.tasks.forEach(t => t.labels = t.labels.map(x => x === l.name ? nn : x));
      state.settings.dailyFixed.forEach(f => f.labels = (f.labels || []).map(x => x === l.name ? nn : x));
      l.name = nn; save();
    });
    row.querySelector('.lbl-color').addEventListener('change', e => { l.color = e.target.value; save(); });
    row.querySelector('.lbl-del').addEventListener('click', () => {
      state.tasks.forEach(t => t.labels = t.labels.filter(x => x !== l.name));
      state.settings.dailyFixed.forEach(f => f.labels = (f.labels || []).filter(x => x !== l.name));
      state.settings.labels.splice(i, 1); save(); renderSettings();
    });
    lb.appendChild(row);
  });
  const dl = document.getElementById('settings-daily');
  dl.innerHTML = '';
  state.settings.dailyFixed.forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'settings-row daily-row';
    row.innerHTML = '<input type="text" class="df-text" value="' + escapeHtml(f.text) + '" placeholder="事项文本">' +
      '<input type="text" class="df-labels" value="' + escapeHtml((f.labels || []).join(',')) + '" placeholder="标签,逗号分隔">' +
      '<textarea class="df-subs" rows="2" placeholder="子任务，每行一条">' + escapeHtml((f.subtasks || []).map(s => s.text).join('\n')) + '</textarea>' +
      '<button class="icon-btn df-del">✕</button>';
    row.querySelector('.df-text').addEventListener('change', e => { f.text = e.target.value.trim() || f.text; save(); });
    row.querySelector('.df-labels').addEventListener('change', e => {
      f.labels = e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean); save();
    });
    row.querySelector('.df-subs').addEventListener('change', e => {
      f.subtasks = e.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => ({ text: s, done: false }));
      save();
    });
    row.querySelector('.df-del').addEventListener('click', () => { state.settings.dailyFixed.splice(i, 1); save(); renderSettings(); });
    dl.appendChild(row);
  });
  document.getElementById('set-focus-min').value = state.settings.focusRemindMin;
  document.getElementById('set-rest-min').value = state.settings.restMin;
  document.getElementById('set-max-doing').value = state.settings.maxDoing;
  document.getElementById('backup-status').textContent = state.settings.autoBackup.enabled
    ? (backupHandle ? '已绑定，最近备份：' + new Date(state.settings.autoBackup.lastBackupAt || 0).toLocaleString()
                    : '已绑定，刷新后需在设置页重新授权一次')
    : '未绑定（' + ('showSaveFilePicker' in window ? '支持自动备份' : '当前浏览器不支持，请手动导出') + '）';
}
document.getElementById('btn-settings').addEventListener('click', () => {
  renderSettings(); document.getElementById('modal-settings').classList.add('show');
});
document.getElementById('btn-settings-close').addEventListener('click', () =>
  document.getElementById('modal-settings').classList.remove('show'));
document.getElementById('btn-label-add').addEventListener('click', () => {
  state.settings.labels.push({ name: '新标签' + (state.settings.labels.length + 1), color: '#5B8DEF' });
  save(); renderSettings();
});
document.getElementById('btn-daily-add').addEventListener('click', () => {
  state.settings.dailyFixed.push({ text: '新固定事项', labels: [], subtasks: [] });
  save(); renderSettings();
});
['set-focus-min','set-rest-min','set-max-doing'].forEach(id =>
  document.getElementById(id).addEventListener('change', e => {
    const v = parseInt(e.target.value, 10);
    if (!v || v < 1) { renderSettings(); return; }
    if (id === 'set-focus-min') state.settings.focusRemindMin = v;
    if (id === 'set-rest-min') state.settings.restMin = v;
    if (id === 'set-max-doing') state.settings.maxDoing = v;
    save();
  }));
document.getElementById('btn-bind-backup').addEventListener('click', bindBackupFile);
```

CSS 追加：

```css
#modal-settings h4 { margin: 14px 0 8px; font-size: 14px; }
.settings-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.settings-row input[type="text"] { flex: 1; min-width: 0; padding: 6px 10px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--card); color: var(--text); font-family: inherit; }
.settings-row input[type="color"] { width: 36px; height: 30px; border: none; background: none; cursor: pointer; }
.daily-row { flex-wrap: wrap; }
.daily-row .df-text { flex: 2; } .daily-row .df-labels { flex: 1; }
.daily-row textarea { width: 100%; padding: 6px 10px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--card); color: var(--text); font-family: inherit; font-size: 13px; resize: vertical; }
.settings-params { display: flex; gap: 18px; flex-wrap: wrap; font-size: 14px; }
.settings-params input { padding: 5px 8px; border: 1px solid var(--card-border); border-radius: 8px; background: var(--card); color: var(--text); font-family: inherit; }
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 标签改名后已有事项徽章与 chips 同步、颜色即时变；删标签引用被移除；加固定事项「日报」后把 lastActiveDate 改昨天刷新 → inbox 出现「日报」；三个参数修改即时生效（maxDoing=1 时第二条拖入被拦）；备份绑定状态文案正确。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 设置页（标签/每日固定事项/参数/备份绑定）"
```

---

### Task 18: 今日收尾与快捷键

**Files:**
- Modify: `todo.html`（弹窗 + DOM 层）

**Interfaces:**
- Consumes: Task 4 `buildDailySummary`；Task 5 `copyText`；Task 9 `startFocus`/`exitFocus`
- Produces: `#modal-summary`（pre + 复制按钮）；全局键盘监听（输入框内不触发）：`N` 添加框、`/` 搜索框、`1/2/3` 切视图、`F` 聚焦、`Esc` 关弹窗/退出聚焦

- [ ] **Step 1: 实现收尾弹窗与快捷键**

HTML：

```html
<div class="modal-backdrop" id="modal-summary">
  <div class="modal" style="max-width:560px">
    <h3>今日收尾</h3>
    <pre id="summary-pre" style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7;background:var(--bg);padding:14px;border-radius:10px"></pre>
    <div class="modal-actions">
      <button class="btn" id="btn-summary-close">关闭</button>
      <button class="btn primary" id="btn-summary-copy">一键复制</button>
    </div>
  </div>
</div>
```

DOM 层：

```js
document.getElementById('btn-summary').addEventListener('click', () => {
  document.getElementById('summary-pre').textContent =
    buildDailySummary(state.tasks, state.todayFocusMs, todayStr(Date.now()));
  document.getElementById('modal-summary').classList.add('show');
});
document.getElementById('btn-summary-close').addEventListener('click', () =>
  document.getElementById('modal-summary').classList.remove('show'));
document.getElementById('btn-summary-copy').addEventListener('click', () =>
  copyText(document.getElementById('summary-pre').textContent)
    .then(ok => showToast(ok ? '已复制收尾总结' : '复制失败')));

window.addEventListener('keydown', e => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (e.key === 'Escape') {
    const open = document.querySelector('.modal-backdrop.show');
    if (open) { open.classList.remove('show'); return; }
    if (state.focusSession) { exitFocus(); return; }
    return;
  }
  if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); document.getElementById('input-add').focus(); }
  else if (e.key === '/') { e.preventDefault(); document.getElementById('search-input').focus(); }
  else if (e.key === '1') showView('today');
  else if (e.key === '2') showView('done');
  else if (e.key === '3') showView('history');
  else if (e.key === 'f' || e.key === 'F') {
    if (state.focusSession) return;   // 已聚焦无操作
    const target = zoneTasks('doing')[0] || zoneTasks('inbox')[0];
    if (target) startFocus(target.id);
  }
});
```

- [ ] **Step 2: 检查** — `node tests/syntax-check.js` → OK

- [ ] **Step 3: 手工冒烟** — 收尾弹窗格式与 spec §5.9 模板一致（含子任务缩进 ✓ 行）；复制到剪贴板内容一致；`N`/`/` 聚焦输入框、`123` 切视图、`F` 开始聚焦（再按无效）、输入英文时不触发快捷键、`Esc` 逐层关闭（弹窗→聚焦）。

- [ ] **Step 4: Commit**

```bash
git add todo.html
git commit -m "feat: 今日收尾弹窗与全局快捷键"
```

---

### Task 19: 视觉打磨、完整冒烟与交付检查

**Files:**
- Modify: `todo.html`（CSS 细节）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 最终交付版

- [ ] **Step 1: 视觉统一打磨**

CSS 检查/追加：视图切换淡入（`#view-today,#view-done,#view-history { animation: fadeIn .2s; }` + `@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } }`）；聚焦卡片 `transform: scale(1.01)`；所有时长/计时元素确认 `font-variant-numeric: tabular-nums`；深色模式下逐屏核对对比度（标签徽章白字在深底仍可读；「深度」`#1E293B` 徽章在深色模式下加 `text-shadow: 0 1px 2px rgba(255,255,255,.35)` 或描边 `border: 1px solid rgba(255,255,255,.25)`）；滚动条样式微调（`::-webkit-scrollbar` 8px 圆角）；`<title>` 与页面空状态文案核查中文一致。

- [ ] **Step 2: 运行全部测试**

Run: `node tests/core.test.js` → 28 passed, 0 failed；Run: `node tests/syntax-check.js` → OK

- [ ] **Step 3: 完整手工冒烟清单（对照 spec §5 逐项）**

1. 添加/批量添加（各前缀、复制格式恢复）✓
2. 勾选完成、复活、删除 ✓
3. 子任务增删勾选、展开默认收起、`2/5` 徽标 ✓
4. 标签指定、chips 过滤、设置页增删改色 ✓
5. 拖拽：区内排序、inbox↔doing、拖 Tab 完成、doing 上限拦截 ✓
6. 聚焦：毛玻璃、计时跳动、刷新恢复、取消/完成结算、今日总聚焦 ✓
7. 休息提醒（阈值、弹窗文案逐字「站起来动动老胳膊老腿！！！」、倒计时、跳过）✓
8. 最低完成线：设置、红点、达成变绿、次日失效（改 lastActiveDate 验证）✓
9. 跨天：归档、滚入「遗」角标、固定事项注入、聚焦时长归档 ✓
10. 历史页：分组、当日聚焦时长、复制、恢复到今日 ✓
11. 搜索：今日/历史分开、子任务命中、大小写 ✓
12. 导出今日/全部、导入合并/替换、备份绑定与自动写入 ✓
13. 收尾总结格式逐字核对（含子任务缩进行）✓
14. 快捷键 N // 1 2 3 F Esc ✓
15. 主题三态、深色全屏走查 ✓
16. 进度条口径 = 完成/总数 ✓
17. `file://` 直接双击打开（Edge/Chrome）无控制台报错 ✓

- [ ] **Step 4: 最终提交**

```bash
git add todo.html
git commit -m "polish: 视觉统一、深色对比度与交付冒烟通过"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §2 数据模型（Task 1/5）、§3 跨天引擎（Task 2/12）、§4 界面结构（Task 5/6/13）、§5.1 聚焦（Task 9）、§5.2 休息（Task 10）、§5.3 完成线（Task 4/11）、§5.4 拖拽（Task 8）、§5.5 复制与批量（Task 3/15）、§5.6 导入导出（Task 16）、§5.7 备份（Task 16）、§5.8 搜索过滤（Task 14）、§5.9 收尾（Task 4/18）、§5.10 快捷键（Task 18）、§5.11 设置（Task 17）、§6 视觉（Task 5/19）、§8 测试（Task 1–4 + 各任务检查步）——全覆盖
- **占位符扫描**：Task 9 的 `showRestPrompt` 空函数与 Task 5 的 `scheduleBackup` 空函数均为显式占位并在后续任务实装（计划内注明），非遗留 TODO
- **命名一致性**：`moveTask/completeTask/deleteTask/createTask/buildTaskCard/renderAll/save()` 等在 Task 5–18 间引用一致；纯函数名与测试导出一致
