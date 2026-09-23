/**
 * 邮件中心的 AI 一段:分类 / 摘要 / 建议回复 + 群机器人提醒。
 * 主站接口(op=ai 重跑)与收信 Worker(apps/mail-worker)共用这一份 —— 提示词只能有一处,否则两边口径迟早分叉。
 *
 * 三条线(2026-09-18 架构文档「安全」节):
 *   ① AI 只做分类 / 摘要 / 建议回复,**不自动发**;发不发、发什么由业务员在后台点。
 *   ② 送模型前脱敏:邮箱、电话、网址换成占位;只送前 3,000 字。模型要判断的是「这封信是什么」,不需要联系方式。
 *   ③ 任一步失败都不影响邮件已入库这个事实。
 */
import { chat, loadFleet } from './fleet.ts';   // 带扩展名:node 直接跑测试(apps/mail-worker/test)也能解析

export const CATEGORIES = ['询盘', '报价', '样品', '投诉', '供应商', '垃圾', '其他'] as const;
export type Category = typeof CATEGORIES[number];
/** 要立即推群的类别 —— 客户在等回音的那三种 */
export const HOT = new Set<string>(['询盘', '报价', '样品']);

const PROMPT = `你是一家中国化妆品 OEM/ODM 工厂(广州,15 条产线,GMPC/ISO22716/HALAL,主做印尼与中东、欧美私标)的资深外贸业务经理兼邮件助理。
读下面这封发到公司域名邮箱的邮件,只输出 JSON:
{"category":"询盘|报价|样品|投诉|供应商|垃圾|其他","summary":"中文,不超过 60 字:对方是谁、要什么、要我们做什么","reply_subject":"回信主题(对方语言)","reply":"回信正文(对方语言,不超过 120 词)"}
分类口径:询盘=想找我们代工或买产品;报价=已在谈,问价或催报价单;样品=要样、寄样、样品反馈;投诉=质量、交期、售后不满;供应商=向我们推销原料、包材、服务;垃圾=广告、钓鱼、无意义;其他=以上都不是(招聘、财务、平台通知等)。
只有 询盘/报价/样品 才写 reply,其余 reply 与 reply_subject 留空。
回信规则:谢谢来信并复述对方要的东西;我们对应能做什么(品类 + GMPC/ISO22716/HALAL,强调大货产能与准时交付);起订量、出样周期、价格、交期一律不写具体数字(由业务经理报);问 2 个推进问题(目标市场 / 规格容量 / 预计首单量 / 有无配方或参考样);说明业务经理 24 小时内跟进;落款 BIOSPHERE;不写电话,不吹牛。不要解释。`;

/** 邮箱 / 电话 / 网址换占位。只用于送模型的副本,库里存的是原文 */
export function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[url]')
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '[phone]' : m));
}

export type MailForAi = { subject: string | null; from_addr: string | null; from_name: string | null; text: string | null };
export type AiVerdict = { category: Category; summary: string; reply: string | null };

export async function classifyMail(db: D1Database, env: any, m: MailForAi, entityId?: number): Promise<AiVerdict> {
  const fleet = await loadFleet(db, env);
  // 知识库「AI 写信规则」原样带上(与询盘秒回同一篇):业务经理改那一篇,下一封建议回复就按新规则写
  const rules = await db.prepare(`SELECT body FROM playbooks WHERE slug='rules-for-ai'`).first<{ body: string }>().catch(() => null);
  const sys = rules?.body ? `${PROMPT}\n\n【写信规则(必须遵守)】\n${rules.body.slice(0, 4000)}` : PROMPT;
  const domain = (m.from_addr ?? '').split('@')[1] ?? '';
  const user = `发件人:${redact(m.from_name ?? '')}(域名 ${domain || '未知'})\n主题:${redact(m.subject ?? '')}\n正文:\n${redact(m.text ?? '').slice(0, 3000)}`;
  const r = await chat(env, [{ role: 'system', content: sys }, { role: 'user', content: user }],
    { fleet, json: true, maxTokens: 900, timeoutMs: 30000, promptKey: 'mail-classify', entity: entityId ? { type: 'mail', id: entityId } : undefined, db });
  const raw = String(r.text ?? '');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const category = (CATEGORIES as readonly string[]).includes(j.category) ? (j.category as Category) : '其他';
  const summary = String(j.summary ?? '').replace(/\s+/g, ' ').slice(0, 120);
  const subj = String(j.reply_subject ?? '').trim().slice(0, 160), body = String(j.reply ?? '').trim().slice(0, 2000);
  const reply = HOT.has(category) && body ? `${subj || 'Re: ' + (m.subject ?? '')}\n\n${body}` : null;
  return { category, summary, reply };
}

/**
 * 推群机器人。按 URL 认平台(与 inquiry-ai 同一套识别):企业微信走 markdown(创始人指定形状),其余 text。
 * 返回 true = 对方 2xx。没配 NOTIFY_WEBHOOK 直接 false,不抛。
 */
export async function notifyHook(env: any, text: string, markdown?: string): Promise<boolean> {
  const hook = String(env.NOTIFY_WEBHOOK ?? '').trim();
  if (!hook) return false;
  let body: unknown;
  if (/qyapi\.weixin\.qq\.com/.test(hook)) body = { msgtype: 'markdown', markdown: { content: (markdown ?? text).slice(0, 4000) } };
  else if (/open\.feishu\.cn|larksuite\.com/.test(hook)) body = { msg_type: 'text', content: { text } };
  else if (/oapi\.dingtalk\.com/.test(hook)) body = { msgtype: 'markdown', markdown: { title: text.split('\n')[0].slice(0, 60), text: (markdown ?? text).slice(0, 4000) } };
  else if (/api\.telegram\.org/.test(hook)) body = { chat_id: env.NOTIFY_CHAT_ID, text };
  else body = { text };
  try {
    const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok;
  } catch { return false; }
}

/** 一封新邮件的群提醒文案(text 给飞书/Telegram,markdown 给企业微信/钉钉) */
export function mailAlert(m: { id: number; from_addr: string | null; from_name: string | null; subject: string | null; ai_category: string | null; ai_summary: string | null }) {
  const who = `${m.from_name ? m.from_name + ' ' : ''}<${m.from_addr ?? '?'}>`;
  const url = `https://biosphere-ai.com/bohui/mail/?id=${m.id}`;
  const text = `【新邮件 · ${m.ai_category ?? '待分类'}】${m.subject ?? '(无主题)'}\n来自:${who}\n${m.ai_summary ?? ''}\n后台:${url}`;
  const markdown = `**新邮件 · <font color="warning">${m.ai_category ?? '待分类'}</font>**\n> 主题:${m.subject ?? '(无主题)'}\n> 来自:${who}\n> ${m.ai_summary ?? ''}\n[去后台处理](${url})`;
  return { text, markdown };
}

/* ── 发信:三选一 ──
   ① Cloudflare Email Sending(send_email 绑定 EMAIL;2026-09-18 创始人在面板看到「电子邮件服务 → 电子邮件发送(Beta)」,问「是不是也可以发邮件了」—— 是)
      Workers Paid 计划;每月含 3,000 封,之后 $0.35 / 1,000;发件地址必须属于「已接入」的域名(面板 Compute → Email Service → Email Sending → Onboard Domain,
      自动加 DKIM / SPF / DMARC 与 cf-bounce 退信记录);新账号每日配额从保守值起、按送达率放大;单封 5 MiB、收件人 ≤ 50、自定义头 ≤ 16 KB。
      域名没接入时 send() 抛 E_SENDER_NOT_VERIFIED / E_SENDER_DOMAIN_NOT_AVAILABLE —— 绑定本身不校验域名,可以先部署。
   ② Resend(RESEND_API_KEY)—— 备选;发件域名要在 Resend 验过。
   ③ 都没有 → 返回 msg,后台按钮置灰。
   自定义头只带 In-Reply-To / References 串会话;Cloudflare 若拒某个头(E_HEADER_*),去掉头再发一次 —— 串不上会话也比发不出去强。 */
export function canSend(env: any): boolean {
  return typeof env?.EMAIL?.send === 'function' || !!String(env?.RESEND_API_KEY ?? '').trim();
}
export function mailFrom(env: any): { email: string; name: string; raw: string } {
  const raw = String(env?.MAIL_FROM || 'BIOSPHERE <inquiry@biosphere-ai.com>').trim();
  const m = /^(.*?)\s*<([^>]+)>$/.exec(raw);
  return m ? { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim(), raw } : { name: '', email: raw, raw };
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function sendMail(env: any, m: { to: string[]; subject: string; text: string; html?: string; replyTo?: string; headers?: Record<string, string> }): Promise<{ ok: boolean; id?: string; via?: 'cloudflare' | 'resend'; msg?: string }> {
  const to = m.to.map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));
  if (!to.length) return { ok: false, msg: '收件人邮箱不合法' };
  const from = mailFrom(env);
  const replyTo = m.replyTo || env.MAIL_REPLY_TO || undefined;
  const cf = env?.EMAIL;
  let cfErr = '';
  if (typeof cf?.send === 'function') {
    const msg: any = { from: from.name ? { email: from.email, name: from.name } : from.email, to, subject: m.subject, text: m.text, html: m.html, replyTo };
    for (const withHeaders of [true, false]) {
      if (withHeaders && !m.headers) continue;
      try {
        const r = await cf.send(withHeaders ? { ...msg, headers: m.headers } : msg);
        return { ok: true, id: r?.messageId, via: 'cloudflare' };
      } catch (e: any) {
        const code = String(e?.code ?? '');
        cfErr = `Cloudflare Email Sending:${code || String(e).slice(0, 120)}`;
        if (withHeaders && /^E_HEADER/.test(code)) continue;   // 头被拒:不带头再试一次
        break;
      }
    }
  }
  const key = String(env?.RESEND_API_KEY ?? '').trim();
  if (key) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from.raw, to, reply_to: replyTo, subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
      });
      const j = await res.json().catch(() => ({})) as any;
      return res.ok ? { ok: true, id: j.id, via: 'resend' } : { ok: false, msg: `${cfErr ? cfErr + ';' : ''}Resend ${res.status}:${String(j.message ?? '').slice(0, 200)}` };
    } catch (e) { return { ok: false, msg: `${cfErr ? cfErr + ';' : ''}Resend 请求失败:${String(e).slice(0, 120)}` }; }
  }
  if (cfErr) return { ok: false, msg: /E_SENDER_(NOT_VERIFIED|DOMAIN_NOT_AVAILABLE)/.test(cfErr) ? `${cfErr} —— 发件域名 ${from.email.split('@')[1]} 还没在 Cloudflare「电子邮件发送」里接入,待创始人在面板点「接入域名」` : cfErr };
  return { ok: false, msg: '待创始人接入:Cloudflare「电子邮件发送」接入域名 biosphere-ai.com 后自动可发(备选:配 RESEND_API_KEY)' };
}

/* ── 列表查询:后台页(SSR 首屏)与 /api/admin/mail?op=list 共用,SQL 只有这一份 ── */
export const BOX_SQL: Record<string, string> = {
  inbox: `m.direction='in' AND m.status IN ('unread','read')`,
  replied: `m.direction='in' AND m.status='replied'`,
  archived: `m.direction='in' AND m.status='archived'`,
  spam: `m.direction='in' AND m.status='spam'`,
  sent: `m.direction='out'`,
};
const LIST_COLS = `m.id, m.direction, m.thread_id, m.from_addr, m.from_name, m.to_addrs, m.subject, m.snippet, m.received_at, m.spf, m.spam_score, m.status,
  m.assignee_uid, u.display_name AS assignee_name, u.email AS assignee_email, m.inquiry_id, m.matter_id, m.company_id, m.ai_category,
  (m.attachments_json IS NOT NULL) AS has_attach`;

export async function listMails(db: D1Database, o: { box?: string; q?: string; cat?: string; page?: number; per?: number }) {
  const box = BOX_SQL[String(o.box)] ? String(o.box) : 'inbox';
  const where = [BOX_SQL[box]], bind: unknown[] = [];
  const q = String(o.q ?? '').trim().slice(0, 100);
  if (q) { where.push('(m.subject LIKE ? OR m.from_addr LIKE ? OR m.from_name LIKE ? OR m.snippet LIKE ?)'); bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (o.cat && (CATEGORIES as readonly string[]).includes(String(o.cat))) { where.push('m.ai_category=?'); bind.push(String(o.cat)); }
  const page = Math.max(1, Number(o.page) || 1), per = o.per ?? 30;
  const W = where.join(' AND ');
  const total = (await db.prepare(`SELECT COUNT(*) n FROM mails m WHERE ${W}`).bind(...bind).first<{ n: number }>())?.n ?? 0;
  const { results } = await db.prepare(
    `SELECT ${LIST_COLS} FROM mails m LEFT JOIN users u ON u.id=m.assignee_uid WHERE ${W}
      ORDER BY (m.status='unread') DESC, m.received_at DESC LIMIT ? OFFSET ?`).bind(...bind, per, (page - 1) * per).all<any>();
  const { results: cnt } = await db.prepare(`SELECT direction, status, COUNT(*) n FROM mails GROUP BY direction, status`).all<{ direction: string; status: string; n: number }>();
  const counts: Record<string, number> = { inbox: 0, unread: 0, replied: 0, archived: 0, spam: 0, sent: 0 };
  for (const r of cnt ?? []) {
    if (r.direction === 'out') counts.sent += r.n;
    else if (r.status === 'unread') { counts.inbox += r.n; counts.unread += r.n; }
    else if (r.status === 'read') counts.inbox += r.n;
    else if (counts[r.status] !== undefined) counts[r.status] += r.n;
  }
  return { rows: (results ?? []) as any[], total, page, pages: Math.max(1, Math.ceil(total / per)), counts, box, q, cat: o.cat ?? '' };
}

/** 去掉能执行、能外联、能改页面的标签与属性;剩下的交给 iframe sandbox + CSP 兜底。两层都在,单靠哪一层都不够 */
export function sanitizeHtml(h: string): string {
  return h
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|form|meta|link|base|applet|frame|frameset)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action|xlink:href|formaction)\s*=\s*(["']?)\s*(javascript|vbscript|data:text\/html)[^"'\s>]*/gi, '$1=$2#')
    .replace(/<head\b[^>]*>/i, '$&<base target="_blank">')
    .replace(/^(?![\s\S]*<base )/i, '<base target="_blank">');   // 没有 <head> 的片段(多数邮件)就放最前面:链接一律新窗口开,不在 iframe 里跳
}
