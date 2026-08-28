/**
 * 配方匹配自测 —— 重点是「重写后结果和原实现一致」,不是「新写法更好看」。
 * 优化的前提是行为不变;不比对就等于凭感觉说没坏。
 */
import { FORMULA_LIBRARY, normalizeLabel, matchFormulas } from './formulas.js';

/* 原实现,原样搬来当基准 */
const TAG_ALIAS = {"防晒":["防晒","sun","uv","防嗮"],"润肤":["润肤","滋润","润泽","moistur","emollient"],"保湿":["保湿","补水","水润","hydrat","补湿"],"抗敏":["抗敏","抗过敏","敏感","sensitive","低敏","温和"],"止痒":["止痒","瘙痒","itch","痒"],"美白":["美白","提亮","淡斑","brighten","whiten","暗沉","去黄"],"抗老":["抗老","抗衰","抗皱","紧致","淡纹","anti-aging","aging","熟龄"],"控油":["控油","油性","出油","oil","清爽"],"修护":["修护","修复","repair","修復"],"舒缓":["舒缓","镇静","sooth","泛红","红肿"],"屏障":["屏障","屏障修护","屏障修复","barrier","皮脂膜"],"祛痘":["祛痘","痘痘","痘印","粉刺","acne","痘"],"清洁":["清洁","洁面","洗面","cleans","去角质"],"身体":["身体","body","全身"],"唇部":["唇部","唇","lip"],"熬夜":["熬夜","急救","去黄"]};
const oldNormalize = (raw) => {
  const q = String(raw || '').toLowerCase(); const hit = [];
  for (const [c, al] of Object.entries(TAG_ALIAS)) if (al.some((a) => q.includes(a))) hit.push(c);
  return hit;
};
const oldMatch = (labels) => FORMULA_LIBRARY
  .map((f) => ({ f, score: labels.reduce((n, lb) => n + (f.tags.includes(lb) ? 1 : 0), 0) }))
  .filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
  .slice(0, 10).map((x) => x.f.name);

let pass = 0, fail = 0;
const t = (name, ok) => { ok ? (pass++, console.log('  ✓', name)) : (fail++, console.log('  ✗', name)); };

console.log(`配方 ${FORMULA_LIBRARY.length} 条`);

console.log('\n标签识别与原实现一致');
for (const q of ['防晒 修护', '敏感肌泛红', '美白淡斑', '油痘肌控油', 'barrier repair',
                 '熬夜暗沉去黄', '身体润肤', '唇部干裂', '抗老紧致淡纹', '温和洁面', '', '完全无关的一句话']) {
  const a = [...oldNormalize(q)].sort(), b = [...normalizeLabel(q)].sort();
  t(`「${q || '(空)'}」→ ${b.join('/') || '(无)'}`, JSON.stringify(a) === JSON.stringify(b));
}

console.log('\n匹配结果集合与原实现一致(同分顺序按原始下标,更稳定)');
for (const q of ['防晒', '修护 屏障', '美白 提亮', '保湿补水', '祛痘控油', '身体 润肤']) {
  const labels = normalizeLabel(q);
  const a = [...oldMatch(labels)].sort();
  const b = [...matchFormulas(labels).top.map((x) => x.name)].sort();
  t(`「${q}」命中 ${b.length} 条`, JSON.stringify(a) === JSON.stringify(b));
}

console.log('\n结构与边界');
const r = matchFormulas(normalizeLabel('防晒 修护'));
t('返回 benefit 取首个分句', r.top[0]?.benefit === String(r.top[0]?.brief).split(/[，,]/)[0]);
t('effect_comparison 四个字段齐', Object.keys(r.top[0]?.effect_comparison ?? {}).length === 4);
t('结果里不带内部 tags 字段', !('tags' in (r.top[0] ?? {})));
t('comparison 与 top 等长', r.comparison.items.length === r.top.length);
t('空标签返回空', matchFormulas([]).top.length === 0);
t('最多 10 条', matchFormulas(Object.keys(TAG_ALIAS)).top.length <= 10);
t('两次调用结果完全一致(可复现)',
  JSON.stringify(matchFormulas(normalizeLabel('保湿'))) === JSON.stringify(matchFormulas(normalizeLabel('保湿'))));

console.log('\n品名兜底');
t('描述为空、品名是防晒霜 → 认出防晒', normalizeLabel('', '清透防晒霜').includes('防晒'));
t('描述为空、品名是眼霜 → 认出抗老', normalizeLabel('', '赋活眼霜').includes('抗老'));
t('描述已认出标签时不再用品名瞎猜', normalizeLabel('美白', '面霜').join() === '美白');

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
