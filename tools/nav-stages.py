#!/usr/bin/env python3
"""导航栏 5 项精简版 —— 化繁为简，D1 批量执行版。

2026-10-22: 重写为单 SQL 文件批量执行，避免 360+ 次 D1 查询事故。
所有 INSERT/UPDATE 拼成一个 .sql 文件，一次 d1_exec 完成。
"""
import os, sys, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from _bohui import d1, d1_exec, _q  # noqa: E402

SITE = "biosphere-ai"
LANGS = ["zh-cn", "zh-tw", "en", "jp", "kr", "de", "fr", "es", "pt", "ru", "ar", "tr", "th", "vn", "id", "my", "ph", "in"]

L = {
 "portfolio": ["成品展示","成品展示","Product showcase","製品展示","제품 쇼케이스","Produktshowcase","Vitrine produits","Showcase de productos","Vitrine de produtos","Витрина продуктов","عرض المنتجات","Ürün vitrini","วิทยาการสินค้า","Trưng bày sản phẩm","Showcase produk","Pameran produk","Showcase ng produkto","उत्पाद प्रदर्शनी"],
 "services": ["服务能力","服務能力","Capabilities","サービス能力","서비스 역량","Leistungsspektrum","Capacités","Capacidades","Capacidades","Возможности","القدرات","Hizmet kapasitesi","ความสามารถ","Năng lực dịch vụ","Kemampuan layanan","Keupayaan perkhidmatan","Kakayahan sa serbisyo","सेवा क्षमता"],
 "stage/formula": ["配方与原料","配方與原料","Formulas & ingredients","処方・原料","처방·원료","Rezepturen & Rohstoffe","Formules & ingrédients","Fórmulas e ingredientes","Fórmulas e ingredientes","Рецептуры и сырьё","التركيبات والمواد الخام","Formüller ve hammadde","สูตรและวัตถุดิบ","Công thức & nguyên liệu","Formula & bahan baku","Formula & bahan mentah","Pormula at sangkap","फ़ॉर्मूला और कच्चा माल"],
 "stage/containers": ["包材","包材","Packaging","容器・包材","용기·포장재","Verpackung","Emballage","Envases","Embalagens","Упаковка","العبوات والتغليف","Ambalaj","บรรจุภัณฑ์","Bao bì","Kemasan","Pembungkusan","Pakete","पैकेजिंग"],
 "contact": ["关于我们","關於我們","About us","私たちについて","회사 소개","Über uns","À propos","Sobre nosotros","Sobre nós","О нас","من نحن","Hakkımızda","เกี่ยวกับเรา","Về chúng tôi","Tentang kami","Tentang kami","Tungkol sa amin","हमारे बारे में"],
 "formulas": ["配方库","配方庫","Formula library","処方ライブラリ","처방 라이브러리","Rezepturbibliothek","Bibliothèque de formules","Biblioteca de fórmulas","Biblioteca de fórmulas","Библиотека рецептур","مكتبة التركيبات","Formül kütüphanesi","คลังสูตร","Thư viện công thức","Pustaka formula","Pustaka formula","Aklatan ng pormula","फ़ॉर्मूला लाइब्रेरी"],
 "origin": ["原料溯源","原料溯源","Ingredient origins","原料トレーサビリティ","원료 추적","Rohstoff-Herkunft","Origine des matières","Origen de ingredientes","Origem dos ingredientes","Происхождение сырья","مصدر المكونات","Hammadde kaynağı","แหล่งที่มาวัตถุดิบ","Nguồn gốc nguyên liệu","Asal bahan baku","Asal bahan mentah","Pinagmulan ng sangkap","सामग्री का स्रोत"],
 "inci": ["INCI查询","INCI查詢","INCI lookup","INCI検索","INCI 조회","INCI-Suche","Recherche INCI","Búsqueda INCI","Busca INCI","Поиск INCI","بحث INCI","INCI arama","ค้นหา INCI","Tra cứu INCI","Pencarian INCI","Carian INCI","Paghahanap INCI","INCI खोज"],
 "ai": ["AI配方","AI配方","AI formulation","AI処方","AI 처방","AI-Rezeptur","Formulation IA","Formulación IA","Formulação IA","ИИ-формуляция","صياغة بالذكاء الاصطناعي","AI formülasyon","สูตร AI","Công thức AI","Formulasi AI","Formulasi AI","AI pormulasyon","एआई फॉर्मूलेशन"],
 "studio": ["配方工作室","配方工作室","Formula studio","処方スタジオ","처방 스튜디오","Rezeptur-Studio","Studio de formulation","Estudio de fórmulas","Estúdio de fórmulas","Студия рецептур","استوديو التركيبات","Formül stüdyosu","สตูดิโอสูตร","Studio công thức","Studio formula","Studio formula","Studio ng pormula","फ़ॉर्मूला स्टूडियो"],
 "packaging": ["包材库","包材庫","Packaging library","包材ライブラリ","포장재 라이브러리","Verpackungsbibliothek","Bibliothèque d'emballages","Biblioteca de envases","Biblioteca de embalagens","Библиотека упаковки","مكتبة العبوات","Ambalaj kütüphanesi","คลังบรรจุภัณฑ์","Thư viện bao bì","Pustaka kemasan","Pustaka pembungkusan","Aklatan ng pakete","पैकेजिंग लाइब्रेरी"],
 "pack": ["外盒·礼盒","外盒·禮盒","Cartons & gift boxes","外箱・ギフトボックス","외박스·선물상자","Faltschachteln & Geschenkboxen","Étuis & coffrets","Estuches y cajas regalo","Caixas e estojos","Коробки и подарочные упаковки","علب وصناديق هدايا","Kutular ve hediye kutuları","กล่องและกล่องของขวัญ","Hộp giấy & hộp quà","Kotak & kotak hadiah","Kotak & kotak hadiah","Kahon at gift box","डिब्बे और उपहार बॉक्स"],
 "about/founder": ["创始人","創始人","Founder","創業者","창립자","Gründer","Fondateur","Fundador","Fundador","Основатель","المؤسس","Kurucu","ผู้ก่อตั้ง","Người sáng lập","Pendiri","Pengasas","Tagapagtatag","संस्थापक"],
 "about/plants": ["产线能力","產線能力","Production lines","生産ライン","생산 라인","Produktionslinien","Lignes de production","Líneas de producción","Linhas de produção","Производственные линии","خطوط الإنتاج","Üretim hatları","ไลน์การผลิต","Dây chuyền sản xuất","Lini produksi","Garis pengeluaran","Mga linya ng produksyon","उत्पादन लाइनें"],
 "capabilities": ["核心能力","核心能力","Core capabilities","コア能力","핵심 역량","Kernkompetenzen","Capacités clés","Capacidades clave","Capacidades-chave","Ключевые возможности","القدرات الأساسية","Temel yetkinlikler","ความสามารถหลัก","Năng lực cốt lõi","Kemampuan inti","Keupayaan teras","Pangunahing kakayahan","मुख्य क्षमताएं"],
 "compliance": ["跨境合规","跨境合規","Cross-border compliance","越境コンプライアンス","국가별 규제","Cross-Border-Compliance","Conformité transfrontalière","Cumplimiento transfronterizo","Conformidade transfronteiriça","Межгосударственное соответствие","الامتثال العابر للحدود","Sınır ötesi uyum","การปฏิบัติตามข้ามพรมแดน","Tuân thủ xuyên biên giới","Kepatuhan lintas batas","Pematuhan lintas sempadan","Pagsunod sa hanggang-border","क्रॉस-बॉर्डर अनुपालन"],
 "services/product-development": ["产品开发","產品開發","Product development","製品開発","제품 개발","Produktentwicklung","Développement produit","Desarrollo de productos","Desenvolvimento de produtos","Разработка продуктов","تطوير المنتجات","Ürün geliştirme","การพัฒนาผลิตภัณฑ์","Phát triển sản phẩm","Pengembangan produk","Pembangunan produk","Pagpapaunlad ng produkto","उत्पाद विकास"],
 "services/cross-border-seller": ["跨境卖家","跨境賣家","Cross-border seller","越境セラー","크로스보더 셀러","Cross-Border-Verkäufer","Vendeur transfrontalier","Vendedor transfronterizo","Vendedor transfronteiriço","Межгосударственный продавец","بائع عبر الحدود","Sınır ötesi satıcı","ผู้ขายข้ามพรมแดน","Nhà bán xuyên biên giới","Penjual lintas batas","Penjual lintas sempadan","Nagbebenta cross-border","क्रॉस-बॉर्डर विक्रेता"],
 "services/factory-quality": ["工厂质量","工廠質量","Factory quality","工場品質","공장 품질","Fabrikqualität","Qualité d'usine","Calidad de fábrica","Qualidade de fábrica","Качество завода","جودة المصنع","Fabrika kalitesi","คุณภาพโรงงาน","Chất lượng nhà máy","Kualitas pabrik","Kualiti kilang","Kalidad ng pabrika","फ़ैक्टरी गुणवत्ता"],
}
for k, v in L.items():
    assert len(v) == 18, f"{k} has {len(v)} labels"

TREE = [
 ("portfolio", None, 10),
 ("services", None, 20),
 ("services/product-development", "services", 21),
 ("services/cross-border-seller", "services", 22),
 ("services/factory-quality", "services", 23),
 ("compliance", "services", 24),
 ("stage/formula", None, 30),
 ("formulas", "stage/formula", 31),
 ("origin", "stage/formula", 32),
 ("inci", "stage/formula", 33),
 ("ai", "stage/formula", 34),
 ("studio", "stage/formula", 35),
 ("stage/containers", None, 40),
 ("packaging", "stage/containers", 41),
 ("pack", "stage/containers", 42),
 ("contact", None, 50),
 ("about/founder", "contact", 51),
 ("about/plants", "contact", 52),
 ("capabilities", "contact", 53),
]

REMOVED = [
    "chain", "stage/source", "ingredients", "bases", "graph", "search",
    "stage/products", "products", "capabilities/manufacturing", "capabilities/incubation",
    "stage/compliance", "quality", "qc", "regulations",
    "stage/market", "guides", "trends", "answers", "compare", "cases", "faq", "news", "skin",
    "about", "about/history",
    "capabilities/packaging", "rnd/formulation", "rnd/lab",
]

# ---- 第一步：查现有页面 ID（仅 1 次 D1 查询）----
q = _q
rows = {r["slug"]: r["id"] for r in d1(f"SELECT id, slug FROM pages WHERE site_id = {q(SITE)}")}
print(f"现有页面: {len(rows)} 个")

# ---- 第二步：生成单条 SQL 文件 ----
HERE = os.path.dirname(os.path.abspath(__file__))
sql_path = os.path.join(HERE, "_nav_5item.sql")
lines = []
lines.append("-- 导航栏5项精简 2026-10-22 批量执行")

# 建缺失页面
for slug, parent, sort in TREE:
    if slug not in rows:
        lines.append(
            f"INSERT INTO pages (site_id, slug, parent_id, template, in_nav, sort_order, status) "
            f"VALUES ({q(SITE)}, {q(slug)}, NULL, 'external', 1, {sort}, 'published');")

# 更新 TREE 项
for slug, parent, sort in TREE:
    pid = rows.get(parent)
    pid_str = str(pid) if pid else "NULL"
    lines.append(
        f"UPDATE pages SET parent_id = {pid_str}, sort_order = {sort}, in_nav = 1, "
        f"status = 'published', updated_at = datetime('now') "
        f"WHERE site_id = {q(SITE)} AND slug = {q(slug)};")

# 移除项
for slug in REMOVED:
    if slug in rows:
        lines.append(
            f"UPDATE pages SET in_nav = 0, updated_at = datetime('now') "
            f"WHERE site_id = {q(SITE)} AND slug = {q(slug)};")

# 多语言标签
for slug, labels in L.items():
    for lang, lab in zip(LANGS, labels):
        lines.append(
            f"INSERT INTO page_i18n (page_id, lang, nav_label, title) "
            f"SELECT id, {q(lang)}, {q(lab)}, {q(lab)} FROM pages "
            f"WHERE site_id = {q(SITE)} AND slug = {q(slug)} "
            f"ON CONFLICT(page_id, lang) DO UPDATE SET nav_label = excluded.nav_label;")

sql_text = "\n".join(lines) + "\n"
with io.open(sql_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(sql_text)
print(f"SQL 文件: {len(lines)} 条语句 → {sql_path}")

# ---- 第三步：一次性执行 ----
result = d1_exec(sql_path)
print(f"执行结果: {result} 条受影响")

# ---- 第四步：验证（1 次查询）----
top = d1(
    f"SELECT p.slug, p.sort_order, i.nav_label FROM pages p "
    f"JOIN page_i18n i ON i.page_id = p.id AND i.lang = 'zh-cn' "
    f"WHERE p.site_id = {q(SITE)} AND p.parent_id IS NULL AND p.in_nav = 1 "
    f"AND p.status = 'published' ORDER BY p.sort_order"
)
print("\n顶级导航:")
for r in top:
    print(f"  {r['sort_order']:>2}  {r['slug']:<20} {r['nav_label']}")
