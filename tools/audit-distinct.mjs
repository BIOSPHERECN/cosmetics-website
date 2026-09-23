/**
 * 五站文案雷同度检查。
 *
 * 同一个工厂开五个站,是为了从不同角度打不同的客户。
 * 但这也是最容易翻车的地方:图省事把 A 站的文案抄到 B 站,
 * 客户同时收到三个域名、一看文案一样,只会得出「这家在批量刷站」的结论 ——
 * 五个站的效果还不如一个。
 *
 * 判据不看「有没有相同的句子」——数字、认证名、公司全称本来就该一样。
 * 看的是**成句的长文本有多少是逐字重复的**:
 * 一句 30 字以上的话在两个站上一字不差,那就是抄的。
 */
const BASE = process.argv[2] || 'https://bohui-web.huanggw20.workers.dev';
const SITES = ['biosphere-ai', 'beauty2oem', 'skin2oem', 'medierba', 'biosphere-oralcare'];

/**
 * 只取 <main> 里的内容,并且**先切掉集团生态版块与页脚**。
 *
 * 第一版没切,结果七对站点全被判成「雷同」——
 * 但重合的是「以 BIOSPHERE-AI 为科技大脑,构建美妆与口腔健康产业生态」
 * 和集团口号「One plant. An Eastern mission.」。
 * 那两段**本来就该五站一字不差**:它们描述的是集团结构,不是某个站自己的主张。
 *
 * 把共用件算进雷同度,等于惩罚「集团品牌统一」这件正确的事,
 * 而真正要防的「A 站文案抄到 B 站」反而被稀释了。
 */
const ownBody = (h) => {
  const m = /<main[\s\S]*?<\/main>/i.exec(h);
  let s = m ? m[0] : h;
  s = s.replace(/<section[^>]*class="[^"]*\beco\b[^"]*"[\s\S]*?<\/section>/gi, ' ')  // 集团生态
       .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')                                  // 页脚
       .replace(/<script[\s\S]*?<\/script>/g, ' ')
       .replace(/<style[\s\S]*?<\/style>/g, ' ');
  return s.replace(/<[^>]+>/g, '\n').replace(/&[a-z]+;/g, ' ');
};

/** 只取成句的长文本。短串(认证名、单位、按钮字)本来就该跨站一致 */
const sentences = (txt) => [...new Set(
  txt.split(/[\n。!?;]/).map((s) => s.trim()).filter((s) => s.length >= 30))];

const corpus = {};
for (const s of SITES) {
  const r = await fetch(`${BASE}/zh-cn/?site=${s}`, { signal: AbortSignal.timeout(45000) });
  corpus[s] = new Set(sentences(ownBody(await r.text())));
}

console.log(`\n════ 五站首页文案雷同度 ════\n`);
for (const s of SITES) console.log(`  ${s.padEnd(20)}成句长文本 ${corpus[s].size} 句`);

console.log('\n  两两重合:');
const fail = [];
for (let i = 0; i < SITES.length; i++) {
  for (let j = i + 1; j < SITES.length; j++) {
    const a = corpus[SITES[i]], b = corpus[SITES[j]];
    const shared = [...a].filter((x) => b.has(x));
    const base = Math.min(a.size, b.size) || 1;
    const pct = Math.round((shared.length / base) * 100);
    const flag = pct >= 40;
    console.log(`  ${flag ? '★' : ' '} ${SITES[i].padEnd(19)}× ${SITES[j].padEnd(20)}${String(shared.length).padStart(3)} 句重合 · ${pct}%`);
    if (flag) {
      fail.push(`${SITES[i]} 与 ${SITES[j]} 首页有 ${pct}% 的长句逐字相同`);
      shared.slice(0, 2).forEach((x) => console.log(`      · ${x.slice(0, 60)}…`));
    }
  }
}

console.log('\n════ 结论 ════');
console.log(fail.length
  ? `  ${fail.length} 对站点文案过于雷同:\n   · ${fail.join('\n   · ')}`
  : '  五站文案各写各的,没有大段照抄。');
