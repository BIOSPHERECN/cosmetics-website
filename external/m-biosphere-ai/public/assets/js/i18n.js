/* BIOSPHERE-AI 多语种 i18n 引擎 */
(function () {
  "use strict";
  var SUPPORTED = ["en", "es", "ar", "id", "ja", "zh"];
  var NAMES = { en: "English", es: "Español", ar: "العربية", id: "Indonesia", ja: "日本語", zh: "中文" };
  var dict = {};
  var current = "en";

  // 国家(CF-IPCountry) → 站点语言 映射
  var IP_LANG_MAP = {
    CN: "zh", TW: "zh", HK: "zh", MO: "zh", SG: "zh",
    ID: "id", MY: "id",
    JP: "ja",
    SA: "ar", AE: "ar", EG: "ar", QA: "ar", KW: "ar", BH: "ar", OM: "ar",
    JO: "ar", LB: "ar", IQ: "ar", YE: "ar", SY: "ar", MA: "ar", DZ: "ar",
    TN: "ar", LY: "ar", PS: "ar", MR: "ar",
    ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
    EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es",
    SV: "es", NI: "es", CR: "es", PA: "es", UY: "es", PR: "es"
  };

  function langFromCountry(code) {
    return IP_LANG_MAP[code] || "en";
  }

  function langFromNavigator() {
    try {
      var nl = (navigator.language || navigator.userLanguage || "en").toLowerCase();
      if (nl.indexOf("zh") === 0) return "zh";
      if (nl.indexOf("id") === 0) return "id";
      if (nl.indexOf("ja") === 0) return "ja";
      if (nl.indexOf("ar") === 0) return "ar";
      if (nl.indexOf("es") === 0) return "es";
      if (nl.indexOf("en") === 0) return "en";
    } catch (e) {}
    return "";
  }

  function getInitLang() {
    // 1) URL lang 参数（最高优先级，可共享链接）
    var m = location.search.match(/[?&]lang=([a-z]{2})/i);
    if (m && SUPPORTED.indexOf(m[1].toLowerCase()) >= 0) return m[1].toLowerCase();
    // 2) 用户手动选择记录（localStorage）
    try {
      var saved = localStorage.getItem("biosphere_lang");
      if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    // 3) Worker 注入的国家（CF-IPCountry 请求头）
    try {
      var ipc = window.__CF_IPCOUNTRY__;
      if (ipc && typeof ipc === "string" && ipc.length === 2) {
        var ipLang = langFromCountry(ipc.toUpperCase());
        if (SUPPORTED.indexOf(ipLang) >= 0) return ipLang;
      }
    } catch (e) {}
    // 4) 浏览器语言兜底
    var nlLang = langFromNavigator();
    if (SUPPORTED.indexOf(nlLang) >= 0) return nlLang;
    return "en";
  }

  function t(key) {
    if (dict[key]) return dict[key];
    if (window.__ZH_DICT && window.__ZH_DICT[key]) return window.__ZH_DICT[key];
    return key;
  }

  function apply() {
    document.documentElement.setAttribute("lang", current);
    document.documentElement.setAttribute("dir", current === "ar" ? "rtl" : "ltr");
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n");
      var v = t(k);
      if (v && v !== k) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-placeholder");
      var v = t(k);
      if (v && v !== k) el.setAttribute("placeholder", v);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-aria");
      var v = t(k);
      if (v && v !== k) el.setAttribute("aria-label", v);
    });
    var sel = document.getElementById("langSwitch");
    if (sel) sel.value = current;
    document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang: current } }));
  }

  function switchLang(lang) {
    if (SUPPORTED.indexOf(lang) < 0) lang = "en";
    current = lang;
    try { localStorage.setItem("biosphere_lang", lang); } catch (e) {}
    var url = new URL(location.href);
    if (lang === "en") url.searchParams.delete("lang");
    else url.searchParams.set("lang", lang);
    history.replaceState(null, "", url.toString());
    if (lang === "zh") {
      dict = {};
      apply();
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "assets/i18n/" + lang + ".json", true);
      xhr.onload = function () {
        try { dict = JSON.parse(xhr.responseText); } catch (e) { dict = {}; }
        apply();
      };
      xhr.onerror = function () { dict = {}; apply(); };
      xhr.send();
    }
  }

  /* 语言切换器注入 */
  function injectSwitcher() {
    var host = document.getElementById("langSwitchHost");
    if (!host || document.getElementById("langSwitch")) return;
    var label = document.createElement("span");
    label.className = "lang-label";
    label.textContent = "🌐";
    var sel = document.createElement("select");
    sel.id = "langSwitch";
    sel.className = "lang-select";
    SUPPORTED.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c;
      o.textContent = NAMES[c];
      sel.appendChild(o);
    });
    sel.value = current;
    sel.addEventListener("change", function () { switchLang(sel.value); });
    host.appendChild(label);
    host.appendChild(sel);
  }

  /* 导出 */
  window.I18N = { t: t, switchLang: switchLang, current: function () { return current; }, SUPPORTED: SUPPORTED, NAMES: NAMES };

  function boot() {
    // 同步注入 zh 基准字典（避免 flash）
    if (window.__ZH_DICT) {
      current = getInitLang();
      if (current === "zh") {
        dict = {};
      }
    }
    current = getInitLang();
    injectSwitcher();
    if (current === "zh") {
      apply();
    } else {
      switchLang(current);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
