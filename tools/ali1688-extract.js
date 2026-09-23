/**
 * 帛卉 1688 商品抓取器 v2 —— 规范流程,一段代码跑所有商品页,不逐页手调。
 *
 * 在浏览器里跑,只读:不点按钮、不提交表单、不动购物车。
 * 图片走 CDN 直链下载(实测不带登录态也能取),所以整个流程不碰创始人的账号。
 *
 * ── v1 为什么不够(2026-09-07 实测两个商品后改的)
 * v1 只读「商品属性 → 规格」,拿到的是「300ml,500ml,400ml」这种一维串。
 * 但真正权威的是「包装信息 → 商品件重尺」那张表:一行一个 SKU,
 * 容量、配色、泵头、材质全在里面。同一个商品,v1 读出 3 条,v2 读出 12 条 ——
 * 差的那 9 条正是「透明瓶+平头泵 / 透明瓶+翘嘴泵 / 透黄+平头泵 / 透黄+翘嘴泵」
 * 这些配色与泵头组合,而采购下单时指的就是这一层。
 * 所以 v2 以矩阵表为准,「规格」串只做兜底。
 *
 * ── v3 再补一层:规格选择器(2026-09-07,创始人:「网页还有属性」)
 * 属性表之外,页面右侧还有一个可点选的规格选择器,里面有属性表没有的东西:
 * **每个颜色变体自带一张缩略图**(透明瓶+平头泵 / 透明瓶+翘嘴泵 / 透黄+平头泵 / 透黄+翘嘴泵),
 * 以及库存数。变体缩略图很有用 —— 包材单品页上「这一款有哪几个配色」正好用它。
 * 价格与发货地一律不取:我们的包材库不公开报价,发货地对客户没有意义。
 *
 * ── 还多拿到的字段(v1 全漏了)
 * 型号(Y24/Y28)· 货号 · 公差(±1ml)· 工艺(注塑/吹瓶)· 表面处理 · 配附件(泵头)
 * · 是否可加工定制 · 产地。这些是采购真正要问的,写在包材单品页上比什么都实在。
 *
 * ── 用法
 * 由 Claude 通过 javascript_tool 在商品页执行,返回 JSON 字符串;
 * 多个商品的 JSON 汇成数组交给 tools/ali1688-ingest.py 落地。
 *
 * ── 纪律
 * · 只取商品主图(cbu01 的 ibank 路径),详情长图一概不要 —— 那是别家的排版与文案。
 * · 不读价格。我们的包材库不公开报价,抓回来只会诱导人往页面上放。
 * · 供应商名进 supplier_ref(内部),不进任何对外字段。
 */
(() => {
  const t = (document.body.innerText || '').replace(/[ \t]+/g, ' ');

  /* 属性表:1688 渲染成「键\n值」两行一组,按已知键名逐个取,比按位置切稳 */
  const KEYS = ['材质', '规格', '产地', '原产国/地区', '是否进口', '型号', '货号', '工艺',
    '表面处理', '品牌', '主要下游平台', '主要销售地区', '有可授权的自有品牌',
    '是否跨境出口专供货源', '误差', '颜色', '包装层次', '包装型式', '产品名称',
    '适用对象', '风格', '配附件', '是否可加工定制', '加工定制', '口径', '容量',
    '形状', '适用范围', '类型',
    '尺寸', '瓶身尺寸', '产品尺寸', '直径', '瓶身直径', '高度', '瓶高', '长宽高', '净重', '重量', '单个重量', '壁厚'];   // 2026-09-16 创始人:有尺寸的瓶子要标出来
  const attrs = {};
  const s0 = t.lastIndexOf('商品属性');
  if (s0 > -1) {
    const seg = t.slice(s0 + 4, s0 + 2600);
    for (const k of KEYS) {
      const re = new RegExp('(?:^|\\n)\\s*' + k.replace(/[/]/g, '\\/') + '\\s*\\n\\s*([^\\n]{1,220})');
      const m = seg.match(re);
      if (m && m[1].trim() && !KEYS.includes(m[1].trim())) attrs[k] = m[1].trim();
    }
  }

  /* SKU 矩阵。「商品件重尺」下面每行形如「300ml;透明瓶+平头泵;pet 1」。
     没有这张表的商品(比如只卖单一规格的)回落到「规格」串。 */
  const skus = [];
  const s1 = t.indexOf('商品件重尺');
  if (s1 > -1) {
    for (const ln of t.slice(s1, s1 + 6000).split('\n')) {
      /* 2026-09-16:件重尺表的列是「规格型号 ⇥ 长(cm) ⇥ 宽(cm) ⇥ 高(cm) ⇥ 体积(cm³) ⇥ 重量(g)」,尺寸与重量一起收(创始人:客户要知道瓶子尺寸) */
      const m = ln.match(/^\s*([^;；]{1,24})[;；]([^;；]{1,40}?)(?:[;；]([^;；\s]{1,20}))?((?:\s+[\d.]+){0,5})\s*$/);   // 顶部已把 tab 压成空格
      if (!m) continue;
      const cap = m[1].trim();
      if (!/\d/.test(cap)) continue;                 // 容量列必须带数字,挡掉表头与说明行
      const nums = (m[4] || '').trim().split(/\s+/).filter(Boolean).map(Number);
      const sku = { capacity: cap, variant: m[2].trim(), material: (m[3] || '').trim() };
      if (nums.length >= 5) Object.assign(sku, { l_cm: nums[0], w_cm: nums[1], h_cm: nums[2], vol_cm3: nums[3], weight_g: nums[4] });
      skus.push(sku);
    }
  }
  if (!skus.length && attrs['规格']) {
    for (const v of attrs['规格'].split(/[,、,]/)) {
      const x = v.trim();
      if (x) skus.push({ capacity: x, variant: '', material: attrs['材质'] || '' });
    }
  }

  const clean = (u) => (u || '').split('?')[0].replace(/_\d+x\d+[^/]*$/, '').replace(/\.jpg_\.webp$/, '.jpg');

  /* 规格选择器。类名带哈希,所以按「组名文本 + 其后的可点选项」找,不写死类名。
     要滤掉三类噪音:组名自己被当成一项、价格(¥…)、库存文本 —— 实测这三样都会混进来。 */
  const GROUP_NAMES = ['规格', '颜色', '材质', '尺寸', '型号', '容量', '款式'];
  const groups = [];
  for (const el of document.querySelectorAll('div,section')) {
    const head = ((el.childNodes[0] && el.childNodes[0].textContent) || '').trim();
    if (!GROUP_NAMES.includes(head)) continue;
    if (el.querySelectorAll('*').length > 400) continue;
    const options = [];
    for (const o of el.querySelectorAll('[class*="item"],[class*="Item"],button,label,li')) {
      const label = (o.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 30) continue;
      if (label === head) continue;                       // 组名自己
      if (/[¥$]|库存|起批|已售/.test(label)) continue;      // 价格与库存不进选项
      const img = o.querySelector('img');
      if (!options.some((x) => x.label === label)) {
        options.push({ label, img: img ? clean(img.src || img.getAttribute('data-src')) : '' });
      }
    }
    if (options.length && !groups.some((g) => g.name === head)) groups.push({ name: head, options });
  }
  const stock = ((document.body.innerText || '').replace(/\s+/g, ' ')
    .match(/库存\s*([\d,]+\s*[套只个件]?)/) || [])[1] || '';
  const images = [...new Set([...document.querySelectorAll('img')]
    .map((i) => i.src || i.getAttribute('data-src') || '')
    .filter((x) => x.includes('cbu01.alicdn.com/img/ibank/'))
    .map(clean))];

  return JSON.stringify({
    offerId: (location.pathname.match(/offer\/(\d+)/) || [])[1] || '',
    url: location.origin + location.pathname,
    title: (document.title || '').replace(/ - 阿里巴巴$/, '').trim(),
    brand: attrs['品牌'] || '',
    material: attrs['材质'] || '',
    process: attrs['工艺'] || '',
    surface: attrs['表面处理'] || '',
    origin: attrs['产地'] || '',
    model: attrs['型号'] || '',
    partNo: attrs['货号'] || '',
    tolerance: attrs['误差'] || '',
    accessories: attrs['配附件'] || '',
    customizable: attrs['是否可加工定制'] || attrs['加工定制'] || '',
    productName: attrs['产品名称'] || '',
    colors: attrs['颜色'] || '',
    dims: ['尺寸', '瓶身尺寸', '产品尺寸', '长宽高', '直径', '瓶身直径', '高度', '瓶高', '壁厚'].filter((k) => attrs[k]).map((k) => k + ' ' + attrs[k]).join(' · '),
    // 属性表没写尺寸时,拿件重尺表第一行的长×宽×高(cm)顶上;每个 SKU 自己的 l_cm/w_cm/h_cm/weight_g 在 skus 里
    dimsFromSku: (skus.find((x) => x.h_cm) ? `${skus.find((x) => x.h_cm).l_cm}×${skus.find((x) => x.h_cm).w_cm}×${skus.find((x) => x.h_cm).h_cm} cm` : ''),
    weight: attrs['净重'] || attrs['重量'] || attrs['单个重量'] || '',
    skuCount: skus.length,
    skus,
    groups,          // 规格选择器:每个颜色变体带自己的缩略图
    stock,
    images,
    attrs,
  });
})()
