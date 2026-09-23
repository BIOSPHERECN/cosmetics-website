#!/usr/bin/env python3
"""导航按产线链路重排 —— 「各种类…摆放成一条链路」(创始人 2026-09-11 00:3x)。

以前的顶级导航按**类型**分组:产品库 / AI 工作台 / 服务 / 选型指南 / 工厂实力 / 原料溯源 / 关于。
采购点开任何一组都看不出它在整条产线的哪一段。现在顶级项 = 产线上的七站,按工序先后编号,
每站的下拉里放这一站用得到的库、工具与说明页。序号是真信息(工序确有先后),不是装饰。

    选品链路(工作台,不编号)
    ① 源头·原料   原料溯源(父页)· 草本原料库 · 各国原料目录 · 知识图谱 · AI 搜索
    ② 包材        包材库(父页)· 包材方案 · AI 包装设计
    ③ 配方        配方库(父页)· 技术与配方 · 实验室与检测 · AI 共创 · AI 工作台
    ④ 包装盒      外盒/礼盒(父页,包材库按类型筛)· 彩盒·说明书·烟包膜
    ⑤ 成品        产品品类(父页)· 生产制造 · 工厂与产能 · OEM/ODM 服务 · 品牌孵化 · 工厂实力
    ⑥ 质检·合规   质量与合规(父页)· 质检体系 · 各国法规(草稿,页面上线时发布)· 东南亚通报账号
    ⑦ 市场·获客   选型指南(父页)· 海外爆款调研 · 买手问答 · 选型对比 · 客户场景 · 常见问题 · 行业资讯 · AI 肌肤检测
    联系询盘      关于帛卉 · 创始人 · 发展历程

②③④⑤ 的顺序沿用创始人 09-07 定的「先包材,再配方,再包装盒,才有产品」,前面加①源头、后面加⑥⑦,
货架页顶上那条四段链(packages/core/src/content/chain.ts)不动。

URL 一个不改(改了等于把已收录的页全部作废),变的只是 pages.parent_id / sort_order / in_nav 与 18 个语种的 nav_label。
产品库 hub(/libraries)退出导航但页面保留;原料溯源下 13 味草本退出导航(页面里本来就有 91 张产区卡)。
「④ 包装盒」这一站没有独立页面,slug 直接是包材库的筛选地址(带 ?),页头/页脚拼链接时遇到 ? 不再补斜杠,
sitemap 跳过带 ? 的 slug。

用法:
    python tools/nav-chain.py            体检(打印将要改的树)
    python tools/nav-chain.py --apply    写库(幂等,可重复跑)
写完要 bump middleware.ts 的 CACHE_V 再部署 —— 导航在每一页上,边缘缓存不 bust 看不到。
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1  # noqa: E402

SITE = "biosphere-ai"
LANGS = ["zh-cn", "zh-tw", "en", "jp", "kr", "de", "fr", "es", "pt", "ru", "ar", "tr", "th", "vn", "id", "my", "ph", "in"]
CARTONS = "packaging/?t=use-gift,outer-carton"
PAPER = "packaging/?t=rigid-box,leaflet,overwrap-film,shrink-sleeve,seal-sticker"

# 18 语种标签,顺序同 LANGS。只给「站名」与新入口写;其余页沿用原有标签。
LABELS = {
    "origin": ["① 源头·原料", "① 源頭·原料", "1 · Source & botanicals", "① 原料の源流", "① 원료·산지", "1 · Herkunft & Rohstoffe",
               "1 · Origine & matières", "1 · Origen y materias primas", "1 · Origem e matérias-primas", "1 · Сырьё и происхождение",
               "1 · المصدر والمواد الخام", "1 · Kaynak ve hammadde", "1 · แหล่งที่มาและวัตถุดิบ", "1 · Nguồn gốc & nguyên liệu",
               "1 · Sumber & bahan baku", "1 · Sumber & bahan mentah", "1 · Pinagmulan at sangkap", "1 · स्रोत और कच्चा माल"],
    "packaging": ["② 包材", "② 包材", "2 · Containers", "② 容器・包材", "② 용기·포장재", "2 · Behälter", "2 · Contenants", "2 · Envases",
                  "2 · Embalagens", "2 · Тара и упаковка", "2 · العبوات", "2 · Ambalaj", "2 · บรรจุภัณฑ์", "2 · Bao bì", "2 · Kemasan",
                  "2 · Bekas & pembungkusan", "2 · Lalagyan", "2 · कंटेनर"],
    "formulas": ["③ 配方", "③ 配方", "3 · Formulas", "③ 処方", "③ 처방", "3 · Rezepturen", "3 · Formules", "3 · Fórmulas", "3 · Fórmulas",
                 "3 · Рецептуры", "3 · التركيبات", "3 · Formüller", "3 · สูตร", "3 · Công thức", "3 · Formula", "3 · Formula", "3 · Pormula",
                 "3 · फ़ॉर्मूला"],
    CARTONS: ["④ 包装盒", "④ 包裝盒", "4 · Cartons", "④ 化粧箱", "④ 포장 상자", "4 · Faltschachteln", "4 · Étuis", "4 · Estuches", "4 · Caixas",
              "4 · Коробки", "4 · العلب الكرتونية", "4 · Kutular", "4 · กล่องบรรจุ", "4 · Hộp giấy", "4 · Kotak kemasan", "4 · Kotak",
              "4 · Kahon", "4 · डिब्बे"],
    "products": ["⑤ 成品", "⑤ 成品", "5 · Finished products", "⑤ 製品", "⑤ 완제품", "5 · Fertigprodukte", "5 · Produits finis",
                 "5 · Producto terminado", "5 · Produto acabado", "5 · Готовая продукция", "5 · المنتجات النهائية", "5 · Bitmiş ürün",
                 "5 · สินค้าสำเร็จรูป", "5 · Thành phẩm", "5 · Produk jadi", "5 · Produk siap", "5 · Tapos na produkto", "5 · तैयार उत्पाद"],
    "quality": ["⑥ 质检·合规", "⑥ 質檢·合規", "6 · QC & compliance", "⑥ 品質・法規", "⑥ 품질·규제", "6 · Qualität & Compliance",
                "6 · Qualité & conformité", "6 · Calidad y cumplimiento", "6 · Qualidade e conformidade", "6 · Качество и соответствие",
                "6 · الجودة والامتثال", "6 · Kalite ve uyum", "6 · คุณภาพและกฎระเบียบ", "6 · Chất lượng & tuân thủ", "6 · Mutu & kepatuhan",
                "6 · Kualiti & pematuhan", "6 · Kalidad at pagsunod", "6 · गुणवत्ता और अनुपालन"],
    "guides": ["⑦ 市场·获客", "⑦ 市場·獲客", "7 · Market & buyers", "⑦ 市場・販路", "⑦ 시장·영업", "7 · Markt & Vertrieb", "7 · Marché & acheteurs",
               "7 · Mercado y compradores", "7 · Mercado e compradores", "7 · Рынок и клиенты", "7 · السوق والعملاء", "7 · Pazar ve alıcılar",
               "7 · ตลาดและลูกค้า", "7 · Thị trường & khách hàng", "7 · Pasar & pembeli", "7 · Pasaran & pembeli", "7 · Merkado at mamimili",
               "7 · बाज़ार और ख़रीदार"],
    PAPER: ["彩盒·说明书·烟包膜", "彩盒·說明書·菸包膜", "Folding boxes, leaflets & films", "化粧箱・添付文書・フィルム", "컬러박스·설명서·필름",
            "Faltschachteln, Beipackzettel & Folien", "Étuis, notices & films", "Estuches, prospectos y films", "Cartuchos, folhetos e filmes",
            "Коробки, вкладыши и плёнка", "علب ونشرات وأغلفة", "Kutu, prospektüs ve film", "กล่อง ใบแทรก ฟิล์ม", "Hộp, tờ hướng dẫn & màng",
            "Kotak, leaflet & film", "Kotak, risalah & filem", "Kahon, leaflet at film", "डिब्बे, पर्चे और फ़िल्म"],
    "inci": ["各国原料目录", "各國原料目錄", "Ingredient inventories by market", "各国の原料リスト", "국가별 원료 목록", "Inhaltsstoff-Verzeichnisse",
             "Inventaires d'ingrédients", "Inventarios de ingredientes", "Inventários de ingredientes", "Реестры ингредиентов", "قوائم المكونات",
             "İçerik envanterleri", "บัญชีรายชื่อส่วนผสม", "Danh mục nguyên liệu", "Daftar bahan", "Inventori bahan", "Listahan ng sangkap",
             "सामग्री सूचियाँ"],
    "regulations": ["各国法规", "各國法規", "Regulations by market", "各国の規制", "국가별 규제", "Vorschriften nach Markt", "Réglementations par marché",
                    "Normativa por mercado", "Regulamentação por mercado", "Регулирование по рынкам", "اللوائح حسب السوق", "Pazarlara göre mevzuat",
                    "กฎระเบียบรายประเทศ", "Quy định theo thị trường", "Regulasi per pasar", "Peraturan mengikut pasaran", "Regulasyon bawat merkado",
                    "बाज़ार-वार नियम"],
    "compliance": ["东南亚通报账号", "東南亞通報帳號", "ASEAN notification accounts", "ASEAN 届出アカウント", "아세안 신고 계정", "ASEAN-Notifizierung",
                   "Notification ASEAN", "Notificación ASEAN", "Notificação ASEAN", "Нотификация в АСЕАН", "إخطار آسيان", "ASEAN bildirimi",
                   "บัญชีแจ้งอาเซียน", "Thông báo ASEAN", "Notifikasi ASEAN", "Notifikasi ASEAN", "Notipikasyon ng ASEAN", "आसियान अधिसूचना"],
}
for k, v in LABELS.items():
    assert len(v) == len(LANGS), (k, len(v))

# (slug, parent_slug, sort, in_nav, template-if-new, status-if-new)
TREE = [
    ("chain", None, 1, 1, None, None),
    ("origin", None, 10, 1, None, None),
    ("ingredients", "origin", 11, 1, None, None),
    ("inci", "origin", 12, 1, None, None),
    ("graph", "origin", 13, 1, None, None),
    ("search", "origin", 14, 1, None, None),
    ("packaging", None, 20, 1, None, None),
    ("capabilities/packaging", "packaging", 21, 1, None, None),
    ("pack", "packaging", 22, 1, None, None),
    ("formulas", None, 30, 1, None, None),
    ("rnd/formulation", "formulas", 31, 1, None, None),
    ("rnd/lab", "formulas", 32, 1, None, None),
    ("studio", "formulas", 33, 1, None, None),
    ("ai", "formulas", 34, 1, None, None),
    (CARTONS, None, 40, 1, "external", "published"),
    (PAPER, CARTONS, 41, 1, "external", "published"),
    ("products", None, 50, 1, None, None),
    ("capabilities/manufacturing", "products", 51, 1, None, None),
    ("about/plants", "products", 52, 1, None, None),
    ("services", "products", 53, 1, None, None),
    ("capabilities/incubation", "products", 54, 1, None, None),
    ("capabilities", "products", 55, 1, None, None),
    ("quality", None, 60, 1, None, None),
    ("qc", "quality", 61, 1, None, None),
    ("regulations", "quality", 62, 1, "external", "draft"),
    ("compliance", "quality", 63, 1, None, None),
    ("guides", None, 70, 1, None, None),
    ("trends", "guides", 71, 1, None, None),
    ("answers", "guides", 72, 1, None, None),
    ("compare", "guides", 73, 1, None, None),
    ("cases", "guides", 74, 1, None, None),
    ("faq", "guides", 75, 1, None, None),
    ("news", "guides", 76, 1, None, None),
    ("skin", "guides", 77, 1, None, None),
    ("contact", None, 80, 1, None, None),
    ("about", "contact", 81, 1, None, None),
    ("about/founder", "contact", 82, 1, None, None),
    ("about/history", "contact", 83, 1, None, None),
    ("libraries", None, 3, 0, None, None),
]

q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"  # noqa: E731


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    rows = d1(f"SELECT id, slug, parent_id, sort_order, in_nav, template, status FROM pages WHERE site_id = '{SITE}'")
    by = {r["slug"]: r for r in rows}
    missing = [s for s, _, _, _, tpl, _ in TREE if s not in by and not tpl]
    if missing:
        print("库里没有这些页,先建:", missing); return
    plan = []
    for slug, parent, sort, in_nav, tpl, status in TREE:
        if slug not in by:
            plan.append(("new", slug, parent, sort, in_nav, tpl, status))
        else:
            r = by[slug]
            pid = by[parent]["id"] if parent and parent in by else None
            if parent and parent not in by:
                plan.append(("upd-later", slug, parent, sort, in_nav, None, None))
            elif (r["parent_id"], r["sort_order"], r["in_nav"]) != (pid, sort, in_nav):
                plan.append(("upd", slug, parent, sort, in_nav, None, None))
    herbs = [r for r in rows if r["slug"].startswith("origin/") and r["in_nav"]]
    print(f"改动 {len(plan)} 条 · 草本子页退出导航 {len(herbs)} 条 · 标签写 {len(LABELS)} 个 slug × {len(LANGS)} 语种")
    for p in plan:
        print("  ", p)
    if not a.apply:
        print("\n加 --apply 才写库"); return
    # 1) 新页(先建父,再建子)
    for slug, parent, sort, in_nav, tpl, status in TREE:
        if slug in by:
            continue
        d1(f"INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ({q(SITE)}, {q(slug)}, NULL, {q(tpl)}, {in_nav}, {sort}, {q(status)})")
        by[slug] = d1(f"SELECT id, slug FROM pages WHERE site_id = '{SITE}' AND slug = {q(slug)}")[0]
        print("  建页", slug, by[slug]["id"])
    # 2) 父子与顺序
    for slug, parent, sort, in_nav, _, _ in TREE:
        pid = by[parent]["id"] if parent else None
        d1(f"UPDATE pages SET parent_id = {q(pid) if pid else 'NULL'}, sort_order = {sort}, in_nav = {in_nav}, updated_at = datetime('now') WHERE id = {by[slug]['id']}")
    d1(f"UPDATE pages SET in_nav = 0 WHERE site_id = '{SITE}' AND slug LIKE 'origin/%' AND in_nav = 1")
    # 3) 标签(18 语种;title 缺的用标签补,不覆盖已有 title)
    n = 0
    for slug, labels in LABELS.items():
        pid = by[slug]["id"]
        for lang, label in zip(LANGS, labels):
            d1(f"INSERT INTO page_i18n (page_id, lang, nav_label, title) VALUES ({pid}, {q(lang)}, {q(label)}, {q(label)}) "
               f"ON CONFLICT(page_id, lang) DO UPDATE SET nav_label = excluded.nav_label")
            n += 1
    print(f"标签写入 {n} 行")
    top = d1(f"SELECT p.slug, p.sort_order, i.nav_label FROM pages p JOIN page_i18n i ON i.page_id = p.id AND i.lang = 'zh-cn' WHERE p.site_id = '{SITE}' AND p.parent_id IS NULL AND p.in_nav = 1 AND p.status = 'published' ORDER BY p.sort_order")
    print("顶级导航:", " | ".join(f"{t['nav_label']}" for t in top))


if __name__ == "__main__":
    main()
