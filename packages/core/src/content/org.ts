/**
 * 公司主体与 Organization 结构化数据 —— 放在 core,让**每一页**都能带上。
 *
 * 为什么从 apps/web/src/lib/jsonld.ts 挪过来(2026-09-07):
 * 原来它只在 CMS 页与资讯页发出,而服务页、三个货架、所有单品详情页都没有 ——
 * AI 答案引擎落到「ST-A2384 这款包材」那一页时,完全不知道这是哪家公司、
 * 有什么认证、怎么联系。而那些页恰恰是被检索到概率最高的一批。
 * 挪进 BaseLayout 之后,全站每一页都带同一个 @id 的 Organization 块;
 * 同一页出现两次也无害 —— @id 相同,消费方会合并。
 */

/** 公司主体 —— 来自《帛卉公司介绍_2026》 */
export const ORG = {
  legalZh: '广州市帛卉化妆品有限公司',
  legalEn: 'Guangzhou Bohui Cosmetics Co., Ltd.',   // 09-22 体检:营业执照是 广州市帛卉化妆品有限公司,英文法人名此前写成 Biosphere → 与执照对不上,主动邀验厂反成信任漏洞
  brandLineEn: 'BIOSPHERE is the export brand of Guangzhou Bohui Cosmetics Co., Ltd.',
  brandLineZh: 'BIOSPHERE 是广州市帛卉化妆品有限公司的出口品牌。',
  brand: 'BIOSPHERE',
  city: 'Guangzhou',
  region: 'Guangdong',
  country: 'CN',
  founded: undefined as string | undefined,   // 资料未给,不编
  /* 2026-09-07:CE 删掉。创始人原话「没CE」——
     前台的认证行当天就改了,但结构化数据这份漏了,
     等于我们一边跟人说没有,一边告诉机器我们有。
     结构化数据是给机器看的对外声明,口径必须和页面完全一致。 */
  /* 2026-09-23 事实修正(协调人):认证只留「工厂口径」页的三项。FDA 是设施注册、EU CPNP 是产品通报、SGS 是检测机构 ——
     都不是认证,此前被当 credentialCategory:'certification' 写进每一页的 hasCredential,已移出;需要时用下面 compliance 的准确措辞。 */
  certs: ['GMPC', 'ISO 22716', 'HALAL'],
  /* 帛卉硬事实 · 来源:2026-09-24 老板会议。对客户只给这些现成的成熟配方,不给 AI 现编配方(没做过稳定性测试)。
     对外说配方总数一律用这里,不用库里 formulas 表的行数(那只是在线展示的一部分)。 */
  formulas: {
    n: 13000, value: '13,000+', source: '2026-09-24 老板会议',
    zh: '成熟配方 13,000+,均经稳定性测试', en: '13,000+ mature formulas, all stability-tested',
    noticeZh: '帛卉有 13,000+ 个经过稳定性测试的成熟配方,我们从中为你匹配现成配方。',
    noticeEn: 'BIOSPHERE holds 13,000+ mature formulas, all stability-tested. We match a proven one to your brief.',
  },
  compliance: {
    en: 'US FDA cosmetic facility registration; EU CPNP product notifications filed per product; third-party testing by SGS.',
    zh: '美国 FDA 化妆品设施注册;欧盟 CPNP 按产品逐一通报;第三方检测由 SGS 出具。',
  },
  figures: [
    { name: '全球生产基地总面积', nameEn: 'Manufacturing floor area', value: '20000', unit: 'MTK' },
    { name: '自动化生产流水线', nameEn: 'Automated production lines', value: '15', unit: 'C62' },
    { name: '面膜类日产能', nameEn: 'Daily sheet mask capacity', value: '500000', unit: 'C62' },
    { name: '水乳霜类日产能', nameEn: 'Daily lotion and cream capacity', value: '300000', unit: 'C62' },
    { name: '成熟配方技术储备', nameEn: 'Formulations on file', value: '13000', unit: 'C62' },
    { name: '战略合作供应商', nameEn: 'Strategic suppliers', value: '300', unit: 'C62' },
  ],
  services: ['OEM', 'ODM', 'OBM', '配方研发', '包材开发', '出海合规'],
};

/**
 * 组织。用 Organization 而不是 LocalBusiness ——
 * LocalBusiness 是给「有营业时间、顾客上门」的场所用的,
 * 代工厂不属于那一类,用错类型比不用更糟。
 */
export function orgJsonLd(base: string, siteName: string, locale: string, description: string, contact?: { whatsapp?: string | null; wechat?: string | null }) {
  const zh = locale.startsWith('zh');
  const wa = String(contact?.whatsapp ?? '').replace(/\D/g, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: zh ? ORG.legalZh : ORG.legalEn,
    alternateName: [ORG.brand, siteName],
    url: base,
    /* sameAs = 最便宜的跨源佐证信号(2026-09 GEO 调研):AI 引擎交叉验证
       多个来源的同一主体,官网↔阿里国际站店铺互指能提升被引用的置信度。
       口径纪律:店铺上的产能/认证数字须与官网一致,不一致会反噬。 */
    sameAs: ['https://biospherecosmetics.en.alibaba.com/'],
    /* 联络方式进结构化数据 —— AI 答案引擎回答「这家工厂怎么联系」时,
       抓的是这里,而不是页面上那行字。WhatsApp 对海外采购是最低摩擦的入口。
       contactType 用 sales 而不是 customer support:我们要的是询盘,不是售后。 */
    /* 2026-09-07 外部诊断指出缺这两项 E-E-A-T 强信号。
       numberOfEmployees 的数字 llms.txt 里本来就写着「研发人员 30 人以上」,
       只是没进 schema —— 有的数据没让机器读到,等于没有。
       foundingDate 公司资料里没有确切年份,**不编** —— 缺一项好过错一项。 */
    numberOfEmployees: {
      '@type': 'QuantitativeValue', minValue: 30,
      unitText: zh ? '研发人员' : 'R&D specialists',
    },
    /* 成立日期 = 2012-06-01,取自营业执照(工商登记),创始人 2026-09-09 拍板。
       为什么必须用工商日期:采购在爱企查/企查查/国家企业信用信息公示系统上
       一查就是这个日期。**我们写的年份必须和别人能查到的那个对得上**,
       否则第一个数字就对不上,后面所有数字都要被重新怀疑。
       此前这里写过 2003 —— 抄自我们自己的阿里国际站店铺页(「since 2003」),
       而那个店铺已经没人维护、数字是错的。教训:**对外渠道不是真源**,
       哪怕是我们自己开的。同理阿里店的产线数(12)、面积(15,000㎡)也是旧数,以本站为准。 */
    foundingDate: '2012-06-01',
        contactPoint: [{
      '@type': 'ContactPoint',
      contactType: 'sales',
            /* 2026-09-09 修:这里原本被误插了一份 numberOfEmployees ——
         ContactPoint 没有这个属性,写在这里是无效字段,
         而无效字段会让整块 schema 的可信度打折。它属于 Organization,上面已经有了。 */
      name: zh ? '销售咨询' : 'Sales inquiries',
      availableLanguage: ['zh-Hans', 'en'],
      areaServed: ['CN', 'US', 'EU', 'SEA', 'MENA'],
      /* 有号码才写 telephone 与 wa.me;空的 wa.me/ 是无效链接,以前那样写等于给 AI 引擎一个坏地址 */
      ...(wa ? { telephone: `+${wa}`, url: `https://wa.me/${wa}` } : { url: `${base}/en/contact/` }),
    }],
    logo: `${base}/media/57`,
    image: `${base}/media/57`,
    description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: ORG.city,
      addressRegion: ORG.region,
      addressCountry: ORG.country,
    },
    /* 只写在运营的生产地。
       2026-09-09 创始人确认:印尼唐格朗只是投资,没有实际运营 ——
       把一个不出货的地址写进 location,等于告诉机器我们在那里能生产,
       采购照着问排产就穿帮。等它真投产再加回来。 */
    location: [
      { '@type': 'Place', name: zh ? '广州基地' : 'Guangzhou Plant', address: { '@type': 'PostalAddress', addressLocality: 'Guangzhou', addressCountry: 'CN' } },
    ],
    hasCredential: ORG.certs.map((c) => ({ '@type': 'EducationalOccupationalCredential', credentialCategory: 'certification', name: c })),
    // additionalProperty 是放「事实数字」最合适的地方 —— AI 引擎取事实时优先读它
    additionalProperty: ORG.figures.map((f) => ({
      '@type': 'PropertyValue', name: zh ? f.name : f.nameEn, value: f.value, unitCode: f.unit,
    })),
    knowsAbout: zh
      ? ['化妆品代工', 'OEM', 'ODM', '草本护肤', '配方研发', 'GMPC 洁净生产', 'HALAL 认证', '出口合规']
      : ['Cosmetics contract manufacturing', 'OEM', 'ODM', 'Herbal skincare', 'Formulation R&D', 'GMPC production', 'HALAL certification', 'Export compliance'],
  };
}
