/**
 * 询盘落库之后的两件事:AI 分级 + 即时通知。都是「尽力而为」:任一环节失败不影响询盘已入库这个事实。
 *
 * 由来:2026-09-16 创始人「老板现在更倾向于获客」「说了就要做,而不是等」。
 * 询盘表单早就接进 D1 了,但没人知道来了询盘 —— 后台没人天天看。所以:
 *   ① 模型读一遍正文,给 A/B/C/spam 与一句话摘要 + 建议下一步(化妆品代工业务员的视角,不是通用客服);
 *   ② 推到群机器人:NOTIFY_WEBHOOK 支持企业微信 / 飞书 / 钉钉 / Telegram 四种地址,按 URL 认;
 *      没配就只落库,后台「询盘线索」页照常能看。
 *   ③ 秒级首回(2026-09-16 加,创始人转来的行业横评:「响应超过 5 分钟,留资转化率掉一半」「7×24 秒级响应」是外贸 AI 获客第一卖点):
 *      模型顺手写一封对方语言的首回(确认收到 + 我们能做什么 + 两个问题),存 ai_reply;09-24 起一律只存草稿,人审后由业务员自己的邮箱发(不再自动发)。
 *     C/spam 不回,省得给推销邮件回执。
 * 调用方式:在 API 里 waitUntil,不拖慢给访客的回执。
 */
import { chat, loadFleet } from './fleet';
import { judge, INQUIRY_QUESTIONS } from './jev';
import { redact } from './mail';
import { sendMail, canSend } from './mail';

const PROMPT = `你是一家中国化妆品 OEM/ODM 工厂(广州,15 条产线,GMPC/ISO22716/HALAL,主做印尼与中东、欧美私标)的资深外贸业务经理。
读下面这条官网询盘,只输出 JSON:{"grade":"A|B|C|spam","summary":"一句话:对方是谁、要什么、量级、市场","next":"给业务员的下一步(一句话,含要问对方的 2 个问题)","lang":"对方语言代码",
"reply_subject":"首回邮件主题(对方语言)","reply":"首回邮件正文(对方语言,≤120 词):谢谢来信并复述对方要的东西;我们对应能做什么(品类 + GMPC/ISO22716/HALAL,HALAL 只说有证书、覆盖范围以证书为准,不说能进哪个市场;起订量、出样周期、价格不写具体数字,强调大货产能与准时交付,业务经理报价时给);问 2 个推进问题(目标市场/规格容量/预计首单量/有无配方或参考样);不写配方表、不写成分比例、不编配方,对方要配方就写帛卉有 13,000+ 个经过稳定性测试的成熟配方、会从中匹配现成配方;说明业务经理 24 小时内跟进;落款 BIOSPHERE,不写电话,不吹牛"}。
分级:A=明确品类+量级或目标市场,像真采购;B=有需求但信息不全;C=学生/求职/泛泛咨询/供应商推销;spam=广告/无意义。C/spam 的 reply 留空。不要解释。`;

/* 09-24 W1(B4 v2 第六节第 4 点):发给模型前把姓名/邮箱/电话/微信换成占位。入库与群通知照旧用原值。
   姓名用 {{NAME}} 占位,模型写进首回/摘要的占位再换回真名。 */
export function maskPii(s: string, row: { name?: string | null; email?: string | null; whatsapp?: string | null }): string {
  let t = s;
  for (const [v, ph] of [[row.email, '{{EMAIL}}'], [row.whatsapp, '{{PHONE}}'], [row.name, '{{NAME}}']] as const) {
    const x = String(v ?? '').trim();
    if (x.length >= (/^[\x00-\x7f]+$/.test(x) ? 4 : 2)) t = t.split(x).join(ph);   // 短英文名不替换,免得误伤 Lipstick 这类词
  }
  return redact(t)
    .replace(/((?:微信|wechat|weixin|vx|wx)\s*(?:号)?\s*[::]?\s*)[A-Za-z][\w-]{4,19}/gi, '$1{{WECHAT}}')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '{{PHONE}}');
}

export async function gradeAndNotify(db: D1Database, env: any, id: number, row: { name: string; company: string | null; email: string; country: string | null; message: string; lang: string; source_path: string | null; category: string | null; volume: string | null; whatsapp?: string | null; noReply?: boolean }) {
  let grade = '', summary = '', next = '', replySubject = '', reply = '';
  try {
    const fleet = await loadFleet(db, env);
    // 知识库里的「AI 写信规则」原样带上:业务经理改那一篇,下一封首回就按新规则写(2026-09-16 销售知识库)
    const rules = await db.prepare(`SELECT body FROM playbooks WHERE slug='rules-for-ai'`).first<{ body: string }>().catch(() => null);
    const sys = rules?.body ? `${PROMPT}

【写信规则(必须遵守)】
${rules.body.slice(0, 4000)}` : PROMPT;
    const r = await chat(env, [{ role: 'system', content: sys }, { role: 'user', content: maskPii(`姓名:${row.name}\n公司:${row.company ?? ''}\n邮箱:${row.email}\n国家:${row.country ?? ''}\n品类:${row.category ?? ''}\n量级:${row.volume ?? ''}\n来源页:${row.source_path ?? ''}\n正文:${row.message.slice(0, 2000)}`, row) }], { fleet, json: true, maxTokens: 1000, timeoutMs: 30000 });
    const raw = String(r.text ?? '').split('{{NAME}}').join(row.name ?? ''); const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    grade = ['A', 'B', 'C', 'spam'].includes(j.grade) ? j.grade : 'B'; summary = String(j.summary ?? '').slice(0, 300); next = String(j.next ?? '').slice(0, 300);
    if (grade === 'A' || grade === 'B') { replySubject = String(j.reply_subject ?? '').slice(0, 160); reply = String(j.reply ?? '').slice(0, 2000); }
    await db.prepare('UPDATE inquiries SET ai_grade = ?, ai_summary = ?, ai_reply = ? WHERE id = ?').bind(grade, `${summary}${next ? ' ‖ 下一步:' + next : ''}`, reply ? `${replySubject}\n\n${reply}` : null, id).run();
  } catch { /* 分级失败不影响通知 */ }

  /* 09-24 W7(AI 获客定稿 WP-02):A/B 级首回只存草稿(ai_reply),不再自动发给询盘人 —— 业务员在后台看过后用自己的邮箱「用邮件发」。
     通知先于群机器人:发 NOTIFY_MAIL(没配发 MAIL_DIGEST_TO,都没配发本站 sales@ —— 进后台邮件中心并按 MAIL_FORWARD_TO 转业务员),分级失败也发,附原文前 500 字。这是内部事务信。 */
  const text = `【官网询盘 #${id}${grade ? ' · ' + grade : ''}】${row.company ?? ''} ${row.name}(${row.country ?? '-'})\n${summary || row.message.slice(0, 140)}\n${next ? '下一步:' + next + '\n' : ''}邮箱:${row.email}${row.whatsapp ? '\nWhatsApp:' + row.whatsapp : ''}${reply ? '\n首回:草稿在后台,人审后用邮件发' : ''}\n后台:https://biosphere-ai.com/bohui/inquiries`;
  const notifyTo = (String(env.NOTIFY_MAIL ?? '').trim() || String(env.MAIL_DIGEST_TO ?? '').trim() || 'sales@biosphere-ai.com').split(',').map((s) => s.trim()).filter(Boolean);
  if (notifyTo.length && canSend(env)) {
    const r = await sendMail(env, { to: notifyTo, subject: `[官网] 询盘 #${id}${grade ? ' · ' + grade : ''} ${row.company ?? row.name}${row.country ? ' · ' + row.country : ''}`, text: `${text}\n\n正文(前 500 字):\n${row.message.slice(0, 500)}`, replyTo: row.email }).catch(() => ({ ok: false }));
    if (r.ok) await db.prepare("UPDATE inquiries SET notified_at = datetime('now') WHERE id = ?").bind(id).run().catch(() => {});
  }
  /* Jev 影子(09-22 接入,已停):只有 JEV_SHADOW='1' 才跑,且排在所有通知之后,不拖通知、不进通知正文 */
  if (env.JEV_SHADOW === '1') {
    try {
      const jr = await judge(env, maskPii(`国家:${row.country ?? ''}\n公司:${row.company ?? ''}\n正文:${row.message}`, row), INQUIRY_QUESTIONS);
      if (jr) await db.prepare('UPDATE inquiries SET jev_json = ? WHERE id = ?').bind(JSON.stringify({ answers: jr.answers, ms: jr.ms }).slice(0, 4000), id).run().catch(() => {});
    } catch { /* 影子跑,不影响主流程 */ }
  }

  const hook = String(env.NOTIFY_WEBHOOK ?? '').trim();
  if (!hook) return;
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

  /* 2026-10-09 获客自动化:A/B 级询盘自动创建 CRM 商机(company + contact + deal + activity)。
     与 /api/admin/crm op=convert 同一套去重逻辑:先按官网/公司名找已有 company,有就挂上,没有才建。
     deal 也按 company + deal.name 去重,不建重复商机。 */
  if (grade === 'A' || grade === 'B') {
    try {
      const coName = (row.company || row.name || '').trim().slice(0, 200);
      const dealName = `${row.category || '询盘需求'}${row.volume ? ' · ' + row.volume : ''}`.slice(0, 200);
      const host = (s: string) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      /* 去重:按公司名(不区分大小写) */
      let co = await db.prepare(`SELECT id FROM companies WHERE lower(name) = lower(`).bind(coName).first<{ id: number }>().catch(() => null);
      let companyId: number;
      if (co) {
        companyId = co.id;
      } else {
        const ins = await db.prepare(
          `INSERT INTO companies (name, country, channel, type, note, source, source_id) VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
        ).bind(coName, row.country || null, '官网表单', '品牌方',
          `询盘 #${id}(${row.lang})${summary ? ' · ' + summary : ''}`.slice(0, 500),
          'inquiry', id).first<{ id: number }>();
        companyId = ins!.id;
      }
      /* 联系人(按邮箱去重) */
      if (row.email) {
        const existing = await db.prepare(`SELECT id FROM contacts WHERE company_id = ? AND email = ?`).bind(companyId, row.email).first().catch(() => null);
        if (!existing) await db.prepare(
          `INSERT INTO contacts (company_id, name, email, lang, whatsapp) VALUES (?,?,?,?,?)`,
        ).bind(companyId, (row.name || '').slice(0, 120), row.email.slice(0, 200), row.lang, row.whatsapp || null).run();
      }
      /* 商机(按 company + deal name 去重) */
      const existingDeal = await db.prepare(`SELECT id FROM deals WHERE company_id = ? AND lower(name) = lower(?)`).bind(companyId, dealName).first().catch(() => null);
      if (!existingDeal) {
        const dealIns = await db.prepare(
          `INSERT INTO deals (company_id, name, stage, prob, currency) VALUES (?,?,'discover',10,'USD') RETURNING id`,
        ).bind(companyId, dealName).first<{ id: number }>();
        if (dealIns) {
          /* 第一条活动:系统记录询盘来源 */
          await db.prepare(
            `INSERT INTO activities (company_id, deal_id, kind, text, trig) VALUES (?,?,?,?,?)`,
          ).bind(companyId, dealIns.id, 'system',
            `询盘 #${id} 自动入库 · AI 分级:${grade}${summary ? ' · ' + summary : ''}`.slice(0, 4000),
            'ai-auto').run();
        }
      }
      /* 标记询盘已自动转 CRM */
      await db.prepare('UPDATE inquiries SET crm_company_id = ? WHERE id = ?').bind(companyId, id).run().catch(() => {});
    } catch { /* CRM 自动创建失败不影响已入库的询盘 */ }
  }
}
