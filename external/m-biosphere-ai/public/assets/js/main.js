/* BIOSPHERE-AI 品牌站 - 交互脚本 */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ============ Header 滚动 ============ */
  var header = $('#siteHeader');
  var onScroll = function () {
    if (!header) return;
    if (window.scrollY > 10) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ============ 移动端菜单 ============ */
  var menuBtn = $('.menu-btn');
  var navLinks = $('#navLinks');
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', function () {
      var open = navLinks.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $$('.nav-item > a, .nav-item > button', navLinks).forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.innerWidth < 1024) navLinks.classList.remove('open');
      });
    });
  }

  /* ============ 下拉菜单（移动端点击展开） ============ */
  $$('.nav-item.has-dropdown').forEach(function (item) {
    var btn = $('.nav-link', item);
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      if (window.innerWidth < 1024) {
        e.preventDefault();
        item.classList.toggle('open');
      }
    });
  });

    /* ============ Hero 静态 Banner（单图） ============ */
  var slider = $('#heroSlider');
  var slides = $$('.hero-slide', slider);
  if (slider && slides.length > 0) {
    slider.style.setProperty('--slide-index', 0);
  }

/* ============ 搜索 ============ */
  var searchToggle = $('#searchToggle');
  var searchBar = $('.search-bar');
  var searchInput = searchBar ? $('input', searchBar) : null;
  if (searchToggle && searchBar) {
    searchToggle.addEventListener('click', function () {
      searchBar.classList.toggle('open');
      if (searchBar.classList.contains('open') && searchInput) searchInput.focus();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      $$('.product-card').forEach(function (card) {
        var txt = (card.textContent || '').toLowerCase();
        card.style.display = (!q || txt.indexOf(q) > -1) ? '' : 'none';
      });
    });
  }

  /* ============ Reveal 滚动动画 ============ */
  var revealEls = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('visible'); });
  }

  /* ============ Toast 提示 ============ */
  var toast = $('#toast');
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  /* ============ 购物车 ============ */
  var cart = [];
  var cartDrawer = $('#cartDrawer');
  var cartOverlay = $('#cartOverlay');
  var cartClose = $('#cartClose');
  var cartBody = $('#cartBody');
  var cartFoot = $('#cartFoot');
  var cartTotalEl = $('#cartTotal');
  var cartCounts = $$('.cart-count');
  var priceNum = function (p) { return parseFloat(String(p).replace(/[^\d.]/g, '')) || 0; };
  var save = function () { try { localStorage.setItem('biosphere_cart', JSON.stringify(cart)); } catch(e) {} };
  var load = function () { try { return JSON.parse(localStorage.getItem('biosphere_cart')) || []; } catch(e) { return []; } };
  function addItem(name, price, img) {
    /* 购物车已移除 */
    showToast('已加入购物袋：' + name);
    if (cartDrawer) openCart();
  }

  function openCart() {
    if (!cartDrawer) return;
    cartDrawer.classList.add('open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeCart() {
    if (!cartDrawer) return;
    cartDrawer.classList.remove('open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);
  if (cartClose) cartClose.addEventListener('click', closeCart);

  function renderCart() {
    var total = 0;
    var totalQty = 0;
    var html = '';
    if (cart.length === 0) {
      html = '<p class="cart-empty">购物袋还是空的，去挑选本草好物吧。</p>';
      if (cartFoot) cartFoot.style.display = 'none';
    } else {
      cart.forEach(function (it, i) {
        var p = priceNum(it.price);
        total += p * it.qty;
        totalQty += it.qty;
        html +=
          '<div class="cart-item">' +
            (it.img ? '<img src="' + it.img + '" alt="' + it.name + '" loading="lazy">' : '<div class="cart-item-ph"></div>') +
            '<div class="cart-item-info">' +
              '<p class="cart-item-name">' + it.name + '</p>' +
              '<p class="cart-item-price">' + it.price + '</p>' +
              '<div class="cart-item-qty">' +
                '<button class="qty-btn" data-i="' + i + '" data-d="-1" aria-label="减少">−</button>' +
                '<span>' + it.qty + '</span>' +
                '<button class="qty-btn" data-i="' + i + '" data-d="1" aria-label="增加">+</button>' +
              '</div>' +
            '</div>' +
            '<button class="cart-item-remove" data-i="' + i + '" aria-label="移除">×</button>' +
          '</div>';
      });
      if (cartFoot) cartFoot.style.display = '';
    }
    if (cartBody) cartBody.innerHTML = html;
    if (cartTotalEl) cartTotalEl.textContent = '¥' + total.toFixed(0);
    cartCounts.forEach(function (el) { el.textContent = totalQty; });
    var c = $('#cartDrawerCount');
    if (c) c.textContent = '(' + totalQty + ')';
  }

  if (cartBody) {
    cartBody.addEventListener('click', function (e) {
      var btn = e.target.closest('.qty-btn');
      var rm = e.target.closest('.cart-item-remove');
      if (btn) {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        var d = parseInt(btn.getAttribute('data-d'), 10);
        if (!cart[i]) return;
        cart[i].qty += d;
        if (cart[i].qty <= 0) cart.splice(i, 1);
        save(); renderCart();
      } else if (rm) {
        var idx = parseInt(rm.getAttribute('data-i'), 10);
        if (cart[idx]) cart.splice(idx, 1);
        save(); renderCart();
        showToast('已移除商品');
      }
    });
  }

  $$('.quick-add').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.getAttribute('data-name') || '本草好物';
      var price = btn.getAttribute('data-price') || '¥0';
      var media = btn.closest('.product-media');
      var img = media ? $('img', media) : null;
      addItem(name, price, img ? img.getAttribute('src') : '');
    });
  });

  var cartToggle = $('.cart-btn');
  if (cartToggle) cartToggle.addEventListener('click', openCart);
  renderCart();

  /* ============ 订阅表单 ============ */
  $$('.subscribe-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('input[type="email"]', form);
      if (!input || !input.value || input.value.indexOf('@') < 0) {
        showToast('请填写有效的邮箱地址');
        return;
      }
      showToast('订阅成功，欢迎加入 BIOSPHERE-AI');
      form.reset();
    });
  });

  /* ============ 回到顶部 ============ */
  var backTop = $('.back-top');
  if (backTop) {
    window.addEventListener('scroll', function () {
      backTop.classList.toggle('show', window.scrollY > 600);
    }, { passive: true });
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();


/* ============ 产品详情弹层 ============ */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var PRODUCT_INFO = {
    "1": {
      name: "人参微光精华", en: "Ginseng Glow Serum",
      img: "images/medierba-prod-1.webp",
      spec: "30ml",
      tags: ["提亮焕活", "暗沉倦容", "精华"],
      rows: [
        ["核心成分", "人参皂苷 × 烟酰胺 × 泛醇，双通路点亮肌肤光泽。"],
        ["功效", "改善暗沉与黄气，提升肌肤通透感，持续使用焕发微光。"],
        ["适合肤质", "暗沉、熬夜倦容及初老肌肤；敏感肌建议先做局部测试。"],
        ["使用方式", "早晚洁面后，取 2-3 滴于掌心温热，按压全脸至吸收。"],
        ["本草溯源", "人参源自韩国与中国吉林，低温闪萃保留活性皂苷。"]
      ]
    },
    "2": {
      name: "灵芝修护面霜", en: "Reishi Repair Cream",
      img: "images/medierba-prod-2.webp",
      spec: "50g",
      tags: ["屏障修护", "干敏肌", "面霜"],
      rows: [
        ["核心成分", "灵芝多糖 × 神经酰胺 × 角鲨烷，三重修护屏障。"],
        ["功效", "舒缓干燥紧绷，强化皮脂膜，改善泛红与脆弱。"],
        ["适合肤质", "干性、敏感及屏障受损肌肤；换季期尤其适用。"],
        ["使用方式", "晚间于精华后取黄豆大小，掌心乳化后按压全脸。"],
        ["本草溯源", "灵芝经发酵工艺萃取多糖，修护力更易被肌肤吸收。"]
      ]
    },
    "3": {
      name: "积雪草舒缓水", en: "Centella Soothing Toner",
      img: "images/medierba-prod-3.webp",
      spec: "150ml",
      tags: ["舒缓泛红", "敏感肌", "爽肤水"],
      rows: [
        ["核心成分", "积雪草苷 × 泛醇 × 金缕梅，镇静舒缓配方。"],
        ["功效", "即时降温褪红，安抚刺激感，为后续护肤打好底。"],
        ["适合肤质", "敏感、泛红、晒后及屏障不稳定肌肤。"],
        ["使用方式", "洁面后取适量轻拍全脸，或湿敷于泛红区域 5 分钟。"],
        ["本草溯源", "积雪草原产印度与斯里兰卡，被称为「老虎草」的愈伤草本。"]
      ]
    },
    "4": {
      name: "绿茶平衡洁面", en: "Green Tea Balance Cleanser",
      img: "images/medierba-prod-4.webp",
      spec: "120ml",
      tags: ["控油平衡", "油痘肌", "洁面"],
      rows: [
        ["核心成分", "绿茶多酚 × 氨基酸表活，温和净澈不紧绷。"],
        ["功效", "洗去多余油脂与污垢，调节水油平衡，减少闷痘。"],
        ["适合肤质", "油性、混合性及痘痘肌；干皮可晚间使用。"],
        ["使用方式", "湿手取适量揉出泡沫，按摩全脸后清水冲净。"],
        ["本草溯源", "绿茶源自中国浙江，茶多酚是天然抗氧化尖兵。"]
      ]
    },
    "5": {
      name: "红参紧致眼霜", en: "Red Ginseng Firming Eye Cream",
      img: "images/medierba-prod-5.webp",
      spec: "30g",
      tags: ["紧致眼周", "初老肌", "眼霜"],
      rows: [
        ["核心成分", "红参提取 × 咖啡因 × 胜肽，紧致循环双管齐下。"],
        ["功效", "淡化干纹细纹，改善浮肿与暗沉，眼周更显紧致。"],
        ["适合肤质", "初老、熬夜及眼周浮肿肌肤。"],
        ["使用方式", "早晚取米粒大小，点涂眼周，用指腹轻拍至吸收。"],
        ["本草溯源", "红参经九蒸九晒古法炮制，活性成分浓度更高。"]
      ]
    },
    "6": {
      name: "发酵新生面膜", en: "Fermented Renewal Mask",
      img: "images/medierba-prod-6.webp",
      spec: "30ml×5",
      tags: ["焕新角质", "熬夜肌", "面膜"],
      rows: [
        ["核心成分", "酵母发酵滤液 × 透明质酸，温和代谢老废角质。"],
        ["功效", "改善粗糙与闭口，补水提亮，肌肤细滑透亮。"],
        ["适合肤质", "角质堆积、粗糙暗沉肌；每周 2-3 次。"],
        ["使用方式", "洁面后厚敷 10-15 分钟，温水洗净即可。"],
        ["本草溯源", "发酵是 BIOSPHERE-AI 三大核心技术之一，以生物转化释放草本能量。"]
      ]
    },
    "7": {
      name: "烟酰胺控油精华", en: "Niacinamide Sebum Control Serum",
      img: "images/medierba-prod-7.webp",
      spec: "30ml",
      tags: ["控油收毛孔", "油性肌", "精华"],
      rows: [
        ["核心成分", "烟酰胺 × PCA 锌 × 茶树提取，源头调控油脂分泌。"],
        ["功效", "减少油光、收敛毛孔，预防黑头与闭口生成。"],
        ["适合肤质", "油性、混油及毛孔粗大肌肤。"],
        ["使用方式", "洁面爽肤后取 2 滴，重点涂抹 T 区，日间可用。"],
        ["本草溯源", "搭配鼠尾草与迷迭香提取，草本协同控油。"]
      ]
    },
    "8": {
      name: "新草本旅行套装", en: "Herbal Travel Set",
      img: "images/medierba-prod-8.webp",
      spec: "5件套",
      tags: ["差旅便携", "全肤质", "套装"],
      rows: [
        ["套装内容", "洁面 30ml + 精华 15ml + 面霜 15ml + 眼霜 5ml 四件明星单品。"],
        ["功效", "一套搞定日常护肤全流程，旅行出差不将就。"],
        ["适合肤质", "全肤质通用，初次体验品牌的首选。"],
        ["使用方式", "按洁面-精华-眼霜-面霜顺序使用。"],
        ["本草溯源", "集结人参、灵芝、积雪草三大本草明星成分。"]
      ]
    },
    "9": {
      name: "灵芝精华油", en: "Reishi Facial Oil",
      img: "images/medierba-prod-9.webp",
      spec: "30ml",
      tags: ["滋润修护", "熟龄肌", "精华油"],
      rows: [
        ["核心成分", "灵芝油 × 角鲨烷 × 山茶花油，以油养肤。"],
        ["功效", "深层滋润、修复皮脂膜，改善干燥起皮与紧绷。"],
        ["适合肤质", "干皮、熟龄及缺水肌肤；秋冬季节尤其适合。"],
        ["使用方式", "取 3-4 滴于掌心搓热，按压全脸，可混合面霜使用。"],
        ["本草溯源", "山茶花油源自中国与日本，亲肤性极佳的植物油脂。"]
      ]
    },
    "10": {
      name: "透明质酸保湿面霜", en: "Hyaluronic Hydra Cream",
      img: "images/medierba-prod-10.webp",
      spec: "50g",
      tags: ["深层保湿", "缺水肌", "面霜"],
      rows: [
        ["核心成分", "多重分子透明质酸 × 泛醇 × 海藻提取，立体补水。"],
        ["功效", "由内到外层层锁水，缓解干燥紧绷，妆前打底服帖。"],
        ["适合肤质", "缺水、干性及外油内干肌肤。"],
        ["使用方式", "早晚涂抹于面部与颈部，按摩至吸收。"],
        ["本草溯源", "海藻源自法国布列塔尼海岸，富含矿物保湿因子。"]
      ]
    },
    "11": {
      name: "本草唇膏笔", en: "Herbal Lip Balm Pen",
      img: "images/medierba-prod-11.webp",
      spec: "3.2g",
      tags: ["润唇护唇", "唇部护理", "唇膏"],
      rows: [
        ["核心成分", "乳木果油 × 植物蜡 × 维生素 E，温和滋润。"],
        ["功效", "改善唇部干裂起皮，淡化唇纹，妆前打底不黏腻。"],
        ["适合肤质", "唇部干燥、起皮及日常护理。"],
        ["使用方式", "随时涂抹于双唇，睡前可厚涂做唇膜。"],
        ["本草溯源", "乳木果源自西非，是传承数百年的修护油脂。"]
      ]
    },
    "12": {
      name: "本草淡香水", en: "Botanical Eau de Parfum",
      img: "images/medierba-prod-12.webp",
      spec: "50ml",
      tags: ["本草香调", "日常香氛", "香水"],
      rows: [
        ["香调", "前调白茶与柚子，中调雪松与鼠尾草，尾调檀香与香根草。"],
        ["功效", "清雅草本气息，留香持久，沉稳不张扬。"],
        ["适合肤质", "所有人群；通勤、约会与日常皆宜。"],
        ["使用方式", "喷于手腕、耳后等脉搏处，香气更自然持久。"],
        ["本草溯源", "香料提取自地中海迷迭香与欧洲雪松，天然植萃香氛。"]
      ]
    }
  };

  var modal = $('#productModal');
  var modalBody = $('#modalBody');
  if (!modal || !modalBody) return;

  function openModal(id) {
    var p = PRODUCT_INFO[id];
    if (!p) return;
    var rows = (p.rows || []).map(function (r) {
      return '<div class="m-row"><h4>' + r[0] + '</h4><p>' + r[1] + '</p></div>';
    }).join('');
    var tags = (p.tags || []).map(function (t) { return '<span>' + t + '</span>'; }).join('');
    modalBody.innerHTML =
      '<div class="modal-media"><img src="' + p.img + '" alt="' + p.name + '"></div>' +
      '<div class="modal-info">' +
        '<p class="m-label">BIOSPHERE-AI</p>' +
        '<h2>' + p.name + '</h2>' +
        '<p class="m-en">' + p.en + '</p>' +
        '<div class="m-tags">' + tags + '</div>' +
        (p.spec ? '<div class="m-row"><h4>' + (window.__ZH_DICT && window.__ZH_DICT["prod.spec"] || "规格") + '</h4><p>' + p.spec + '</p></div>' : '') +
        rows +
        '<a class="m-cta" href="mailto:info@biosphere-ai.com?subject=' + encodeURIComponent(p.name) + ' Inquiry">' + (window.__ZH_DICT && window.__ZH_DICT["quick.contact"] || "联系我们") + '</a>' +
      '</div>';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  $$('.product-card').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('.quick-add') || e.target.closest('a')) return;
      var id = card.getAttribute('data-id');
      if (id) openModal(id);
    });
  });

  $$('[data-close]', modal).forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();

/* ============ AI 肌肤顾问（全领域护肤+推荐+多语言+语音+知识图谱） ============ */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var API = "/api/ai/chat";
  var MODEL = "deepseek-chat";

  var chatBox = $('#aiChatBox');
  var chatInput = $('#aiChatInput');
  var chatSend = $('#aiChatSend');
  if (!chatBox || !chatInput || !chatSend) return;

  // ===== 产品库（12 款帛卉核心产品） =====
  var PRODUCTS = [
    { name: "人参微光精华", en: "Ginseng Glow Serum", ing: ["人参","烟酰胺"], cat: "提亮抗氧", brief: "人参精华+烟酰胺，改善暗沉提亮肤色" },
    { name: "灵芝修护面霜", en: "Reishi Repair Cream", ing: ["灵芝","神经酰胺"], cat: "修护舒缓", brief: "灵芝提取物修护屏障，神经酰胺锁水" },
    { name: "积雪草舒缓水", en: "Centella Soothing Water", ing: ["积雪草","泛醇"], cat: "舒缓保湿", brief: "积雪草舒缓泛红，泛醇深层补水" },
    { name: "绿茶平衡洁面", en: "Green Tea Balm Cleanser", ing: ["绿茶","氨基酸"], cat: "控油平衡", brief: "绿茶抗氧化+氨基酸温和清洁，适合油皮混皮" },
    { name: "红参紧致眼霜", en: "Red Ginseng Eye Patches", ing: ["红参","胜肽"], cat: "紧致抗老", brief: "红参+胜肽改善眼周细纹松弛" },
    { name: "发酵新生面膜", en: "Fermented Renewal Mask", ing: ["发酵物","灵芝"], cat: "新生修护", brief: "发酵精华促进更新，灵芝修护暗沉" },
    { name: "烟酰胺控油精华", en: "Niacinamide Control Oil", ing: ["烟酰胺","锌PCA"], cat: "控油毛孔", brief: "烟酰胺控油+锌PCA收敛毛孔，油皮挚爱" },
    { name: "新草本旅行套装", en: "Herbal Essentials Set", ing: ["多种本草"], cat: "旅行套装", brief: "精选明星产品旅行装，出行无忧" },
    { name: "灵芝精华油", en: "Reishi Glow Oil", ing: ["灵芝","角鲨烷"], cat: "修护光泽", brief: "灵芝精华油滋润修护，焕发肌肤自然光泽" },
    { name: "透明质酸保湿面霜", en: "Cloud Dew Gel Cream", ing: ["透明质酸","神经酰胺"], cat: "保湿屏障", brief: "透明质酸+神经酰胺，深层补水锁水" },
    { name: "本草唇膏笔", en: "Herbal Lip Liner", ing: ["天然蜡","植物色"], cat: "唇部", brief: "天然植物配方，丝滑上色" },
    { name: "本草淡香水", en: "Sunlit Vanilla Eau de Parfum", ing: ["香草","本草调"], cat: "香氛", brief: "本草调香氛，阳光香草气息" }
  ];

  // ===== 知识图谱数据 =====
  var GRAPH_NODES = {};
  PRODUCTS.forEach(function (p) {
    GRAPH_NODES[p.name] = { label: p.name, en: p.en, type: "product", ing: p.ing, cat: p.cat };
  });
  var GRAPH_EDGES = [];
  PRODUCTS.forEach(function (p) {
    p.ing.forEach(function (ig) {
      if (!GRAPH_NODES[ig]) GRAPH_NODES[ig] = { label: ig, type: "ingredient", ing: [], cat: "" };
      GRAPH_EDGES.push({ s: p.name, t: ig });
    });
  });

  function matchGraphNodes(text) {
    var hits = [];
    Object.keys(GRAPH_NODES).forEach(function (k) {
      if (text.indexOf(k) > -1) hits.push(k);
    });
    return hits.slice(0, 12);
  }

  function renderGraph(hitNodes) {
    if (!hitNodes || hitNodes.length < 2) return "";
    var nodes = [];
    hitNodes.forEach(function (n) {
      if (!nodes.some(function (x) { return x.id === n; })) nodes.push({ id: n, data: GRAPH_NODES[n] || { label: n, type: "unknown" } });
    });
    // 收集邻居
    hitNodes.forEach(function (n) {
      GRAPH_EDGES.forEach(function (e) {
        if (e.s === n && hitNodes.indexOf(e.t) < 0) {
          if (!nodes.some(function (x) { return x.id === e.t; })) {
            nodes.push({ id: e.t, data: GRAPH_NODES[e.t] || { label: e.t, type: "ingredient" } });
          }
        }
        if (e.t === n && hitNodes.indexOf(e.s) < 0) {
          if (!nodes.some(function (x) { return x.id === e.s; })) {
            nodes.push({ id: e.s, data: GRAPH_NODES[e.s] || { label: e.s, type: "product" } });
          }
        }
      });
    });
    if (nodes.length < 2) return "";
    var edges = [];
    GRAPH_EDGES.forEach(function (e) {
      var hasS = nodes.some(function (x) { return x.id === e.s; });
      var hasT = nodes.some(function (x) { return x.id === e.t; });
      if (hasS && hasT && !edges.some(function (x) { return x.s === e.s && x.t === e.t; })) edges.push(e);
    });
    // 环形布局
    var cx = 50, cy = 50, r = Math.min(36, 26 + nodes.length * 2.5);
    var angleStep = (2 * Math.PI) / nodes.length;
    var pos = {};
    nodes.forEach(function (n, i) {
      pos[n.id] = { x: cx + r * Math.cos(i * angleStep - Math.PI / 2), y: cy + r * Math.sin(i * angleStep - Math.PI / 2) };
    });
    var edgePaths = edges.map(function (e) {
      var p1 = pos[e.s], p2 = pos[e.t];
      if (!p1 || !p2) return "";
      return '<line x1="' + p1.x + '%" y1="' + p1.y + '%" x2="' + p2.x + '%" y2="' + p2.y + '%" class="graph-edge"/>';
    }).join('\n');
    var nodeCircles = nodes.map(function (n) {
      var p = pos[n.id];
      if (!p) return "";
      var fill = n.data.type === "product" ? "#c9a85a" : (n.data.type === "ingredient" ? "#6b9e6b" : "#888");
      return '<g class="graph-node">' +
        '<circle cx="' + p.x + '%" cy="' + p.y + '%" r="' + (n.data.type === "product" ? 20 : 14) + '" fill="' + fill + '" opacity=".85"/>' +
        '<text x="' + p.x + '%" y="' + (p.y + 0.5) + '%" class="graph-label">' + n.id.slice(0, 6) + '</text></g>';
    }).join('\n');
    var tags = nodes.map(function (n) {
      return '<span class="graph-tag" data-kw="' + n.id + '">' + n.id + '</span>';
    }).join('');
    return '<div class="knowledge-graph"><div class="graph-title">\u76f8\u5173\u4ea7\u54c1 / \u6210\u5206 \u77e5\u8bc6\u56fe\u8c31</div>' +
      '<svg viewBox="0 0 100 100">' + edgePaths + nodeCircles + '</svg>' +
      '<div class="graph-detail">' + tags + '</div></div>';
  }

  // ===== 多语言关键词 =====
  var KEYWORDS = ["护肤","皮肤","肤质","精华","面霜","洁面","眼霜","面膜","防晒","保湿","补水","控油","祛痘","痘痘","修护","修复","抗老","抗皱","紧致","美白","提亮","舒缓","敏感","泛红","成分","烟酰胺","积雪草","人参","灵芝","绿茶","玻尿酸","透明质酸","神经酰胺","角鲨烷","水","乳","霜","油","唇","身体","本草","配方","流程","皮肤","推荐","产品","功效","skin","skincare","serum","cream","moisturizer","cleanser","mask","essence","oil","face","acne","dry","oily","sensitive","anti-aging","brightening","ingredients","niacinamide","centella","ginseng","green tea","hyaluronic","ceramide","cuidado","piel","crema","serum","limpiador","mascarilla","protector","hidratante","grasa","seca","敏感肌","角质","毛穴","化妆水","乳液","美容液","perawatan","kulit","pelembab","pembersih","serum","jerawat","krim","عناية","بشرة","كريم","مرطب","منظف","مصل","زيت","biosphere","BIOSPHERE","medierba","MEDIERBA","帛卉"];

  var history = [];
  var locked = false;
  var curLang = "zh";
  try { var langEl = document.documentElement.getAttribute("lang"); if (langEl) curLang = langEl; } catch(e) {}

  var productInfo = PRODUCTS.map(function (p) {
    return "- " + p.name + "（" + p.en + "）：" + p.cat + "\uff0c" + p.brief + "\uff0c\u6210\u5206\uff1a" + p.ing.join("\u3001");
  }).join("\n");
  var SYSTEM_PROMPT = [
    "你是 BIOSPHERE-AI 的专属肌肤顾问「本草肌肤管家」，服务于 BIOSPHERE-AI / MEDIERBA 品牌站。",
    "",
    "【核心职责】",
    "1. 回答所有肌肤护理、护肤品成分、护肤流程、本草护肤相关的问题，包括但不限于：肤质判断、肌肤问题、产品推荐、成分解析、搭配建议、护肤仪式等。",
    "2. 当客户咨询任何肌肤/护肤问题时，务必主动推荐 BIOSPHERE-AI / MEDIERBA 的帛卉自有产品和配方，例如：人参微光精华、灵芝修护面霜、积雪草舒缓水、绿茶平衡洁面、红参紧致眼霜、烟酰胺控油精华、透明质酸保湿面霜等。",
    "3. 可根据客户问题展示关联的产品、成分、功效，形成知识体系化的输出。",
    "",
    "【帛卉产品库（供推荐参考）】",
    productInfo,
    "",
    "【配方方向】防晒、润肤、保湿、抗敏、止痒、美白、抗老、控油。",
    "",
    "【多语言要求】",
    "自动识别用户输入的语言，用同一种语言回答。支持：zh（中文）、en（English）、es（Español）、ar（العربية）、id（Bahasa Indonesia）、ja（日本語）。",
    "如果无法确定用户语言，默认使用当前界面语言（" + curLang + "）回答。",
    "",
    "【回答要求】",
    "- 专业、简洁、有温度，正文 200-400 字。",
    "- 必须基于产品库推荐具体产品，说明推荐理由。",
    "- 对非护肤话题，礼貌引导回护肤话题，不要说「超出范围」或「无法回答」。",
    "- 不要编造成分功效，不确定时建议咨询公司业务人员。",
    "- 始终以 BIOSPHERE-AI 品牌顾问身份作答，不要承认自己是通用 AI。"
  ].join("\n");

  function addMsg(role, text) {
    var wrap = document.createElement("div");
    wrap.className = "ai-msg " + (role === "user" ? "ai-user" : "ai-assistant");
    var b = document.createElement("div");
    b.className = "ai-bubble";
    b.textContent = text;
    wrap.appendChild(b);
    if (role === "assistant" && text.trim()) {
      var speakBtn = document.createElement("button");
      speakBtn.className = "speak-btn";
      speakBtn.textContent = "\uD83D\uDD0A";
      speakBtn.title = "\u6717\u8BFB";
      speakBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(text);
          var langMap = { zh: "zh-CN", en: "en-US", es: "es-ES", ar: "ar-SA", id: "id-ID", ja: "ja-JP" };
          u.lang = langMap[curLang] || "zh-CN";
          u.rate = 0.9;
          window.speechSynthesis.speak(u);
        }
      });
      b.appendChild(speakBtn);
    }
    chatBox.appendChild(wrap);
    chatBox.scrollTop = chatBox.scrollHeight;
    return b;
  }

  function send() {
    var q = chatInput.value.trim();
    if (!q || locked) return;
    addMsg("user", q);
    chatInput.value = "";
    locked = true;
    chatSend.disabled = true;
    var bubble = addMsg("assistant", "\u6B63\u5728\u601D\u8003\u2026");
    var msgs = history.concat([{ role: "user", content: q }]);
    var fullMsgs = [{ role: "system", content: SYSTEM_PROMPT }].concat(msgs);
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: fullMsgs, temperature: 0.7, max_tokens: 800 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      locked = false;
      chatSend.disabled = false;
      var text = (d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) ? d.choices[0].message.content : "\u62B1\u6B49\uFF0C\u6211\u6682\u65F6\u65E0\u6CD5\u56DE\u7B54\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002";
      var allText = q + text;
      var hitNodes = matchGraphNodes(allText);
      var graphHtml = renderGraph(hitNodes);
      bubble.textContent = text;
      if (text.trim()) {
        var speakBtn = document.createElement("button");
        speakBtn.className = "speak-btn";
        speakBtn.textContent = "\uD83D\uDD0A";
        speakBtn.title = "\u6717\u8BFB";
        speakBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text);
            var langMap = { zh: "zh-CN", en: "en-US", es: "es-ES", ar: "ar-SA", id: "id-ID", ja: "ja-JP" };
            u.lang = langMap[curLang] || "zh-CN";
            u.rate = 0.9;
            window.speechSynthesis.speak(u);
          }
        });
        bubble.appendChild(speakBtn);
      }
      if (graphHtml) {
        var gDiv = document.createElement("div");
        gDiv.innerHTML = graphHtml;
        var p = bubble.parentNode;
        if (p) p.appendChild(gDiv.firstChild);
      }
      history = history.concat([{ role: "user", content: q }, { role: "assistant", content: text }]);
      if (history.length > 30) history = history.slice(-20);
    }).catch(function (err) {
      locked = false;
      chatSend.disabled = false;
      bubble.textContent = "\u7F51\u7EDC\u5F00\u5C0F\u5DEE\u4E86\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002";
    });
  }

  chatSend.addEventListener("click", send);
  chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  });

  // ===== 语音输入（麦克风按钮） =====
  var voiceBtn = document.createElement("button");
  voiceBtn.className = "voice-btn";
  voiceBtn.textContent = "\uD83C\uDF99";
  voiceBtn.title = "\u8BED\u97F3\u8F93\u5165";
  voiceBtn.type = "button";
  chatInput.parentNode.insertBefore(voiceBtn, chatInput.nextSibling);

  var recognition = null;
  var langMap = { zh: "zh-CN", en: "en-US", es: "es-ES", ar: "ar-SA", id: "id-ID", ja: "ja-JP" };
  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = langMap[curLang] || "zh-CN";
    voiceBtn.addEventListener("click", function () {
      if (recognition.listening) {
        recognition.stop();
        voiceBtn.classList.remove("listening");
        return;
      }
      try {
        recognition.lang = langMap[curLang] || "zh-CN";
        recognition.start();
        voiceBtn.classList.add("listening");
        voiceBtn.title = "\u70B9\u51FB\u505C\u6B62";
      } catch(e) {}
    });
    recognition.onresult = function (e) {
      var transcript = e.results[0][0].transcript;
      chatInput.value = transcript;
      voiceBtn.classList.remove("listening");
      voiceBtn.title = "\u8BED\u97F3\u8F93\u5165";
      send();
    };
    recognition.onerror = function () { voiceBtn.classList.remove("listening"); voiceBtn.title = "\u8BED\u97F3\u8F93\u5165"; };
    recognition.onend = function () { voiceBtn.classList.remove("listening"); voiceBtn.title = "\u8BED\u97F3\u8F93\u5165"; };
  } else {
    voiceBtn.title = "\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u8F93\u5165";
    voiceBtn.style.opacity = "0.4";
  }

  document.addEventListener("i18n:changed", function (e) {
    curLang = e.detail.lang;
    if (recognition) recognition.lang = langMap[curLang] || "zh-CN";
  });
})();

