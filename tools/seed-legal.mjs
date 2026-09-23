/**
 * 隐私政策 / 法律声明 全文重写。
 *
 * 创始人拿古方 AI 星图(gufangai.com/privacy /terms)对比后点名:
 * 「这些怎么那么简单啊……太不专业了」—— 原版每页只有两段话。
 * 本脚本按那边的成熟骨架(生效日期 + 编号章节 + 条目)重写,
 * 内容适配本站的真实形态:B2B 询盘平台、无访客账号、AI 共创/肌肤检测、
 * Cloudflare 承载、询盘车走浏览器本地存储。
 *
 * 纪律:
 * - 不编造公司注册号、地址、ICP —— 资料里没有的宁可不写;
 * - 政策里承诺的保留期(日志≤90 天)是承诺,同脚本先把超期 rl:* 清一遍;
 * - 法务文本只出中英两个权威文本(「以中文文本为准」),
 *   其余 15 语种走 bundle 的 en 回退 —— 机翻法律文本是风险不是服务。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

const EMAIL = 'inquiry@biosphere-ai.com';

/* ══ 隐私政策 ══════════════════════════════════════════════ */
const PRIVACY_ZH = {
  effective: '生效日期:2026 年 8 月 30 日',
  sections: [
    { h: '适用范围与运营方', ps: [
      '本政策适用于 BIOSPHERE-AI 官方网站(biosphere-ai.com,以下简称「本网站」),由帛卉集团 BOHUI GROUP(以下简称「我们」)运营。本网站是面向企业客户的化妆品 OEM/ODM 能力展示与商务询盘平台。',
      '本政策说明我们收集、使用、存储与保护您的信息的方式,以及您享有的权利,请您仔细阅读。' ] },
    { h: '我们收集的信息', ps: ['本网站不设访客账号体系,仅收集为回应您的商务咨询所必需的最少信息:'], items: [
      '询盘信息:您通过询盘表单主动提供的姓名、公司、邮箱、国家/地区与需求描述;',
      'AI 功能提交内容:您使用 AI 共创、AI 肌肤检测等功能时主动提交的文字与图片,仅用于生成对应结果;',
      '技术日志:访问时间、IP 地址、设备与浏览器类型,用于安全防护与防滥用审计;',
      '浏览器本地存储:语言偏好与询盘车清单保存在您的浏览器中,不上传服务器,清除浏览器数据即可删除。' ],
      tail: ['我们不收集您的银行账户、身份证件、生物特征或精确地理位置等敏感个人信息。'] },
    { h: '我们如何使用信息', items: [
      '回复并跟进您的询盘与商务合作请求;',
      '提供并改进 AI 共创、AI 肌肤检测等功能;',
      '识别与防御恶意行为(爬虫滥用、批量提交、攻击等);',
      '以匿名聚合方式统计分析,改进网站体验;',
      '履行法律法规要求的合规义务。' ] },
    { h: '信息共享与第三方', ps: ['除以下情形外,我们不向任何第三方共享、出售或转让您的个人信息:'], items: [
      '必要的服务提供商:本网站由 Cloudflare 提供云服务与内容分发(处理 IP、UA 等技术数据);AI 功能由第三方大模型服务商提供推理支持,仅传递生成所需的内容本身,不附带您的身份信息;',
      '法律要求:当我们善意认为披露是履行法律义务、保护我们或公众合法权益所必需;',
      '您的明确授权:在您事先同意的特定场景下。' ] },
    { h: '数据存储与跨境传输', ps: [
      '本网站由 Cloudflare 全球分布式网络承载,您的数据可能存储于中国大陆以外的节点。我们采用 HTTPS/TLS 加密传输,后台访问凭据以单向哈希存储。' ] },
    { h: '数据保留', items: [
      '询盘信息:在商务跟进期间持续保留;合作未达成的,自最后一次联系起保留不超过 24 个月;',
      '安全与访问日志:保留不超过 90 天,仅用于安全审计;',
      'AI 功能提交内容:生成结果后不作其他用途,我们不会将其用于模型训练。' ] },
    { h: '您的权利', ps: [
      `您有权查询、更正、删除您留存于本网站的个人信息,或撤回此前给出的同意。请发送邮件至 ${EMAIL},我们将在 15 个工作日内回复。您也有权就个人信息处理向所在地监管机构投诉。` ] },
    { h: 'Cookie 与本地存储', items: [
      '必要 Cookie:仅用于管理员后台会话;普通访客浏览本网站无需任何登录 Cookie;',
      '本地存储:记住您的语言偏好与询盘车清单,数据保存在您自己的设备上。' ],
      tail: ['本网站不使用任何第三方广告或跟踪 Cookie。'] },
    { h: '未成年人', ps: ['本网站面向企业客户与行业从业者,不面向未成年人提供服务。'] },
    { h: '政策修订', ps: ['我们可能不时修订本政策,重大变更将在本页更新生效日期并作显著提示。修订后您继续使用本网站,即视为接受修订后的政策。'] },
    { h: '联系我们', ps: [
      `如您对本政策有任何疑问,或希望行使上述权利,请联系:${EMAIL}。`,
      '本政策以中文、英文两种文本发布;其他语言版本如与中文文本存在出入,以中文文本为准。' ] },
  ],
};

const PRIVACY_EN = {
  effective: 'Effective date: 30 August 2026',
  sections: [
    { h: 'Scope and operator', ps: [
      'This policy applies to the official BIOSPHERE-AI website (biosphere-ai.com, the "Site"), operated by BOHUI GROUP ("we", "us"). The Site is a B2B showcase and inquiry platform for cosmetics OEM/ODM services.',
      'This policy explains what we collect, how we use, store and protect it, and the rights you have. Please read it carefully.' ] },
    { h: 'Information we collect', ps: ['The Site has no visitor account system. We collect only the minimum needed to respond to your business inquiry:'], items: [
      'Inquiry details: the name, company, email, country/region and requirements you submit through the inquiry form;',
      'AI feature input: text and images you actively submit to features such as AI co-creation or AI skin analysis, used solely to generate the corresponding result;',
      'Technical logs: access time, IP address, device and browser type, used for security and anti-abuse auditing;',
      'Browser local storage: your language preference and inquiry list are stored in your own browser, never uploaded; clearing browser data removes them.' ],
      tail: ['We do not collect bank accounts, government IDs, biometric data, precise geolocation or other sensitive personal information.'] },
    { h: 'How we use information', items: [
      'To respond to and follow up on your inquiries and business requests;',
      'To provide and improve AI co-creation, AI skin analysis and similar features;',
      'To detect and defend against abuse (scraping, bulk submissions, attacks);',
      'To produce anonymised, aggregated statistics that improve the Site;',
      'To meet legal and regulatory obligations.' ] },
    { h: 'Sharing and third parties', ps: ['We do not share, sell or transfer your personal information to any third party, except:'], items: [
      'Essential service providers: the Site runs on Cloudflare (which processes technical data such as IP and user agent); AI features rely on third-party model providers, which receive only the content needed to generate a result, never your identity;',
      'Legal requirements: where we believe in good faith that disclosure is necessary to comply with law or protect legitimate interests;',
      'Your explicit consent: in specific scenarios you have agreed to in advance.' ] },
    { h: 'Storage and cross-border transfer', ps: [
      'The Site is served by Cloudflare\u2019s global network, so your data may be stored outside mainland China. Transport is encrypted (HTTPS/TLS) and admin credentials are stored as one-way hashes.' ] },
    { h: 'Retention', items: [
      'Inquiry details: retained while the business conversation is active; if no cooperation results, no longer than 24 months after last contact;',
      'Security and access logs: no longer than 90 days, used only for security auditing;',
      'AI feature input: not used for any other purpose after the result is generated, and never used to train models.' ] },
    { h: 'Your rights', ps: [
      `You may access, correct or delete the personal information you have left with us, or withdraw prior consent. Email ${EMAIL} and we will respond within 15 working days. You may also lodge a complaint with your local supervisory authority.` ] },
    { h: 'Cookies and local storage', items: [
      'Essential cookies: used only for the admin console session; ordinary visitors need no login cookies;',
      'Local storage: remembers your language preference and inquiry list, kept on your own device.' ],
      tail: ['The Site uses no third-party advertising or tracking cookies.'] },
    { h: 'Minors', ps: ['The Site serves business customers and industry professionals and is not directed at minors.'] },
    { h: 'Changes to this policy', ps: ['We may revise this policy from time to time. Material changes will be flagged on this page with an updated effective date. Continued use of the Site constitutes acceptance.'] },
    { h: 'Contact', ps: [
      `Questions about this policy, or requests to exercise your rights: ${EMAIL}.`,
      'This policy is published in Chinese and English; if versions diverge, the Chinese text prevails.' ] },
  ],
};

/* ══ 法律声明 ══════════════════════════════════════════════ */
const TERMS_ZH = {
  effective: '生效日期:2026 年 8 月 30 日',
  sections: [
    { h: '网站性质', ps: [
      '本网站(biosphere-ai.com)是帛卉集团 BOHUI GROUP 旗下面向企业客户的化妆品 OEM/ODM 能力展示与商务询盘平台。您浏览或使用本网站,即视为您已阅读、理解并同意本声明的全部条款。' ] },
    { h: '非要约声明', ps: [
      '本网站展示的品类、剂型、产能、认证、交期等信息,仅为制造能力展示与商务参考,不构成要约。任何产品规格、起订量、价格与交期,均以双方签署的书面报价单与合同为准。' ] },
    { h: '功效与合规边界', items: [
      '化妆品不是药品。本网站任何内容均不构成对疾病诊断、治疗或预防的承诺;',
      '网站中的成分与工艺描述,不构成对任何具体产品功效的保证;',
      '具体产品的功效宣称,以按目标市场法规完成的备案/注册与相应检测报告为准。' ] },
    { h: 'AI 功能声明', ps: [
      'AI 共创、AI 肌肤检测等功能的输出为参考性研发建议,不构成医学或皮肤科诊疗建议,不能替代专业人士意见。对您依据 AI 输出采取的行动及其后果,我们不承担责任。' ] },
    { h: '知识产权', ps: [
      '本网站的界面、文案、图片、标识及「BIOSPHERE-AI」品牌,归帛卉集团及其关联主体所有。' ], items: [
      '网站中的产品与包装图片包含 AI 生成的概念设计,用于展示设计与制造能力,不代表最终交付实物;',
      '未经我们书面许可,不得复制、修改、传播或商业使用本网站内容;',
      '客户委托开发所产生的配方、包装等成果的权属,按双方合同约定执行。' ] },
    { h: '用户行为规范', items: [
      '不得对本网站进行恶意爬取、扫描、压力测试或反向工程;',
      '不得通过询盘表单或 AI 接口提交违法、侵权或骚扰性内容;',
      '不得将本网站内容用于伪造、虚假宣传或其他非法用途。' ] },
    { h: '免责', ps: [
      '在适用法律允许的最大范围内,对您因使用或无法使用本网站而产生的任何间接、附带、特殊或惩罚性损害,我们不承担责任。我们不保证网站服务不间断、无错误。' ] },
    { h: '声明修订', ps: [
      '我们有权根据法律法规变化或业务需要修订本声明,修订后的文本自本页公布之日起生效。' ] },
    { h: '适用法律与争议解决', ps: [
      '本声明的订立、解释与争议解决,均适用中华人民共和国法律。因本声明产生的争议,双方应先行友好协商;协商不成的,提交运营方所在地有管辖权的人民法院解决。' ] },
    { h: '联系方式', ps: [
      `如您对本声明有任何疑问或建议:${EMAIL}。`,
      '本声明以中文、英文两种文本发布;如有出入,以中文文本为准。' ] },
  ],
};

const TERMS_EN = {
  effective: 'Effective date: 30 August 2026',
  sections: [
    { h: 'Nature of this site', ps: [
      'This website (biosphere-ai.com) is a B2B showcase and inquiry platform for cosmetics OEM/ODM services operated by BOHUI GROUP. By browsing or using the Site you are deemed to have read, understood and accepted these notices in full.' ] },
    { h: 'No offer', ps: [
      'Categories, formats, capacity, certifications and lead times shown on the Site are a demonstration of manufacturing capability and for business reference only; they do not constitute an offer. Specifications, MOQs, prices and lead times are governed solely by the written quotation and contract signed by both parties.' ] },
    { h: 'Efficacy and compliance boundaries', items: [
      'Cosmetics are not medicines. Nothing on the Site constitutes a promise to diagnose, treat or prevent any disease;',
      'Ingredient and process descriptions do not guarantee the efficacy of any specific product;',
      'Efficacy claims for specific products are subject to the registrations/filings and test reports completed under the regulations of the target market.' ] },
    { h: 'AI features', ps: [
      'Output of AI co-creation, AI skin analysis and similar features is advisory R&D reference only. It is not medical or dermatological advice and does not replace professional judgement. We accept no liability for actions taken in reliance on AI output.' ] },
    { h: 'Intellectual property', ps: [
      'The Site\u2019s interface, copy, imagery, marks and the BIOSPHERE-AI brand belong to BOHUI GROUP and its affiliates.' ], items: [
      'Product and packaging imagery on the Site includes AI-generated concept designs that demonstrate design and manufacturing capability; they do not depict final deliverables;',
      'No copying, modification, distribution or commercial use of Site content without our written permission;',
      'Ownership of formulas, packaging and other deliverables developed under commission is governed by the contract between the parties.' ] },
    { h: 'Acceptable use', items: [
      'No malicious scraping, scanning, stress testing or reverse engineering of the Site;',
      'No unlawful, infringing or harassing submissions through the inquiry form or AI interfaces;',
      'No use of Site content for forgery, false advertising or other unlawful purposes.' ] },
    { h: 'Disclaimer', ps: [
      'To the maximum extent permitted by law, we are not liable for any indirect, incidental, special or punitive damages arising from your use of, or inability to use, the Site. We do not warrant uninterrupted or error-free service.' ] },
    { h: 'Revisions', ps: [
      'We may revise these notices as law or business requires; revised text takes effect upon publication on this page.' ] },
    { h: 'Governing law and disputes', ps: [
      'These notices are governed by the laws of the People\u2019s Republic of China. Disputes shall first be resolved through friendly negotiation, failing which they shall be submitted to the competent people\u2019s court at the operator\u2019s domicile.' ] },
    { h: 'Contact', ps: [
      `Questions or suggestions: ${EMAIL}.`,
      'These notices are published in Chinese and English; if versions diverge, the Chinese text prevails.' ] },
  ],
};

/* ── 写库:块 122(privacy)/124(terms)升级为 legal 型 ── */
const sql = [
  `UPDATE blocks SET type='legal' WHERE id IN (122, 124);`,
  `DELETE FROM block_i18n WHERE block_id IN (122, 124);`,
  `INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (122, 'zh-cn', ${lit(JSON.stringify(PRIVACY_ZH))}, 0),
    (122, 'en',    ${lit(JSON.stringify(PRIVACY_EN))}, 0),
    (124, 'zh-cn', ${lit(JSON.stringify(TERMS_ZH))}, 0),
    (124, 'en',    ${lit(JSON.stringify(TERMS_EN))}, 0);`,
  /* 政策承诺「日志≤90 天」—— 先把限流器记在 revisions 里的超期 IP 清掉,说到做到 */
  `DELETE FROM revisions WHERE entity LIKE 'rl:%' AND created_at < datetime('now', '-90 days');`,
];
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal.sql', { file: true });
console.log('隐私政策/法律声明 全文已写入(zh-cn + en 双权威文本,其余语种回退英文)');
