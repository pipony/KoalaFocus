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
