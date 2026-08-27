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

// ---- Task 4 ----
t('收尾总结完整格式', () => {
  const T = new Date(2026, 7, 26, 10, 0).getTime();
  const tasks = [
    mkTask('done', 'MySQL 压测', { subtasks: [
      { id: '1', text: '建表造数', done: true, doneAt: T }, { id: '2', text: '跑压测', done: true, doneAt: T }] }),
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
MySQL 压测
    建表造数
    跑压测
监控脚本

遗留：
整理监控结论

正在处理：
Hermes 排查`);
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
A

遗留：
B`);
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

// ---- 批次2：标签优先级 / 提醒字段 ----
t('labelPriorityOf：无标签为0', () => {
  eq(core.labelPriorityOf(mkTask('inbox', 'A'), [{name:'脚本',color:'#000'}]), 0);
});
t('labelPriorityOf：多标签取最优先（最大值）', () => {
  const labels = [{name:'脚本',color:'#000',priority:2},{name:'无脑',color:'#000',priority:-1},{name:'时效',color:'#000'}];
  eq(core.labelPriorityOf(mkTask('inbox','A',{labels:['无脑']}), labels), -1);
  eq(core.labelPriorityOf(mkTask('inbox','A',{labels:['脚本','无脑']}), labels), 2);
});
t('labelPriorityOf：标签缺 priority 字段按0', () => {
  eq(core.labelPriorityOf(mkTask('inbox','A',{labels:['时效']}), [{name:'时效',color:'#000'}]), 0);
});
t('rollover：提醒字段跨天清空', () => {
  const s = mkState({ lastActiveDate: '2026-08-25',
    tasks: [mkTask('inbox','B',{remindAt: 12345, reminded: true})] });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(by(r.state, 'B').remindAt, null);
  eq(by(r.state, 'B').reminded, false);
});

// ---- 批次4：focusLog / 时间轴 ----
t('settleFocusSession：追加今日聚焦区间到 focusLog', () => {
  const task = mkTask('doing', 'A');
  const s = mkState({ tasks: [task], focusSession: { taskId: task.id, startAt: 1000000 }, focusLog: [{start: 5, end: 600000}] });
  const r = core.settleFocusSession(s, 1000000 + 120000);
  eq(r.state.focusLog, [{start:5,end:600000},{start:1000000,end:1120000}]);
});
t('rollover：focusLog 跨天清空', () => {
  const s = mkState({ lastActiveDate: '2026-08-25', focusLog: [{start:1,end:2}], tasks: [mkTask('inbox','B')] });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.state.focusLog, []);
});
t('layoutTimeline：区间映射、边界钳制与丢弃零宽', () => {
  const base = new Date(2026, 7, 26, 0, 0, 0).getTime();
  const r1 = core.layoutTimeline([{start: base + 10*3600000, end: base + 11*3600000}], base, 9, 22);
  eq(r1.length, 1);
  if (Math.abs(r1[0].leftPct - 100/13) > 0.01) throw new Error('left wrong: ' + r1[0].leftPct);
  if (Math.abs(r1[0].widthPct - 100/13) > 0.01) throw new Error('width wrong: ' + r1[0].widthPct);
  const r2 = core.layoutTimeline([{start: base + 8*3600000, end: base + 9.5*3600000}], base, 9, 22);
  eq(r2.length, 1);
  if (Math.abs(r2[0].leftPct) > 0.01) throw new Error('clamp-left wrong');
  if (Math.abs(r2[0].widthPct - 50/13) > 0.01) throw new Error('clamp-width wrong');
  eq(core.layoutTimeline([{start: base + 23*3600000, end: base + 23.5*3600000}], base, 9, 22), []);   // 完全在 22 点后丢弃
});

// ---- 批次11：收尾总结部分完成区块 ----
t('buildDailySummary：部分完成=当天有完成子事项（昨天勾选的不算）', () => {
  const T = new Date(2026, 7, 26, 10, 0).getTime();
  const Y = new Date(2026, 7, 25, 10, 0).getTime();
  const tasks = [
    mkTask('done', 'A'),
    mkTask('inbox', 'B', { subtasks: [{id:'1',text:'子1',done:true,doneAt:T},{id:'2',text:'子2',done:false}] }),
    mkTask('doing', 'C', { subtasks: [{id:'3',text:'子3',done:true,doneAt:T}] }),
    mkTask('inbox', 'D', { subtasks: [{id:'4',text:'旧的',done:true,doneAt:Y}] }),   // 昨天勾选→不计入
    mkTask('inbox', 'E')
  ];
  const s = core.buildDailySummary(tasks, 0, '2026-08-26');
  if (!s.includes('\n部分完成：\nB\n    子1\nC\n    子3\n\n遗留：')) throw new Error('partial block wrong: ' + s);   // 区块后直接接遗留区，D/E 只在遗留
  if (s.includes('旧的')) throw new Error('昨天勾选的子任务不应出现');
});

// ---- 批次12：休息提醒轮次累计 ----
t('settleFocusSession：轮次累计跨会话触发休息阈值', () => {
  const a = mkTask('doing', 'A');
  const s1 = mkState({ tasks: [a], focusSession: { taskId: a.id, startAt: 0 } });
  const r1 = core.settleFocusSession(s1, 20 * 60000);   // 第一段 20min
  eq(r1.needRest, false);
  eq(r1.state.cycleFocusMs, 20 * 60000);
  const b = mkTask('doing', 'B');
  const s2 = mkState({ tasks: [b], cycleFocusMs: 20 * 60000, focusSession: { taskId: b.id, startAt: 0 } });
  const r2 = core.settleFocusSession(s2, 26 * 60000);   // 第二段 26min，累计 46 ≥ 45
  eq(r2.needRest, true);
  eq(r2.state.cycleFocusMs, 46 * 60000);
});
t('rollover：cycleFocusMs 跨天清零（新一天新轮次）', () => {
  const s = mkState({ lastActiveDate: '2026-08-25', cycleFocusMs: 12345, tasks: [mkTask('inbox', 'B')] });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.state.cycleFocusMs, 0);
});

// ---- 批次13：统计 ----
t('rollover：focusLog 归档进对应历史日', () => {
  const s = mkState({ lastActiveDate: '2026-08-25', focusLog: [{start: 1, end: 2}],
    tasks: [mkTask('done', 'A', { completedAt: 5 })] });
  const r = core.rollover(s, new Date(2026, 7, 26, 9, 0));
  eq(r.state.history[0].focusLog, [{start: 1, end: 2}]);
  eq(r.state.focusLog, []);
});
t('buildStatsDays：历史合并、今天注入、空档补零、范围外排除', () => {
  const s = mkState({ history: [{ date: '2026-08-24', focusMs: 600000, tasks: [mkTask('done', 'X')], focusLog: [{start: 1, end: 2}] }],
    tasks: [mkTask('doing', 'T')], todayFocusMs: 300000, focusLog: [{start: 3, end: 4}] });
  const days = core.buildStatsDays(s, '2026-08-24', '2026-08-26', '2026-08-26');
  eq(days.length, 3);
  eq(days[0], { date: '2026-08-24', focusMs: 600000, tasks: s.history[0].tasks, focusLog: [{start:1,end:2}], isToday: false });
  eq(days[1], { date: '2026-08-25', focusMs: 0, tasks: [], focusLog: [], isToday: false });   // 空档补零
  eq(days[2].isToday, true);
  eq(days[2].focusMs, 300000);
  eq(days[2].tasks, s.tasks);
  eq(days[2].focusLog, [{start: 3, end: 4}]);
});
t('labelFocusTotals：多标签均摊、无标签桶、按时长降序', () => {
  const labels = [{name:'脚本',color:'#000'},{name:'无脑',color:'#111'}];
  const days = [{ date: '2026-08-26', focusMs: 0, isToday: true, focusLog: [], tasks: [
    mkTask('done', 'A', { labels: ['脚本', '无脑'], focusMsToday: 60000 }),   // 各 30000
    mkTask('done', 'B', { focusMsToday: 20000 }),                             // 无标签 20000
    mkTask('done', 'C', { labels: ['脚本'], focusMs: 999999, focusMsToday: 0 })   // 批次14：仅累计值不算当日
  ]}];
  eq(core.labelFocusTotals(days, labels), [
    { name: '脚本', color: '#000', ms: 30000 },
    { name: '无脑', color: '#111', ms: 30000 },
    { name: '无标签', color: '#94A3B8', ms: 20000 }
  ]);
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
