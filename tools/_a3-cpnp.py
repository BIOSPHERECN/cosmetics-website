"""09-23 A3:首页资质墙(block 402)把 EU CPNP 写成「注册」—— CPNP 是按产品的通报,不是注册。18 语改成准确措辞,生成 UPDATE。"""
import io, json, sys
sys.stdout.reconfigure(encoding='utf-8')
from _bohui import d1
NOTE = {'en': 'EU cosmetic product notification (per product)', 'zh-cn': '欧盟化妆品通报(按产品)', 'zh-tw': '歐盟化粧品通報(按產品)',
        'jp': 'EU 化粧品届出(製品ごと)', 'kr': 'EU 화장품 신고(제품별)', 'fr': "Notification des cosmétiques dans l'UE (par produit)",
        'de': 'EU-Kosmetik-Notifizierung (je Produkt)', 'es': 'Notificación de cosméticos en la UE (por producto)', 'pt': 'Notificação de cosméticos na UE (por produto)',
        'ru': 'Уведомление о косметической продукции в ЕС (для каждого продукта)', 'id': 'Notifikasi kosmetik Uni Eropa (per produk)',
        'my': 'Notifikasi kosmetik EU (setiap produk)', 'th': 'การแจ้งผลิตภัณฑ์เครื่องสำอางในสหภาพยุโรป (รายผลิตภัณฑ์)',
        'vn': 'Thông báo mỹ phẩm tại EU (theo từng sản phẩm)', 'ph': 'Notipikasyon ng kosmetiko sa EU (bawat produkto)',
        'ar': 'إخطار مستحضرات التجميل في الاتحاد الأوروبي (لكل منتج)', 'tr': 'AB kozmetik bildirimi (ürün bazında)', 'in': 'EU सौंदर्य प्रसाधन अधिसूचना (प्रति उत्पाद)'}
out = []
for r in d1("SELECT lang, data_json FROM block_i18n WHERE block_id = 402"):
    d = json.loads(r['data_json']); hit = 0
    for it in d.get('items', []):
        if 'CPNP' in str(it.get('label', '')) and r['lang'] in NOTE: it['note'] = NOTE[r['lang']]; hit += 1
    if hit:
        js = json.dumps(d, ensure_ascii=False).replace("'", "''")
        out.append(f"UPDATE block_i18n SET data_json = '{js}' WHERE block_id = 402 AND lang = '{r['lang']}';")
io.open('_a3-cpnp.sql', 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(len(out), 'rows')
