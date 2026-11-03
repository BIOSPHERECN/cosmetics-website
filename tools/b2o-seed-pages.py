"""BEAUTY2OEM v1 页面内容(2026-09-23 A7)—— 生成 SQL,不直接写库。
用法:python tools/b2o-seed-pages.py > %TEMP%/b2o.sql,再用 _bohui.d1_exec 灌(拿 _LOCK_D1_COMPANY 锁)。
做的事:旧占位页转 draft(不删)、首页旧版块隐藏(不删)、新建 4 个内页 + zh-cn 文案 + fx_* 版块、站点改 dtc 主题并上线。
可重复跑:新页 INSERT OR IGNORE;版块只在该页还没有同类型版块时插入。
口径:可以讲帛卉;商务条款(起订 / 交期 / 价格 / 出样)一字不写;数字全用占位符由渲染层读库。"""
import json

SITE = 'beauty2oem'
BH = 'https://biosphere-ai.com/zh-cn'


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


PAGES = [  # slug, sort, nav_label, title, seo_desc
    ('', 0, '首页', 'BEAUTY2OEM · 跨境卖家的产品机会预判与共创',
     '在市场告诉你答案之前,我们先和你把下一款产品准备好。帛卉化妆品(广州工厂)为 Shopee、TikTok Shop、Amazon 等平台的跨境卖家做产品机会预判、产品定义、配方、包材、打样与生产。'),
    ('opportunities', 1, '产品机会', '产品机会预判',
     '公开层只放趋势、阶段、信号、判断过程和反证条件;具体产品方向按你的店铺给。'),
    ('brief', 2, '拿机会简报', '提交店铺,拿机会简报',
     '填写店铺与主销商品,24 小时内收到 1–2 页《客户产品机会简报》:产品结构、缺口、目标市场变化、三个方向。'),
    ('predictions', 3, '预判记录', '预判记录:对的错的都公开',
     '每条判断都写正方、反方、裁决和失效条件,30 / 60 / 90 天回填结果,并统计带来多少询问、拿样、报价与订单。'),
    ('delivery', 4, '帛卉交付', '帛卉交付能力',
     '判断之后由帛卉把产品做出来:真实产品库、在库配方基底、自有产线、包材现货与目标市场法规,数字全部来自数据库。'),
]

SIX = {
    'title': '判断之后,帛卉把它做出来',
    'intro': '预判不是空谈。下面每个数字都来自帛卉的数据库,点进去可以逐条核对。',
    'items': [
        {'label': '全球真实产品库', 'evidence': '{products} 款全成分产品 · {summaries} 条配方视角解读', 'note': '先看同类产品怎么做:成分结构、主打活性物、宣称边界。', 'href': f'{BH}/decoder/', 'image': ''},
        {'label': '在库配方基底', 'evidence': '{formulas} 条可直接打样的配方基底', 'note': '不从零研发:按品类、剂型、功效匹配基底,再按你的卖点调整。', 'href': f'{BH}/formulas/', 'image': ''},
        {'label': '工厂与产线', 'evidence': '{lines} 条自动化产线 · GMPC(化妆品良好生产规范)· ISO 22716(化妆品生产质量管理)· HALAL(清真认证)', 'note': '广州自有工厂,欢迎验厂。', 'href': f'{BH}/about/', 'image': ''},
        {'label': '包材现货', 'evidence': '{packaging} 款现货包材型号', 'note': '瓶、罐、管、泵头、彩盒:先按剂型选结构,再谈定制。', 'href': f'{BH}/packaging/', 'image': ''},
        {'label': '目标市场法规', 'evidence': '{regs} 个市场准入要点 · {inci} 条原料目录', 'note': '配方阶段先核目标国的限用与禁用成分,少返工。', 'href': f'{BH}/regulations/', 'image': ''},
        {'label': '判断公开可查', 'evidence': '对的错的都留档', 'note': '每条预判带失效条件,30 / 60 / 90 天回填结果。', 'href': '/predictions/', 'image': ''},
    ],
}
CONTACT = {'title': '先聊你的生意', 'intro': '第一次沟通不介绍工厂。把店铺和卖得最好的几个商品发来,24 小时内给你一份机会简报。', 'formText': '提交店铺,拿机会简报', 'formHref': '/brief/'}
CARDS_BASE = {'lockText': '具体产品方向:提交店铺后按你的店铺给', 'lockHref': '/brief/'}

BLOCKS = {
    '': [
        ('fx_hero', {
            'eyebrow': '帛卉化妆品 · 跨境卖家的产品机会预判与共创',
            'title': '在市场告诉你答案之前,', 'sub': '我们先和你把下一款产品准备好。',
            'lead': '你负责流量、内容、达人和运营;帛卉负责市场机会、选品、产品定义、配方、包材、打样和生产。你擅长卖,我们让你持续有值得卖的产品。',
            'placeholder': '', 'submit': '',
            'items': [
                {'label': '提交店铺,拿机会简报', 'note': '24 小时内一份 1–2 页简报:产品结构、缺口、三个方向', 'href': '/brief/'},
                {'label': '看产品机会预判', 'note': '趋势、阶段、信号和反证条件,判断过程公开', 'href': '/opportunities/'},
                {'label': '看我们判断对没对', 'note': '预判记录:对的错的都留着,按 30 / 60 / 90 天回填', 'href': '/predictions/'},
            ],
            'hint': '我们做的是产品机会预判,不是爆款预测:判断只放进「提前验证」,不承诺一定会爆。', 'image': '', 'imageAlt': '',
        }),
        ('fx_steps', {
            'title': '早发现 · 深判断 · 共验证 · 快落地',
            'intro': '不是让 AI 猜爆款,是把专家的判断过程带进每一次判断,再用真实结果回头校正。',
            'steps': [
                {'label': '早发现', 'note': '看变化速度,不看排名:搜索、新品数、达人数、评论增速、同一痛点被反复提、相邻市场已验证。'},
                {'label': '深判断', 'note': '正方找支持证据,反方必须找反对证据;裁决写清最大不确定性和失效条件。'},
                {'label': '共验证', 'note': '请你用前线数据一起纠正判断 —— 你们真在卖,哪里不对你最清楚。'},
                {'label': '快落地', 'note': '市场机会 × 你的能力 × 帛卉的能力,三者都成立才进打样。'},
            ],
        }),
        ('fx_cards', {**CARDS_BASE, 'title': '最近的产品机会预判', 'intro': '公开层只放趋势和判断过程;具体产品方向,按你的店铺给。',
                      'empty': '首批机会卡正在复核,复核完就挂在这里。现在提交店铺,我们先按你的店铺看。', 'limit': 3,
                      'moreText': '看全部机会预判', 'moreHref': '/opportunities/'}),
        ('fx_six', SIX),
        ('fx_contact', CONTACT),
    ],
    'opportunities': [
        ('fx_cards', {**CARDS_BASE, 'title': '产品机会卡',
                      'intro': '趋势阶段:萌芽 → 验证 → 加速 → 扩散 → 拥挤 → 价格战 → 成熟 → 衰退,最值得抢的是「验证 → 加速」。代表商品、配方方向与时间窗口不公开 —— 那要按你的店铺来定。',
                      'empty': '首批机会卡正在复核,复核完就挂在这里。现在提交店铺,我们先按你的店铺看。', 'limit': 50,
                      'moreText': '提交店铺,拿机会简报', 'moreHref': '/brief/'}),
        ('fx_steps', {
            'title': '一个机会要过七层判断', 'intro': '市场机会不等于帛卉机会:最后一层成立,才进帛卉的机会池。',
            'steps': [
                {'label': '需求基础', 'note': '销量、销售额、评论数、搜索量'},
                {'label': '变化速度', 'note': '7 / 30 / 90 天的增速,而不是当前排名'},
                {'label': '内容扩散', 'note': '达人、短视频、直播是否开始跟进'},
                {'label': '消费者缺口', 'note': '同一抱怨跨品牌、跨商品、持续增加'},
                {'label': '跨市场迁移', 'note': '相邻国家、相邻平台是否已经验证过'},
                {'label': '商业窗口', 'note': '竞争密度、价格带、头部品牌进入速度'},
                {'label': '帛卉匹配', 'note': '历史产品、配方、包材、工程与法规能不能接住'},
            ],
        }),
    ],
    'brief': [
        ('fx_brief', {
            'title': '提交店铺,24 小时内拿《客户产品机会简报》',
            'intro': '1–2 页:你的产品结构 → 缺口 → 目标市场变化 → 三个方向(最快可测试 / 最值得做 / 差异化机会)→ 帛卉能支持到哪一步。只推三个,每个都写为什么现在、为什么适合你、风险在哪。',
            'submit': '提交,24 小时内拿简报', 'okText': '', 'hint': '带 * 的必填;微信、手机、邮箱留一个就行。',
        }),
        ('fx_steps', {
            'title': '提交之后会发生什么', 'intro': '每一步都有一个看得见的交付物。',
            'steps': [
                {'label': '读懂你的生意', 'note': '整理成客户产品档案,不先推销工厂'},
                {'label': '看市场信号', 'note': '你在卖和准备进的国家、平台最近在变什么'},
                {'label': '找产品缺口', 'note': '只推三个方向,每个都写风险'},
                {'label': '六道闸门', 'note': '市场、客户、能力、成本、法规、时间:推进 / 观察 / 放弃'},
                {'label': '一起定产品', 'note': '形成产品开发任务书'},
                {'label': '样品验证', 'note': '样品按版本记录意见、改动和结果'},
                {'label': '复盘找下一款', 'note': '30 / 60 / 90 天复盘,排下一个 90 天产品计划'},
            ],
        }),
    ],
    'predictions': [
        ('fx_ledger', {
            'title': '预判记录簿',
            'intro': '每条判断都写事实、正方、反方、裁决、最大不确定性和失效条件,到 30 / 60 / 90 天回填结果。对的错的都留在这里 —— 错误的记录最值钱。除了准确率,也统计商业命中:这条判断带来了多少询问、拿样、报价和订单。',
            'empty': '第一批预判正在写入。写入后只回填结果,不改原判断。',
        }),
    ],
    'delivery': [
        ('fx_six', SIX),
        ('fx_steps', {
            'title': '从机会到大货', 'intro': '同一个项目里走完,由同一个对接人跟到底。起订、价格、交期按项目书面确认,页面不估数。',
            'steps': [
                {'label': '产品定义', 'note': '卖点、目标人群、价格带、目标市场'},
                {'label': '匹配基底', 'note': '从在库基底里选方向,定活性物与肤感'},
                {'label': '样品', 'note': '按版本记录意见与改动'},
                {'label': '法规核对', 'note': '目标国备案路径、标签与宣称'},
                {'label': '包装', 'note': '现货包材选型或定制,包装稿逐字核对'},
                {'label': '试产', 'note': '小批量走一遍产线,确认稳定性与灌装'},
                {'label': '大货放行', 'note': '按 QC 项目检测,放行报告随货'},
            ],
        }),
        ('fx_contact', CONTACT),
    ],
}


def main():
    out = []
    pid = lambda slug: f"(SELECT id FROM pages WHERE site_id='{SITE}' AND slug={q(slug)})"
    # 站点:dtc 主题、上线;纯中文站不挂邮箱与 WhatsApp(09-23 18:0x 创始人:公开站不挂个人 gmail,WhatsApp 改微信;域名邮箱等收信验证通了再加)
    out.append(f"UPDATE sites SET theme='dtc', is_live=1, contact_email=NULL, contact_whatsapp=NULL, updated_at=datetime('now') WHERE id='{SITE}';")
    out.append(f"UPDATE site_i18n SET tagline='帛卉 · 跨境产品机会预判', description={q(PAGES[0][4])} WHERE site_id='{SITE}' AND lang='zh-cn';")
    # 旧占位页转 draft、首页旧版块隐藏 —— 都不删
    out.append(f"UPDATE pages SET status='draft', updated_at=datetime('now') WHERE site_id='{SITE}' AND slug NOT IN ({','.join(q(p[0]) for p in PAGES)});")
    out.append(f"UPDATE blocks SET is_visible=0, updated_at=datetime('now') WHERE page_id={pid('')} AND type NOT LIKE 'fx_%';")
    for slug, sort, nav, title, desc in PAGES:
        out.append(f"INSERT OR IGNORE INTO pages (site_id, slug, template, in_nav, sort_order, status) VALUES ('{SITE}', {q(slug)}, 'standard', {0 if slug == '' else 1}, {sort}, 'published');")
        nav_set = '' if slug == '' else 'in_nav=1, '   # 首页的 in_nav 保持原值
        out.append(f"UPDATE pages SET status='published', {nav_set}sort_order={sort}, updated_at=datetime('now') WHERE site_id='{SITE}' AND slug={q(slug)};")
        out.append(f"INSERT OR REPLACE INTO page_i18n (page_id, lang, nav_label, title, seo_desc) VALUES ({pid(slug)}, 'zh-cn', {q(nav)}, {q(title)}, {q(desc)});")
        for i, (typ, data) in enumerate(BLOCKS[slug]):
            order = 10 + i * 10
            out.append(f"INSERT INTO blocks (page_id, type, sort_order, is_visible) SELECT {pid(slug)}, '{typ}', {order}, 1 WHERE NOT EXISTS (SELECT 1 FROM blocks WHERE page_id={pid(slug)} AND type='{typ}');")
            out.append(f"INSERT OR IGNORE INTO block_i18n (block_id, lang, data_json) SELECT id, 'zh-cn', {q(json.dumps(data, ensure_ascii=False))} FROM blocks WHERE page_id={pid(slug)} AND type='{typ}';")
    print('\n'.join(out))


if __name__ == '__main__':
    main()
