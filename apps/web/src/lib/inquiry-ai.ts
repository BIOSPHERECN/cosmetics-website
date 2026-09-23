/**
 * 询盘落库之后的两件事:AI 分级 + 即时通知。都是「尽力而为」:任一环节失败不影响询盘已入库这个事实。
 *
 * 由来:2026-09-16 创始人「老板现在更倾向于获客」「说了就要做,而不是等」。
 * 询盘表单早就接进 D1 了,但没人知道来了询盘 —— 后台没人天天看。所以:
 *   ① 模型读一遍正文,给 A/B/C/spam 与一句话摘要 + 建议下一步(化妆品代工业务员的视角,不是通用客服);
 *   ② 推到群机器人:NOTIFY_WEBHOOK 支持企业微信 / 飞书 / 钉钉 / Telegram 四种地址,按 URL 认;
 *      没配就只落库,后台「询盘线索」页照常能看。
 *   ③ 秒级首回(2026-09-16 加,创始人转来的行业横评:「响应超过 5 分钟,留资转化率掉一半」「7×24 秒级响应」是外贸 AI 获客第一卖点):
 *      模型顺手写一封对方语言的首回(确认收到 + 我们能做什么 + 两个问题),存 ai_reply;配了 RESEND_API_KEY 就直接发出去(只发 A/B 级),
 *      没配就留在后台给业务员一键复制。C/spam 不回,省得给推销邮件回执。
 * 调用方式:在 API 里 waitUntil,不拖慢给访客的回执。
 */
import { chat, loadFleet } from './fleet';
import { judge, INQUIRY_QUESTIONS, summarize } from './jev';
import { redact } from './mail';
import { sendMail, canSend } from './mail';

const PROMPT = `你是一家中国化妆品 OEM/ODM 工厂(广州,15 条产线,GMPC/ISO22716/HALAL,主做印尼与中东、欧美私标)的资深外贸业务经理。
读下面这条官网询盘,只输出 JSON:{"grade":"A|B|C|spam","summary":"一句话:对方是谁、要什么、量级、市场","next":"给业务员的下一步(一句话,含要问对方的 2 个问题)","lang":"对方语言代码",
"reply_subject":"首回邮件主题(对方语言)","reply":"首回邮件正文(对方语言,≤120 词):谢谢来信并复述对方要的东西;我们对应能做什么(品类 + GMPC/ISO22716/HALAL;起订量、出样周期、价格不写具体数字,强调大货产能与准时交付,业务经理报价时给);问 2 个推进问题(目标市场/规格容量/预计首单量/有无配方或参考样);说明业务经理 24 小时内跟进;落款 BIOSPHERE,不写电话,不吹牛"}。
分级:A=明确品类+量级或目标市场,像真采购;B=有需求但信息不全;C=学生/求职/泛泛咨询/供应商推销;spam=广告/无意义。C/spam 的 reply 留空。不要解释。`;

export async function gradeAndNotify(db: D1Database, env: any, id: number, row: { name: string; company: string | null; email: string; country: string | null; message: string; lang: string; source_path: string | null; category: string | null; volume: string | null; whatsapp?: string | null; noReply?: boolean }) {
  let grade = '', summary = '', next = '', replySubject = '', reply = '';
  try {
    const fleet = await loadFleet(db, env);
    // 知识库里的「AI 写信规则」原样带上:业务经理改那一篇,下一封首回就按新规则写(2026-09-16 销售知识库)
    const rules = await db.prepare(`SELECT body FROM playbooks WHERE slug='rules-for-ai'`).first<{ body: string }>().catch(() => null);
    const sys = rules?.body ? `${PROMPT}

【写信规则(必须遵守)】
${rules.body.slice(0, 4000)}` : PROMPT;
    const r = await chat(env, [{ role: 'system', content: sys }, { role: 'user', content: `姓名:${row.name}\n公司:${row.company ?? ''}\n邮箱:${row.email}\n国家:${row.country ?? ''}\n品类:${row.category ?? ''}\n量级:${row.volume ?? ''}\n来源页:${row.source_path ?? ''}\n正文:${row.message.slice(0, 2000)}` }], { fleet, json: true, maxTokens: 1000, timeoutMs: 30000 });
    const raw = String(r.text ?? ''); const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    grade = ['A', 'B', 'C', 'spam'].includes(j.grade) ? j.grade : 'B'; summary = String(j.summary ?? '').slice(0, 300); next = String(j.next ?? '').slice(0, 300);
    if (grade === 'A' || grade === 'B') { replySubject = String(j.reply_subject ?? '').slice(0, 160); reply = String(j.reply ?? '').slice(0, 2000); }
    await db.prepare('UPDATE inquiries SET ai_grade = ?, ai_summary = ?, ai_reply = ? WHERE id = ?').bind(grade, `${summary}${next ? ' ‖ 下一步:' + next : ''}`, reply ? `${replySubject}\n\n${reply}` : null, id).run();
  } catch { /* 分级失败不影响通知 */ }

  // 秒级首回:只在能发信且是 A/B 级时真发。发信走 lib/mail 的三选一(2026-09-18:Cloudflare Email Sending 优先,Resend 备选;发件域名要先接入)
  let sent = false;
  if (reply && !row.noReply && canSend(env)) {   // noReply:BEAUTY2OEM 简报表单承诺人工 24 小时交付,不发 AI 首回
    const r = await sendMail(env, { to: [row.email], subject: replySubject || 'Re: your inquiry to BIOSPHERE', text: reply });
    sent = r.ok;   // 发不出去就留给业务员手动发,后台有草稿
    if (sent) await db.prepare("UPDATE inquiries SET auto_replied_at = datetime('now') WHERE id = ?").bind(id).run();
  }

  const hook = String(env.NOTIFY_WEBHOOK ?? '').trim();
  if (!hook) return;
  /* Jev 影子判断(09-22 创始人「jev 要接入」):与舰队分级并排记账,不接管。脱敏后只送正文与国家;失败静默。 */
  let jevLine = '';
  try {
    const jr = await judge(env, redact(`国家:${row.country ?? ''}\n公司:${row.company ?? ''}\n正文:${row.message}`), INQUIRY_QUESTIONS);
    if (jr) { jevLine = summarize(jr); await db.prepare('UPDATE inquiries SET jev_json = ? WHERE id = ?').bind(JSON.stringify({ answers: jr.answers, ms: jr.ms }).slice(0, 4000), id).run().catch(() => {}); }
  } catch { /* 影子跑,不影响主流程 */ }
  const text = `【官网询盘 #${id}${grade ? ' · ' + grade : ''}】${row.company ?? ''} ${row.name}(${row.country ?? '-'})\n${summary || row.message.slice(0, 140)}\n${jevLine ? 'Jev:' + jevLine + '\n' : ''}${next ? '下一步:' + next + '\n' : ''}邮箱:${row.email}${row.whatsapp ? '\nWhatsApp:' + row.whatsapp : ''}${reply ? '\n首回:' + (sent ? '已自动发出' : '草稿在后台,一键复制') : ''}\n后台:https://biosphere-ai.com/bohui/inquiries`;
  let body: unknown;
  if (/qyapi\.weixin\.qq\.com/.test(hook)) body = { msgtype: 'text', text: { content: text } };
  else if (/open\.feishu\.cn|larksuite\.com/.test(hook)) body = { msg_type: 'text', content: { text } };
  else if (/oapi\.dingtalk\.com/.test(hook)) body = { msgtype: 'text', text: { content: text } };
  else if (/api\.telegram\.org/.test(hook)) body = { chat_id: env.NOTIFY_CHAT_ID, text };
  else body = { text };
  try {
    const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) await db.prepare("UPDATE inquiries SET notified_at = datetime('now') WHERE id = ?").bind(id).run();
  } catch { /* 通知失败留空 notified_at,后台能看出来 */ }
}
