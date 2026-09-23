/**
 * 法务四件套补齐:Cookie 政策 + 免责声明(创始人:「按 Google 的规定,底部还有几个协议?」)。
 *
 * 实情:Google 搜索本身不硬性规定页脚协议数量;硬要求来自 AdSense/Merchant 等产品。
 * 但国际站的信任惯例是四件套 —— 隐私政策、法律声明已有,
 * Cookie 与免责此前揉在前两份里,拆成独立页:更专业、可独立收录、也为将来
 * 接广告/购物类产品预留合规位。
 *
 * 纪律同 seed-legal.mjs:中英双权威文本(块 type=legal,翻译管线自动跳过),
 * 内容只陈述本站真实行为(无跟踪 Cookie 是实况,不是漂亮话)。
 */
import { writeFileSync } from 'node:fs';
import { d1 } from './d1.mjs';
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const EMAIL = 'inquiry@biosphere-ai.com';

const COOKIES_ZH = {
  effective: '生效日期:2026 年 8 月 30 日',
  sections: [
    { h: '本政策说明', ps: [
      '本政策说明 BIOSPHERE-AI 官方网站(biosphere-ai.com,下称「本网站」)如何使用 Cookie 及类似技术,与《隐私政策》配套阅读。' ] },
    { h: '我们使用什么', items: [
      '必要 Cookie:仅用于管理员后台的登录会话(HttpOnly、加密传输)。普通访客浏览本网站不需要、也不会被设置登录 Cookie;',
      '人机验证:后台登录页加载 Cloudflare Turnstile 验证组件,验证过程中 Cloudflare 可能设置其自有的功能性 Cookie,仅用于区分真人与程序;',
      '浏览器本地存储(localStorage / sessionStorage):保存您的语言偏好、询盘车清单与 AI 客服对话草稿。这些数据保留在您自己的设备上,不上传服务器,清除浏览器站点数据即可删除。' ] },
    { h: '我们不使用什么', items: [
      '不使用任何第三方广告 Cookie 或跟踪像素;',
      '不做跨站跟踪,不向任何广告网络共享访问数据;',
      '不使用指纹识别等替代性跟踪技术。' ] },
    { h: '如何管理', ps: [
      '您可以在浏览器设置中查看、清除或阻止 Cookie 与站点数据。阻止必要 Cookie 只会影响后台登录功能,不影响普通访客浏览本网站的任何内容。' ] },
    { h: '政策变更', ps: ['本政策如有变更,将在本页更新生效日期。'] },
    { h: '联系我们', ps: [`关于 Cookie 使用的任何疑问:${EMAIL}。本政策以中文、英文两种文本发布;如有出入,以中文文本为准。`] },
  ],
};

const COOKIES_EN = {
  effective: 'Effective date: 30 August 2026',
  sections: [
    { h: 'About this policy', ps: [
      'This policy explains how the official BIOSPHERE-AI website (biosphere-ai.com, the "Site") uses cookies and similar technologies. Read it together with our Privacy Policy.' ] },
    { h: 'What we use', items: [
      'Essential cookies: only for the admin console login session (HttpOnly, encrypted in transit). Ordinary visitors browse without any login cookies being set;',
      'Human verification: the admin login page loads Cloudflare Turnstile, which may set its own functional cookies during verification, used solely to tell humans from bots;',
      'Browser local storage (localStorage / sessionStorage): stores your language preference, inquiry list and AI-assistant chat draft. This data stays on your own device, is never uploaded, and is removed when you clear site data.' ] },
    { h: 'What we do not use', items: [
      'No third-party advertising cookies or tracking pixels;',
      'No cross-site tracking and no sharing of visit data with ad networks;',
      'No fingerprinting or other covert tracking techniques.' ] },
    { h: 'Managing cookies', ps: [
      'You can inspect, clear or block cookies and site data in your browser settings. Blocking essential cookies only affects admin login and has no impact on ordinary browsing.' ] },
    { h: 'Changes', ps: ['Changes to this policy will be published on this page with an updated effective date.'] },
    { h: 'Contact', ps: [`Questions about cookies: ${EMAIL}. Published in Chinese and English; the Chinese text prevails if versions diverge.`] },
  ],
};

const DISC_ZH = {
  effective: '生效日期:2026 年 8 月 30 日',
  sections: [
    { h: '总则', ps: [
      '本网站(biosphere-ai.com)所载全部内容仅供一般参考,不构成要约、承诺或任何形式的专业意见。本声明与《法律声明》配套适用。' ] },
    { h: '产品与功效', items: [
      '化妆品不是药品,本网站任何内容不构成对疾病诊断、治疗或预防的承诺;',
      '所示功效方向仅为研发能力示意,具体产品的功效宣称以目标市场法规允许的表述及相应备案/注册与检测报告为准;',
      '网站中的产品与包装图片包含 AI 生成的概念设计,用于展示设计与制造能力,不代表最终交付实物。' ] },
    { h: 'AI 生成内容', items: [
      'AI 客服、AI 共创、AI 肌肤检测的输出为参考性建议,不构成医学、皮肤科或其他专业意见;',
      '「行业资讯」栏目为 AI 编辑基于公开报道撰写的原创转述与点评,均注明信息来源;其时效性与准确性以来源报道为准,内容不代表来源方立场,也不构成本网站对相关事实的独立核实。' ] },
    { h: '数据与数字', ps: [
      '站内展示的产能、配方储备等数字为发布时点的经营口径,可能随经营调整而更新;正式合作中以双方书面文件为准。' ] },
    { h: '外部链接', ps: [
      '本网站包含指向第三方网站的链接(如资讯来源)。该等链接仅为便利提供,不代表我们对其内容的认可或背书;访问第三方网站的风险由您自行承担。' ] },
    { h: '责任限制', ps: [
      '在适用法律允许的最大范围内,我们对因使用或依赖本网站内容而产生的任何损失不承担责任;完整的责任条款见《法律声明》。' ] },
    { h: '联系我们', ps: [`对本声明的任何疑问:${EMAIL}。本声明以中文、英文两种文本发布;如有出入,以中文文本为准。`] },
  ],
};

const DISC_EN = {
  effective: 'Effective date: 30 August 2026',
  sections: [
    { h: 'General', ps: [
      'All content on this website (biosphere-ai.com) is for general reference only and does not constitute an offer, a promise or professional advice of any kind. This disclaimer applies together with our Legal Notices.' ] },
    { h: 'Products and efficacy', items: [
      'Cosmetics are not medicines; nothing on the Site is a claim to diagnose, treat or prevent any disease;',
      'Efficacy directions shown are illustrations of R&D capability; claims for specific products follow the wording permitted by target-market regulations and the corresponding registrations and test reports;',
      'Product and packaging imagery includes AI-generated concept designs demonstrating design and manufacturing capability; they do not depict final deliverables.' ] },
    { h: 'AI-generated content', items: [
      'Output of the AI assistant, AI co-creation and AI skin analysis is advisory reference only, not medical, dermatological or other professional advice;',
      'The Industry News section consists of original AI-edited briefs based on public reporting, with sources cited; accuracy and timeliness follow the source reports, and the briefs represent neither the source\u2019s position nor our independent verification of the facts.' ] },
    { h: 'Data and figures', ps: [
      'Capacity, formula-library and similar figures reflect operating snapshots at the time of publication and may change; written documents govern in any formal cooperation.' ] },
    { h: 'External links', ps: [
      'The Site links to third-party websites (such as news sources) for convenience only; links are not an endorsement, and you visit third-party sites at your own risk.' ] },
    { h: 'Limitation of liability', ps: [
      'To the maximum extent permitted by law, we accept no liability for losses arising from use of or reliance on Site content; full terms are in the Legal Notices.' ] },
    { h: 'Contact', ps: [`Questions about this disclaimer: ${EMAIL}. Published in Chinese and English; the Chinese text prevails if versions diverge.`] },
  ],
};

/* ── 写库 ── */
const PAGES = [
  { slug: 'cookies', sort: 16, zh: 'Cookie 政策', en: 'Cookie Policy',
    zhLead: '本站只用最少的必要 Cookie;语言偏好与询盘车保存在您自己的浏览器里。',
    enLead: 'We use only minimal essential cookies; preferences and the inquiry list stay in your own browser.',
    zhDoc: COOKIES_ZH, enDoc: COOKIES_EN },
  { slug: 'disclaimer', sort: 17, zh: '免责声明', en: 'Disclaimer',
    zhLead: '站内内容仅供参考,不构成要约与专业意见;AI 输出与行业资讯的边界在此说明。',
    enLead: 'Site content is for reference only; the boundaries of AI output and industry briefs are stated here.',
    zhDoc: DISC_ZH, enDoc: DISC_EN },
];

const sql = [];
for (const p of PAGES) {
  sql.push(`DELETE FROM pages WHERE site_id='biosphere-ai' AND slug=${lit(p.slug)};`);
  sql.push(`INSERT INTO pages (site_id, slug, template, in_nav, sort_order, status)
    VALUES ('biosphere-ai', ${lit(p.slug)}, 'legal', 0, ${p.sort}, 'published');`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal2a.sql', sql.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal2a.sql', { file: true });

const sql2 = [];
for (const p of PAGES) {
  const pid = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug=${lit(p.slug)}`)[0].id;
  sql2.push(`INSERT INTO page_i18n (page_id, lang, nav_label, title, seo_desc, mt) VALUES
    (${pid}, 'zh-cn', ${lit(p.zh)}, ${lit(p.zh)}, ${lit(p.zhLead)}, 0),
    (${pid}, 'en', ${lit(p.en)}, ${lit(p.en)}, ${lit(p.enLead)}, 0);`);
  sql2.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${pid}, 'hero', 0, 1);`);
  sql2.push(`INSERT INTO blocks (page_id, type, sort_order, is_visible) VALUES (${pid}, 'legal', 1, 1);`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal2b.sql', sql2.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal2b.sql', { file: true });

const sql3 = [];
for (const p of PAGES) {
  const pid = d1(`SELECT id FROM pages WHERE site_id='biosphere-ai' AND slug=${lit(p.slug)}`)[0].id;
  const hero = d1(`SELECT id FROM blocks WHERE page_id=${pid} AND type='hero'`)[0].id;
  const legal = d1(`SELECT id FROM blocks WHERE page_id=${pid} AND type='legal'`)[0].id;
  const heroZh = { eyebrow: 'BIOSPHERE-AI', title: p.zh, lead: p.zhLead, ctaPrimary: '发起询盘' };
  const heroEn = { eyebrow: 'BIOSPHERE-AI', title: p.en, lead: p.enLead, ctaPrimary: 'Start an inquiry' };
  sql3.push(`INSERT INTO block_i18n (block_id, lang, data_json, mt) VALUES
    (${hero}, 'zh-cn', ${lit(JSON.stringify(heroZh))}, 0),
    (${hero}, 'en', ${lit(JSON.stringify(heroEn))}, 0),
    (${legal}, 'zh-cn', ${lit(JSON.stringify(p.zhDoc))}, 0),
    (${legal}, 'en', ${lit(JSON.stringify(p.enDoc))}, 0);`);
  console.log(`${p.slug} → page ${pid}, hero ${hero}, legal ${legal}`);
}
writeFileSync('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal2c.sql', sql3.join('\n'), 'utf8');
d1('F:/0cosmetic/cosmetic-sites/node_modules/.cache/legal2c.sql', { file: true });
console.log('Cookie 政策 / 免责声明 已入库(中英双权威,legal 块不机翻)');
