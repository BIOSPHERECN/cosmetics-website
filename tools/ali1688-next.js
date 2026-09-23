/* 1688 店铺「全部商品」页的「下一页」控件定位。
   2026-09-22 21:2x:85 家店里 14 家恰好只收到 30 条(= 首屏一页),其中有入驻 18 年、上千款的老厂,
   显然不是「店里只有 30 款」,而是翻页没点动 —— 而旧代码把「点不动」直接当成「到末页」,
   于是这些厂被写进 rejected.csv 判了「不达标」。误杀比噪音严重,所以把「找下一页」单独抽出来:
     · 只认短文本节点(整块容器的 textContent 也会包含「下一页」三个字,点它没用)
     · 必须可见、未禁用(末页的下一页是灰的,点了也不动,要能区分「末页」和「没找到」)
     · 文本、aria-label、class 三条线都认,优先级:精确文本 > aria > class > 符号
   返回:可点的元素,或 null(= 真的没有下一页)。Python 侧用 evaluate_handle 拿到它再发真实点击事件,
   不在这里 el.click() —— 前端框架常只认真实 pointer 事件。*/
() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.pointerEvents !== 'none' && +s.opacity !== 0;
  };
  const dead = (el) => {
    const cls = (el.getAttribute('class') || '') + ' ' + (el.getAttribute('aria-disabled') === 'true' ? 'disabled' : '');
    return el.disabled === true || /disabled|disable|\bgray\b|\bgrey\b|not-?allowed|forbid/i.test(cls);
  };
  const EXACT = /^(下一页|下页|下一頁|next|next page|>|›|»|→)$/i;
  const hits = [];
  for (const el of document.querySelectorAll('a,button,li,span,i,div[role="button"],div[class*="next"],div[class*="page"]')) {
    const t = (el.textContent || '').replace(/\s+/g, '').trim();
    if (t.length > 8) continue;                      // 短文本节点才是按钮本身
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const cls = el.getAttribute('class') || '';
    let rank = 0;
    if (EXACT.test(t)) rank = 4;
    else if (/下一页|下页|next/i.test(aria)) rank = 3;
    else if (/(^|[-_ ])(next|nextpage|pagination-next)([-_ ]|$)/i.test(cls)) rank = 2;
    else if (/^[>›»→]$/.test(t)) rank = 1;
    if (!rank) continue;
    if (!vis(el) || dead(el)) continue;
    hits.push({ el, rank, area: el.getBoundingClientRect().top });
  }
  if (!hits.length) return null;
  // 同分取页面里最靠下的那个:分页条在商品列表下方,页眉/推荐位里的同名元素排在上面
  hits.sort((a, b) => b.rank - a.rank || b.area - a.area);
  return hits[0].el;
}
