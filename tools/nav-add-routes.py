#!/usr/bin/env python3
"""把三个「代码路由」挂进导航:行业资讯、海外爆款调研、各国备案索引。

由来:
  · 创始人 2026-09-10 04:1x:「新闻版块加 1 个各大海外电商平台爆款调研」——
    /trends/ 建好了 351 条,但**站上没有任何一个链接指向它**,等于没交付。
  · /compliance/(六国备案索引,34 条官方链接)同样是孤儿页。
  · /news/ 本身 in_nav=0,资讯整块在菜单里看不见。

**为什么往 pages 表插行:**
导航树来自 D1 的 pages 表,而这三页是 .astro 代码路由,不是 CMS 页。
站上已有先例 —— /inci/ 就是代码路由 + 一条 pages 记录(id 153),
Astro 的路由优先级保证 `[lang]/inci/index.astro` 先于 `[...path]` 命中,
pages 那行只负责让它出现在菜单里。照抄这个做法即可,不需要改渲染。

用法:
    python tools/nav-add-routes.py            体检
    python tools/nav-add-routes.py --apply    写库
"""
import argparse
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = "biosphere-ai"

# slug -> (父页 slug, 排序, {lang: 菜单名})
NEW = {
    "trends": ("news", 2, {
        "zh-cn": "海外爆款调研", "zh-tw": "海外爆款調研", "en": "Bestseller Research",
        "jp": "海外ヒット商品調査", "kr": "해외 베스트셀러 조사", "fr": "Études des best-sellers",
        "de": "Bestseller-Recherche", "ru": "Исследование бестселлеров", "id": "Riset Produk Terlaris",
        "my": "Kajian Produk Terlaris", "th": "วิจัยสินค้าขายดี", "vn": "Nghiên cứu sản phẩm bán chạy",
        "ph": "Pananaliksik sa Bestseller", "es": "Estudio de más vendidos",
        "pt": "Pesquisa de mais vendidos", "ar": "أبحاث الأكثر مبيعًا",
        "tr": "Çok Satan Araştırması", "in": "बेस्टसेलर शोध",
    }),
    "compliance": ("guides", 6, {
        "zh-cn": "各国备案索引", "zh-tw": "各國備案索引", "en": "Notification Index",
        "jp": "各国届出インデックス", "kr": "국가별 신고 인덱스", "fr": "Index des notifications",
        "de": "Notifizierungs-Index", "ru": "Указатель уведомлений", "id": "Indeks Notifikasi",
        "my": "Indeks Notifikasi", "th": "ดัชนีการจดแจ้ง", "vn": "Chỉ mục công bố",
        "ph": "Index ng Notification", "es": "Índice de notificaciones",
        "pt": "Índice de notificações", "ar": "دليل الإخطار",
        "tr": "Bildirim Dizini", "in": "अधिसूचना सूचकांक",
    }),
}

# /news/ 自己也要露出来 —— 它现在 in_nav=0
NEWS_LABEL = {
    "zh-cn": "行业资讯", "zh-tw": "行業資訊", "en": "Industry News", "jp": "業界ニュース",
    "kr": "업계 뉴스", "fr": "Actualités du secteur", "de": "Branchennews",
    "ru": "Новости отрасли", "id": "Berita Industri", "my": "Berita Industri",
    "th": "ข่าวอุตสาหกรรม", "vn": "Tin ngành", "ph": "Balita sa Industriya",
    "es": "Noticias del sector", "pt": "Notícias do setor", "ar": "أخبار الصناعة",
    "tr": "Sektör Haberleri", "in": "उद्योग समाचार",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    have = {r["slug"]: r for r in d1(
        f"SELECT id, slug, parent_id, in_nav, status FROM pages WHERE site_id='{SITE}' "
        f"AND slug IN ('news','trends','compliance','guides')")}
    print("库内:", {k: (v["id"], v["in_nav"], v["status"]) for k, v in have.items()})
    todo = [s for s in NEW if s not in have]
    print(f"要新建的页: {todo or '无'} · news 需要露出: {have.get('news', {}).get('in_nav') == 0}")
    if not a.apply:
        print("\n加 --apply 才写库")
        return

    q = lambda v: "'" + str(v).replace("'", "''") + "'"  # noqa: E731
    lines = []
    # news 露出来
    if have.get("news"):
        lines.append(f"UPDATE pages SET in_nav=1 WHERE id={have['news']['id']};")
        for lang, lab in NEWS_LABEL.items():
            lines.append(f"UPDATE page_i18n SET nav_label={q(lab)} "
                         f"WHERE page_id={have['news']['id']} AND lang={q(lang)};")
    # 新页
    for slug, (parent, order, labels) in NEW.items():
        if slug in have:
            continue
        pid = have.get(parent, {}).get("id")
        if not pid:
            print(f"  ! 找不到父页 {parent},{slug} 跳过")
            continue
        lines.append(
            f"INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status, updated_at) "
            f"VALUES ({q(SITE)}, {q(slug)}, {pid}, 'standard', 1, {order}, 'published', datetime('now'));")
        for lang, lab in labels.items():
            lines.append(
                f"INSERT INTO page_i18n (page_id, lang, nav_label, title) "
                f"SELECT id, {q(lang)}, {q(lab)}, {q(lab)} FROM pages "
                f"WHERE site_id={q(SITE)} AND slug={q(slug)};")

    sql = os.path.join(HERE, "_nav-add-routes.sql")
    # 一条语句一行:wrangler 的 --file 按换行切语句
    io.open(sql, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print(f"  {len(lines)} 条语句 · SQL {os.path.getsize(sql):,} 字节 · 写入 {d1_exec(sql):,} 行")


if __name__ == "__main__":
    main()
