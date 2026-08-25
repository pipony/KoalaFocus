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

// ---- helpers ----
function mkState(opts) { const s = core.defaultState(0); return Object.assign(s, opts); }
function mkTask(zone, text, extra) {
  return Object.assign({ id: core.genId(1), text: text, zone: zone, labels: [], subtasks: [],
    focusMs: 0, focusMsToday: 0, minLine: null, minLineMet: false, rolledOver: false,
    createdAt: 1, completedAt: null }, extra || {});
}
function by(st, txt) { return st.tasks.find(t => t.text === txt); }

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

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
