/**
 * 今日待办的推导 SQL —— 从 today.astro 抽出来,今日待办页与业务协同工作台共用同一段逻辑,规则改这一处。
 * WorkBuddy 原型的 SLA 思路:待办由数据现状推导,不是手工维护的清单;做了就自动消失。
 * 规则(天数写死在这里):
 *   询盘:new 超 1 天没人接 → 逾期;following 超 3 天没记录 → 该跟进
 *   外联:A 级(≥60)还没发 → 今天发;sent 超 5 天无回复 → 发第二封;replied 超 3 天没约谈 → 催
 *   机会:打样/报价/谈判 7 天没动 → 催;预计成交日已过 → 更新;需求确认 14 天没动 → 推进或丢单
 *   寄样反馈截止已过 → 催;报价单 3 天内到期或已过期还是「已发」→ 续期或跟进
 */
export type Todo = { href: string; title: string; text: string; late?: boolean; blank?: boolean };
export type TodoGroup = { key: string; label: string; n?: number; items: Todo[]; empty: string };

export async function loadToday(db: D1Database): Promise<{ groups: TodoGroup[]; total: number }> {
  const age = `CAST(julianday('now') - julianday(COALESCE(updated_at, created_at)) AS INTEGER)`;
  const safe = async <T>(p: Promise<{ results: T[] }>) => (await p.catch(() => ({ results: [] as T[] }))).results;
  const inqNew = await safe(db.prepare(`SELECT id, name, company, country, ai_grade, ai_summary, CAST(julianday('now') - julianday(created_at) AS INTEGER) AS d FROM inquiries WHERE status='new' AND COALESCE(spam_score,0) <= 50 ORDER BY created_at LIMIT 30`).all<any>());
  const inqStale = (await safe(db.prepare(
    `SELECT i.id, i.name, i.company, i.country, ${age.replace(/updated_at, created_at/g, "(SELECT MAX(created_at) FROM inquiry_notes n WHERE n.inquiry_id=i.id), i.created_at")} AS d
       FROM inquiries i WHERE i.status='following' ORDER BY d DESC LIMIT 30`).all<any>())).filter((x: any) => x.d >= 3);
  const toSend = await safe(db.prepare(`SELECT id, brand, country, icp_score, hook FROM prospects WHERE status='new' AND icp_score >= 60 ORDER BY icp_score DESC LIMIT 20`).all<any>());
  const bump = await safe(db.prepare(`SELECT id, brand, country, icp_score, status, ${age} AS d FROM prospects WHERE (status='sent' AND ${age} >= 5) OR (status='replied' AND ${age} >= 3) ORDER BY d DESC LIMIT 30`).all<any>());
  const report = await db.prepare(`SELECT date FROM market_reports ORDER BY date DESC LIMIT 1`).first<{ date: string }>().catch(() => null);
  const dealTodo = await safe(db.prepare(
    `SELECT d.id, d.name, d.stage, d.amount, d.close_date, c.id AS cid, c.name AS company, CAST(julianday('now') - julianday(d.updated_at) AS INTEGER) AS d
       FROM deals d JOIN companies c ON c.id=d.company_id WHERE d.stage NOT IN ('won','lost') AND (
         (d.stage IN ('sampling','quote','negotiate') AND julianday('now') - julianday(d.updated_at) >= 7) OR (d.close_date IS NOT NULL AND d.close_date < date('now')) OR
         (d.stage IN ('discover','design') AND julianday('now') - julianday(d.updated_at) >= 14)) ORDER BY d.amount DESC LIMIT 30`).all<any>());
  const sampleTodo = await safe(db.prepare(
    `SELECT s.id, s.items, s.feedback_due, c.id AS cid, c.name AS company, CAST(julianday('now') - julianday(s.feedback_due) AS INTEGER) AS d
       FROM samples s JOIN companies c ON c.id=s.company_id WHERE s.status IN ('sent','received') AND s.feedback IS NULL AND s.feedback_due <= date('now') ORDER BY s.feedback_due LIMIT 30`).all<any>());
  const quoteTodo = await safe(db.prepare(
    `SELECT q.id, q.code, q.subtotal, q.currency, q.valid_until, c.id AS cid, c.name AS company, CAST(julianday(q.valid_until) - julianday('now') AS INTEGER) AS d
       FROM quotes q JOIN companies c ON c.id=q.company_id WHERE q.status='sent' AND q.valid_until IS NOT NULL AND q.valid_until <= date('now','+3 days') ORDER BY q.valid_until LIMIT 30`).all<any>());
  /* 邮件中心(2026-09-18):客户来信超 4 小时没回 → 出现在这里;回了、归档了、判成垃圾 / 供应商推销就消失。没分类的也算(AI 失败不能成为漏看的理由) */
  const mailLate = await safe(db.prepare(
    `SELECT id, from_addr, from_name, subject, ai_category, ai_summary, CAST((julianday('now') - julianday(received_at)) * 24 AS INTEGER) AS h
       FROM mails WHERE direction='in' AND status IN ('unread','read') AND replied_at IS NULL AND (ai_category IS NULL OR ai_category IN ('询盘','报价','样品','投诉'))
        AND julianday('now') - julianday(received_at) >= 4.0/24 ORDER BY received_at LIMIT 30`).all<any>());
  /* 09-24 C1 BEAUTY2OEM 自动草稿(P03 简报 / P04 第 3·7·14 天再触达):待审、待发、失败都进今日待办;审批前不能发 */
  const b2o = await safe(db.prepare(
    `SELECT d.id, d.profile_id, d.kind, d.status, p.contact_ref, CAST((julianday('now') - julianday(d.updated_at)) * 24 AS INTEGER) AS h
       FROM b2o_auto_drafts d LEFT JOIN b2o_profiles p ON p.id=d.profile_id WHERE d.status IN ('draft','approved','failed') ORDER BY d.id LIMIT 30`).all<any>());
  const today = new Date().toISOString().slice(0, 10);

  const inq: Todo[] = [
    ...inqNew.map((r: any) => ({ href: '/bohui/inquiries/?status=new', late: r.d >= 1, title: `${r.ai_grade ? `[${r.ai_grade}] ` : ''}${r.name}${r.company ? ` · ${r.company}` : ''}${r.country ? ` · ${r.country}` : ''}`, text: `${r.d >= 1 ? `新询盘 ${r.d} 天没人接` : '新询盘,今天回'}${r.ai_summary ? ` — ${r.ai_summary}` : ''}` })),
    ...inqStale.map((r: any) => ({ href: '/bohui/inquiries/?status=following', late: true, title: `${r.name}${r.company ? ` · ${r.company}` : ''}`, text: `跟进中,${r.d} 天没有新记录` })),
    ...mailLate.map((r: any) => ({ href: `/bohui/mail/?id=${r.id}`, late: r.h >= 24, title: `${r.ai_category ? `[${r.ai_category}] ` : '[邮件] '}${r.from_name || r.from_addr} · ${r.subject || '(无主题)'}`, text: `来信 ${r.h >= 24 ? `${Math.floor(r.h / 24)} 天` : `${r.h} 小时`}没回${r.ai_summary ? ` — ${r.ai_summary}` : ''}` })),
  ];
  const out: Todo[] = [
    ...bump.map((r: any) => ({ href: `/bohui/prospects/?q=${encodeURIComponent(r.brand)}`, late: true, title: `${r.brand} · ${r.country}`, text: r.status === 'sent' ? `已发 ${r.d} 天无回复 → 发第二封(两行:上封要点 + 一个具体问题)` : `回复 ${r.d} 天还没约上 → 提议 20 分钟视频看样` })),
    ...toSend.map((r: any) => ({ href: `/bohui/prospects/?q=${encodeURIComponent(r.brand)}`, title: `${r.icp_score} · ${r.brand} · ${r.country}`, text: `A 级待发 — ${r.hook}` })),
  ];
  const deal: Todo[] = [
    ...sampleTodo.map((r: any) => ({ href: `/bohui/companies/?open=${r.cid}`, late: true, title: `${r.company} · 样品:${r.items}`, text: `反馈截止 ${r.feedback_due} 已过 ${r.d} 天 → 问一句收到没、用得怎么样,记反馈` })),
    ...quoteTodo.map((r: any) => ({ href: `/bohui/companies/?open=${r.cid}`, late: true, title: `${r.company} · 报价单 ${r.code} · ${Number(r.subtotal).toLocaleString()} ${r.currency}`, text: r.d < 0 ? `有效期 ${r.valid_until} 已过 → 续期或标过期` : `有效期还剩 ${r.d} 天 → 推一把,问决定` })),
    ...dealTodo.map((r: any) => ({ href: `/bohui/companies/?open=${r.cid}`, late: true, title: `${r.company} · ${r.name}${r.amount ? ` · $${Number(r.amount).toLocaleString()}` : ''}`, text: r.close_date && r.close_date < today ? `预计成交日 ${r.close_date} 已过 → 更新日期或推进` : r.stage === 'discover' || r.stage === 'design' ? `${r.d} 天停在前期 → 推进或标丢单` : `${r.d} 天没动 → 催一下(寄样/报价反馈)` })),
  ];
  const market: Todo[] = [
    report ? { href: '/bohui/market/', title: `爆款周报 ${report.date}`, text: '看「行动」两条:研发立项 + 业务切入点' } : { href: '/bohui/market/', title: '还没有周报', text: '爆款周报每周一生成' },
    { href: '/en/trends/market/', blank: true, title: '公开榜单页', text: '给客户看的市场快照,发开发信时可以附链接' },
  ];
  const KN: Record<string, string> = { brief: '机会简报', retouch3: '第 3 天再触达', retouch7: '第 7 天电话', retouch14: '第 14 天再触达' };
  const b2oT: Todo[] = b2o.map((r: any) => ({ href: `/bohui/b2o-brief/?draft=${r.id}#auto`, late: r.status === 'approved' ? r.h >= 1 : r.h >= 4,
    title: `${KN[r.kind] ?? r.kind} · ${(r.contact_ref || '').split('-')[0] || `B2O-${r.profile_id}`}`,
    text: r.status === 'draft' ? '草稿待顾问核对、管理员批准(批准前不能发)' : r.status === 'approved' ? '已批准 → 在企业微信发出后回来点「已发」' : '自动生成失败,可在简报助手手工出稿' }));
  const groups: TodoGroup[] = [
    { key: 'inq', label: '询盘', n: inq.length, items: inq, empty: '询盘都处理过了。' },
    { key: 'out', label: '定向外联', n: out.length, items: out, empty: 'A 级都发过了,等回复。' },
    { key: 'deal', label: '机会', n: deal.length, items: deal, empty: '机会都在动。' },
    { key: 'b2o', label: 'BEAUTY2OEM 草稿', n: b2oT.length, items: b2oT, empty: '没有待审或待发的草稿。' },
    { key: 'market', label: '市场', items: market, empty: '' },
  ];
  return { groups, total: inq.length + out.length + deal.length + b2oT.length };
}
