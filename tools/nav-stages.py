#!/usr/bin/env python3
"""顶栏六站,每站一个总览页(/stage/{key}/),悬停出下拉、点击进总览 —— 创始人 2026-09-11 02:3x 三条:
「为什么每个版块前面加数字」→ 标签去掉序号;「要不然悬停下拉,要不然点击进总览再显示下拉」→ 顶级项落到总览页;
「包装盒也是包材的,为什么你独立,这是错的」→ 包装盒并回包材站。幂等。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1  # noqa: E402

SITE = "biosphere-ai"
LANGS = ["zh-cn", "zh-tw", "en", "jp", "kr", "de", "fr", "es", "pt", "ru", "ar", "tr", "th", "vn", "id", "my", "ph", "in"]
CARTONS = "packaging/?t=use-gift,outer-carton"
PAPER = "packaging/?t=rigid-box,leaflet,overwrap-film,shrink-sleeve,seal-sticker"
L = {
 "stage/source": ["源头·原料", "源頭·原料", "Source & botanicals", "原料の源流", "원료·산지", "Herkunft & Rohstoffe", "Origine & matières", "Origen y materias primas", "Origem e matérias-primas", "Сырьё и происхождение", "المصدر والمواد الخام", "Kaynak ve hammadde", "แหล่งที่มาและวัตถุดิบ", "Nguồn gốc & nguyên liệu", "Sumber & bahan baku", "Sumber & bahan mentah", "Pinagmulan at sangkap", "स्रोत और कच्चा माल"],
 "stage/containers": ["包材", "包材", "Packaging", "容器・包材", "용기·포장재", "Verpackung", "Emballage", "Envases", "Embalagens", "Упаковка", "العبوات والتغليف", "Ambalaj", "บรรจุภัณฑ์", "Bao bì", "Kemasan", "Pembungkusan", "Pakete", "पैकेजिंग"],
 "stage/formula": ["配方", "配方", "Formulas", "処方", "처방", "Rezepturen", "Formules", "Fórmulas", "Fórmulas", "Рецептуры", "التركيبات", "Formüller", "สูตร", "Công thức", "Formula", "Formula", "Pormula", "फ़ॉर्मूला"],
 "stage/products": ["成品", "成品", "Finished products", "製品", "완제품", "Fertigprodukte", "Produits finis", "Producto terminado", "Produto acabado", "Готовая продукция", "المنتجات النهائية", "Bitmiş ürün", "สินค้าสำเร็จรูป", "Thành phẩm", "Produk jadi", "Produk siap", "Tapos na produkto", "तैयार उत्पाद"],
 "stage/compliance": ["质检·合规", "質檢·合規", "QC & compliance", "品質・法規", "품질·규제", "Qualität & Compliance", "Qualité & conformité", "Calidad y cumplimiento", "Qualidade e conformidade", "Качество и соответствие", "الجودة والامتثال", "Kalite ve uyum", "คุณภาพและกฎระเบียบ", "Chất lượng & tuân thủ", "Mutu & kepatuhan", "Kualiti & pematuhan", "Kalidad at pagsunod", "गुणवत्ता और अनुपालन"],
 "stage/market": ["市场·获客", "市場·獲客", "Market & buyers", "市場・販路", "시장·영업", "Markt & Vertrieb", "Marché & acheteurs", "Mercado y compradores", "Mercado e compradores", "Рынок и клиенты", "السوق والعملاء", "Pazar ve alıcılar", "ตลาดและลูกค้า", "Thị trường & khách hàng", "Pasar & pembeli", "Pasaran & pembeli", "Merkado at mamimili", "बाज़ार और ख़रीदार"],
 # 原来的父页恢复成自己的名字(之前被写成带序号的站名)
 "origin": ["原料溯源", "原料溯源", "Ingredient origins", "原料トレーサビリティ", "원료 추적", "Rohstoff-Herkunft", "Origine des matières", "Origen de ingredientes", "Origem dos ingredientes", "Происхождение сырья", "مصدر المكونات", "Hammadde kaynağı", "แหล่งที่มาวัตถุดิบ", "Nguồn gốc nguyên liệu", "Asal bahan baku", "Asal bahan mentah", "Pinagmulan ng sangkap", "सामग्री का स्रोत"],
 "packaging": ["包材库", "包材庫", "Packaging library", "包材ライブラリ", "포장재 라이브러리", "Verpackungsbibliothek", "Bibliothèque d'emballages", "Biblioteca de envases", "Biblioteca de embalagens", "Библиотека упаковки", "مكتبة العبوات", "Ambalaj kütüphanesi", "คลังบรรจุภัณฑ์", "Thư viện bao bì", "Pustaka kemasan", "Pustaka pembungkusan", "Aklatan ng pakete", "पैकेजिंग लाइब्रेरी"],
 "formulas": ["配方库", "配方庫", "Formula library", "処方ライブラリ", "처방 라이브러리", "Rezepturbibliothek", "Bibliothèque de formules", "Biblioteca de fórmulas", "Biblioteca de fórmulas", "Библиотека рецептур", "مكتبة التركيبات", "Formül kütüphanesi", "คลังสูตร", "Thư viện công thức", "Pustaka formula", "Pustaka formula", "Aklatan ng pormula", "फ़ॉर्मूला लाइब्रेरी"],
 "products": ["产品品类", "產品品類", "Product categories", "製品カテゴリ", "제품 카테고리", "Produktkategorien", "Catégories de produits", "Categorías de productos", "Categorias de produtos", "Категории продукции", "فئات المنتجات", "Ürün kategorileri", "หมวดผลิตภัณฑ์", "Danh mục sản phẩm", "Kategori produk", "Kategori produk", "Kategorya ng produkto", "उत्पाद श्रेणियाँ"],
 "quality": ["质量与合规", "質量與合規", "Quality & compliance", "品質と法規", "품질과 규제", "Qualität & Compliance", "Qualité & conformité", "Calidad y cumplimiento", "Qualidade e conformidade", "Качество и соответствие", "الجودة والامتثال", "Kalite ve uyum", "คุณภาพและการปฏิบัติตาม", "Chất lượng & tuân thủ", "Mutu & kepatuhan", "Kualiti & pematuhan", "Kalidad at pagsunod", "गुणवत्ता और अनुपालन"],
 "guides": ["选型指南", "選型指南", "Guides", "選定ガイド", "선택 가이드", "Leitfäden", "Guides", "Guías", "Guias", "Руководства", "أدلة", "Rehberler", "คู่มือ", "Hướng dẫn", "Panduan", "Panduan", "Mga gabay", "मार्गदर्शिकाएँ"],
 CARTONS: ["外盒·礼盒", "外盒·禮盒", "Cartons & gift boxes", "外箱・ギフトボックス", "외박스·선물상자", "Faltschachteln & Geschenkboxen", "Étuis & coffrets", "Estuches y cajas regalo", "Caixas e estojos", "Коробки и подарочные упаковки", "علب وصناديق هدايا", "Kutular ve hediye kutuları", "กล่องและกล่องของขวัญ", "Hộp giấy & hộp quà", "Kotak & kotak hadiah", "Kotak & kotak hadiah", "Kahon at gift box", "डिब्बे और उपहार बॉक्स"],
}
for k, v in L.items():
    assert len(v) == 18, k
# (slug, parent, sort)
TREE = [
 ("chain", None, 1),
 ("stage/source", None, 10), ("origin", "stage/source", 11), ("ingredients", "stage/source", 12), ("bases", "stage/source", 13), ("inci", "stage/source", 14), ("graph", "stage/source", 15), ("search", "stage/source", 16),
 ("stage/containers", None, 20), ("packaging", "stage/containers", 21), (CARTONS, "stage/containers", 22), (PAPER, "stage/containers", 23), ("capabilities/packaging", "stage/containers", 24), ("pack", "stage/containers", 25),
 ("stage/formula", None, 30), ("formulas", "stage/formula", 31), ("rnd/formulation", "stage/formula", 32), ("rnd/lab", "stage/formula", 33), ("studio", "stage/formula", 34), ("ai", "stage/formula", 35),
 ("stage/products", None, 50), ("products", "stage/products", 51), ("capabilities/manufacturing", "stage/products", 52), ("about/plants", "stage/products", 53), ("services", "stage/products", 54), ("capabilities/incubation", "stage/products", 55), ("capabilities", "stage/products", 56),
 ("stage/compliance", None, 60), ("quality", "stage/compliance", 61), ("qc", "stage/compliance", 62), ("regulations", "stage/compliance", 63), ("compliance", "stage/compliance", 64),
 ("stage/market", None, 70), ("guides", "stage/market", 71), ("trends", "stage/market", 72), ("answers", "stage/market", 73), ("compare", "stage/market", 74), ("cases", "stage/market", 75), ("faq", "stage/market", 76), ("news", "stage/market", 77), ("skin", "stage/market", 78),
 ("contact", None, 80), ("about", "contact", 81), ("about/founder", "contact", 82), ("about/history", "contact", 83),
]
q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"  # noqa: E731
rows = {r["slug"]: r for r in d1(f"SELECT id, slug FROM pages WHERE site_id = '{SITE}'")}
for slug, parent, sort in TREE:
    if slug not in rows:
        d1(f"INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) VALUES ('{SITE}', {q(slug)}, NULL, 'external', 1, {sort}, 'published')")
        rows[slug] = d1(f"SELECT id, slug FROM pages WHERE site_id = '{SITE}' AND slug = {q(slug)}")[0]
        print("建页", slug, rows[slug]["id"])
for slug, parent, sort in TREE:
    pid = rows[parent]["id"] if parent else None
    d1(f"UPDATE pages SET parent_id = {pid if pid else 'NULL'}, sort_order = {sort}, in_nav = 1, status = 'published', updated_at = datetime('now') WHERE id = {rows[slug]['id']}")
n = 0
for slug, labels in L.items():
    for lang, lab in zip(LANGS, labels):
        d1(f"INSERT INTO page_i18n (page_id, lang, nav_label, title) VALUES ({rows[slug]['id']}, {q(lang)}, {q(lab)}, {q(lab)}) ON CONFLICT(page_id, lang) DO UPDATE SET nav_label = excluded.nav_label"); n += 1
print("标签", n, "行")
print("顶级:", [r["nav_label"] for r in d1(f"SELECT i.nav_label FROM pages p JOIN page_i18n i ON i.page_id = p.id AND i.lang = 'zh-cn' WHERE p.site_id = '{SITE}' AND p.parent_id IS NULL AND p.in_nav = 1 AND p.status = 'published' ORDER BY p.sort_order")])
