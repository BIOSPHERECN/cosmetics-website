/* ============================================================
   heritage.js — 古方化妆品溯源版块
   纯静态数据加载（fetch ./data/heritage_recipes.json）+ 渲染 + 交互
   功能：分类筛选 / 关键词搜索 / 分页（每页 20 条）/ 详情弹窗
   ------------------------------------------------------------
   i18n-ext（六语扩展预留）：
   1. 以下 HERITAGE_I18N 为版块全部界面文案常量，六语化时按
      lang 从 assets/i18n/{lang}.json 注入后整体替换即可。
   2. 分类名建议在数据侧增加 category_i18n 映射表（zh/en/id/ar/ja/es）。
   3. 本文件不含任何硬编码业务文案之外的散落文本。
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  var DATA_URL = './data/heritage_recipes.json';
  var PAGE_SIZE = 20;

  /* 界面文案（i18n-ext: 迁移入口） */
  var HERITAGE_I18N = {
    all: '全部',
    loading: '数据加载中…',
    loadError: '数据加载失败，请确认 heritage_recipes.json 是否已部署。',
    empty: '没有符合条件的配方，换个关键词试试。',
    resultMeta: '共 {total} 条 · 当前显示 {start}-{end}',
    heroStats: '已收录 {total} 条古方 · {categories} 个品类',
    detailSections: {
      ingredients: '组成',
      effect: '功效',
      prep: '制法',
      usage: '用法',
      raw: '原文',
      source: '来源'
    },
    noData: '原文未明示',
    openSource: '查看古籍原文'
  };

  /* ---------- 状态 ---------- */
  var allRecipes = [];
  var categories = [];
  var state = { category: HERITAGE_I18N.all, keyword: '', page: 1 };

  /* ---------- DOM ---------- */
  var els = {
    categoryNav: document.getElementById('categoryNav'),
    searchInput: document.getElementById('searchInput'),
    heroStats: document.getElementById('heroStats'),
    resultMeta: document.getElementById('resultMeta'),
    recipeGrid: document.getElementById('recipeGrid'),
    pagination: document.getElementById('pagination'),
    modal: document.getElementById('detailModal'),
    detailContent: document.getElementById('detailContent')
  };

  /* ---------- 工具 ---------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(str, len) {
    var s = String(str || '').trim();
    return s.length > len ? s.slice(0, len) + '…' : s;
  }

  /* ---------- 数据加载 ---------- */
  function load() {
    fetch(DATA_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error('数据格式错误');
        allRecipes = data;
        buildCategories();
        renderAll();
      })
      .catch(function (err) {
        els.heroStats.textContent = HERITAGE_I18N.loadError;
        els.resultMeta.textContent = HERITAGE_I18N.loadError + ' (' + err.message + ')';
      });
  }

  function buildCategories() {
    /* 固定展示顺序（与数据中 13 个品类对齐，缺失不影响） */
    var order = [
      '面方/护肤', '面脂', '洗面', '澡豆', '手膏',
      '口脂', '口脂/香品', '胭脂', '香粉', '香品',
      '生发', '沐发', '乌发染发', '生眉'
    ];
    var present = {};
    allRecipes.forEach(function (r) {
      if (r.category) present[r.category] = true;
    });
    categories = order.filter(function (c) { return present[c]; });
    renderCategoryNav();
  }

  /* ---------- 渲染：分类导航 ---------- */
  function renderCategoryNav() {
    var html = '<button class="chip' + (state.category === HERITAGE_I18N.all ? ' active' : '') +
      '" data-category="' + HERITAGE_I18N.all + '">' + HERITAGE_I18N.all + '</button>';
    categories.forEach(function (c) {
      var count = allRecipes.filter(function (r) { return r.category === c; }).length;
      html += '<button class="chip' + (state.category === c ? ' active' : '') +
        '" data-category="' + escapeHtml(c) + '">' + escapeHtml(c) + ' (' + count + ')</button>';
    });
    els.categoryNav.innerHTML = html;
    els.categoryNav.querySelectorAll('.chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.category = btn.getAttribute('data-category');
        state.page = 1;
        renderCategoryNav(); /* 刷新分类导航 active 高亮（state.category 已更新） */
        renderAll();
      });
    });
  }

  /* ---------- 过滤 + 分页 ---------- */
  function getFiltered() {
    var keyword = state.keyword.trim().toLowerCase();
    return allRecipes.filter(function (r) {
      var okCat = state.category === HERITAGE_I18N.all || r.category === state.category;
      if (!okCat) return false;
      if (!keyword) return true;
      var haystack = [r.name, r.ingredients, r.effect, r.prep, r.usage, r.raw]
        .join(' ').toLowerCase();
      return haystack.indexOf(keyword) !== -1;
    });
  }

  function renderAll() {
    var filtered = getFiltered();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    /* 统计信息 */
    if (allRecipes.length > 0) {
      els.heroStats.textContent = HERITAGE_I18N.heroStats
        .replace('{total}', allRecipes.length)
        .replace('{categories}', categories.length);
    }
    els.resultMeta.textContent = HERITAGE_I18N.resultMeta
      .replace('{total}', filtered.length)
      .replace('{start}', filtered.length ? start + 1 : 0)
      .replace('{end}', start + pageItems.length);

    renderGrid(pageItems, filtered.length);
    renderPagination(totalPages, filtered.length);
  }

  /* ---------- 渲染：卡片列表 ---------- */
  function renderGrid(items, total) {
    if (total === 0) {
      els.recipeGrid.innerHTML =
        '<div class="empty-state"><p>' + HERITAGE_I18N.empty + '</p></div>';
      return;
    }
    els.recipeGrid.innerHTML = items.map(function (r) {
      return (
        '<article class="recipe-card" data-id="' + escapeHtml(r.id) + '">' +
          '<h3 class="recipe-card__name">' + escapeHtml(r.name) + '</h3>' +
          '<div class="recipe-card__meta">' +
            '<span class="recipe-card__tag">' + escapeHtml(r.category) + '</span>' +
            '<span>' + escapeHtml(r.origin || '') +
              (r.section ? ' · ' + escapeHtml(truncate(r.section, 22)) : '') + '</span>' +
          '</div>' +
          '<p class="recipe-card__ingredients">' +
            (r.ingredients ? escapeHtml(truncate(r.ingredients, 90)) : HERITAGE_I18N.noData) +
          '</p>' +
        '</article>'
      );
    }).join('');
    els.recipeGrid.querySelectorAll('.recipe-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var rec = allRecipes.find(function (r) { return r.id === card.getAttribute('data-id'); });
        if (rec) openDetail(rec);
      });
    });
  }

  /* ---------- 渲染：分页 ---------- */
  function renderPagination(totalPages, total) {
    if (total === 0) { els.pagination.innerHTML = ''; return; }
    var html = '';
    html += '<button data-page="' + (state.page - 1) + '"' + (state.page === 1 ? ' disabled' : '') + '>‹</button>';
    var startPage = Math.max(1, state.page - 2);
    var endPage = Math.min(totalPages, state.page + 2);
    for (var p = startPage; p <= endPage; p++) {
      html += '<button data-page="' + p + '"' + (p === state.page ? ' class="active"' : '') + '>' + p + '</button>';
    }
    html += '<button data-page="' + (state.page + 1) + '"' + (state.page === totalPages ? ' disabled' : '') + '>›</button>';
    els.pagination.innerHTML = html;
    els.pagination.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        state.page = parseInt(btn.getAttribute('data-page'), 10) || 1;
        renderAll();
        window.scrollTo({ top: document.querySelector('.browse').offsetTop - 70, behavior: 'smooth' });
      });
    });
  }

  /* ---------- 详情弹窗 ---------- */
  function openDetail(r) {
    function section(title, content) {
      return '<div class="detail__section"><h4>' + title + '</h4>' +
        (content ? '<p>' + content + '</p>' : '<p class="detail__empty">' + HERITAGE_I18N.noData + '</p>') +
        '</div>';
    }
    var html = '';
    html += '<div class="detail__header">' +
      '<h3 class="detail__title">' + escapeHtml(r.name) + '</h3>' +
      '<div class="recipe-card__meta">' +
        '<span class="recipe-card__tag">' + escapeHtml(r.category) + '</span>' +
        '<span>' + escapeHtml(r.origin || '') + (r.section ? ' · ' + escapeHtml(r.section) : '') + '</span>' +
      '</div></div>';
    html += section(HERITAGE_I18N.detailSections.ingredients, escapeHtml(r.ingredients));
    html += section(HERITAGE_I18N.detailSections.effect, escapeHtml(r.effect));
    html += section(HERITAGE_I18N.detailSections.prep, escapeHtml(r.prep));
    html += section(HERITAGE_I18N.detailSections.usage, escapeHtml(r.usage));
    html += '<div class="detail__section"><h4>' + HERITAGE_I18N.detailSections.raw + '</h4>' +
      '<div class="detail__raw">' + escapeHtml(r.raw) + '</div></div>';
    html += '<div class="detail__section"><h4>' + HERITAGE_I18N.detailSections.source + '</h4>' +
      (r.source_url
        ? '<a class="detail__link" href="' + escapeHtml(r.source_url) + '" target="_blank" rel="noopener noreferrer">' +
          HERITAGE_I18N.openSource + ' · ' + escapeHtml(r.source_url) + '</a>'
        : '<p class="detail__empty">' + HERITAGE_I18N.noData + '</p>') +
      '</div>';
    els.detailContent.innerHTML = html;
    els.modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    els.modal.hidden = true;
    document.body.style.overflow = '';
  }

  els.modal.querySelectorAll('[data-close]').forEach(function (el) {
    el.addEventListener('click', closeDetail);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !els.modal.hidden) closeDetail();
  });

  /* ---------- 搜索（防抖） ---------- */
  var searchTimer = null;
  els.searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.keyword = els.searchInput.value;
      state.page = 1;
      renderAll();
    }, 250);
  });

  /* ---------- 启动 ---------- */
  load();
})();
