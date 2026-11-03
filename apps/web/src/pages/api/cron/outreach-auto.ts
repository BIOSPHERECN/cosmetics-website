import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { chat, loadFleet, paidFirst } from '../../../lib/fleet';
import { reviewOutreach } from '../../../lib/outreach-review';
import { notifyHook } from '../../../lib/mail';
import { uploadJSON, mkdir, listDir } from '../../../lib/pan123-client';

export const prerender = false;

/**
 * 开发信自动生成 + 多AI审核 + 审批 cron。
 *
 * 流程：取 prospects(ICP≥60, status='new', 有邮箱) → AI 写草稿 → outreach-review 多模型审核
 *       → 分数≥85 自动 approved → 写 outreach_log → 群通知「N 封待发」→ 人点 mailto 一键发。
 *
 * 不自动发：Cloudflare 发信条款禁冷邮件，冷信不经 Worker 发（admin/outreach.ts 注释明令）。
 * 最后一发走 handoff：人从自己邮箱发出，Worker 只准备 mailto 包 + 群通知。
 *
 * cron: 0 6 * * *（每日 06:00 UTC = 北京 14:00）
 */

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function guard(request: Request): Response | null {
  const key = (env as any).CRON_KEY as string | undefined;
  if (!key || request.headers.get('x-cron-key') !== key) return json({ ok: false }, 403);
  return null;
}

const ADDR = "广州市白云区太和镇龙兴东路15号";
const signOff = (site: string) => `BIOSPHERE · cosmetics OEM/ODM manufacturer · sales@biosphere-ai.com\n${ADDR}\n\nBusiness solicitation. We found this address on ${site || 'your website'}. Privacy: https://biosphere-ai.com/en/privacy/\nNot relevant? Reply "unsubscribe" and we won't write again.`;

const PROMPT = `You are a cosmetics OEM/ODM factory sales assistant writing a cold outreach email. Write ONLY the email body (no subject), in English, ≤95 words.
Rules:
- Open with a specific fact about the prospect's brand/product (not a generic greeting)
- One clear call-to-action (reply with one sentence, or view a page)
- No MOQ, price, lead time numbers (only "5-14 days" for sample turnaround is allowed)
- No "professional", "high-quality", "one-stop", "synergy", "hope this finds you"
- End with BIOSPHERE sign-off (will be appended separately)
- Natural tone, not robotic
- Don't invent any numbers or claims about the prospect`;

export const GET: APIRoute = async ({ request }) => {
  const denied = guard(request); if (denied) return denied;
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, msg: 'no db' }, 500);

  /* 网关优先:paidFirst 把 agnes 排最前(长期 402/429),chat 试满 4 家就放弃 → generated 永远 0。
     与 cron-tasks.ts 的 runOutreachAuto 同一条修复(2026-10-28)。 */
  const fleet0 = paidFirst(await loadFleet(db, env));
  const fleet = [...(fleet0 as any[]).filter((p) => p.id === 'bohui-gateway' && p.keys?.length),
    ...(fleet0 as any[]).filter((p) => p.id !== 'bohui-gateway' && p.keys?.length)];
  if (!fleet.length) return json({ ok: false, msg: 'no fleet' }, 500);

  // 1. 取候选客户：ICP≥60, status='new', 有邮箱, 不在抑制名单
  const { results: prospects } = await db.prepare(
    `SELECT p.id, p.brand, p.website, p.country, p.market, p.icp_score, p.positioning, p.categories, p.contact_channels, p.hook
     FROM prospects p
     WHERE p.icp_score >= 60 AND p.status = 'new'
       AND p.id NOT IN (SELECT prospect_id FROM outreach_log WHERE status IN ('draft','approved','sent','unknown'))
       AND NOT EXISTS (SELECT 1 FROM prospect_contacts pc WHERE pc.prospect_id = p.id AND pc.email IN (SELECT email FROM outreach_suppress))
       /* 必须有可发邮箱:contact_channels 里含 @,或在 prospect_contacts 表里有 email。
          原来按分数取前 5,但前 5 多数无邮箱 → 全 skipped、generated=0(2026-10-28 实测)。 */
       AND (p.contact_channels LIKE '%@%' OR EXISTS (SELECT 1 FROM prospect_contacts pc WHERE pc.prospect_id = p.id AND pc.email IS NOT NULL AND pc.email != ''))
     ORDER BY p.icp_score DESC LIMIT 5`
  ).all<any>().catch(() => ({ results: [] as any[] }));

  let generated = 0, approved = 0, skipped = 0;

  // 123 云盘目录
  let panDirID = 0;
  if ((env as any).PAN123_CLIENT_ID) {
    try {
      const root = await listDir(env, 0);
      panDirID = root.find((f: any) => f.filename === 'cosmetic-data')?.fileID ?? (await mkdir(env, 'cosmetic-data', 0));
    } catch {}
  }

  for (const p of prospects) {
    try {
      // 取邮箱
      let email = '';
      let contacts: any[] = [];
      try { contacts = JSON.parse(p.contact_channels || '[]'); } catch { contacts = []; }
      if (Array.isArray(contacts)) {
        for (const ch of contacts) {
          const m = String(ch).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
          if (m && !/no-?reply/i.test(m[0])) { email = m[0].toLowerCase(); break; }
        }
      }
      if (!email) {
        // 查 prospect_contacts 表
        const c = await db.prepare('SELECT email FROM prospect_contacts WHERE prospect_id = ? AND email IS NOT NULL LIMIT 1').bind(p.id).first<any>();
        email = c?.email || '';
      }
      if (!email) { skipped++; continue; }

      // 2. AI 写草稿
      const prospectInfo = `Brand: ${p.brand}\nWebsite: ${p.website || 'N/A'}\nCountry: ${p.country || p.market}\nPositioning: ${p.positioning || 'N/A'}\nCategories: ${p.categories || 'N/A'}\nHook: ${p.hook || 'N/A'}`;
      const reply = await chat(env, [
        { role: 'system', content: PROMPT },
        { role: 'user', content: prospectInfo },
      ], { fleet, maxTokens: 300, timeoutMs: 20000 }).catch(() => ({ text: '' }));

      const draftBody = String(reply.text || '').trim();
      if (draftBody.length < 20) { skipped++; continue; }

      const fullBody = `${draftBody}\n\n${signOff(p.website || '')}`;
      const subject = `Quick question about ${p.brand}'s product strategy`;

      // 3. 多AI审核
      const review = await reviewOutreach(env, db, fullBody, {
        brand: p.brand, website: p.website, country: p.country, market: p.market,
        positioning: p.positioning, hook: p.hook, categories: p.categories,
      }, undefined).catch(() => ({ finalBody: fullBody, scores: [], consensus: '' }));

      const topScore = review.scores?.length ? Math.max(...review.scores.map(s => s.score)) : 0;
      const finalBody = review.finalBody || fullBody;
      const status = topScore >= 85 ? 'approved' : 'draft';

      if (status === 'approved') approved++;
      generated++;

      // 4. 写 outreach_log
      await db.prepare(
        `INSERT INTO outreach_log (prospect_id, contact_email, step, subject, body_text, status, created_at)
         VALUES (?, ?, 1, ?, ?, ?, datetime('now'))`,
      ).bind(p.id, email, subject.slice(0, 160), finalBody.slice(0, 4000), status).run().catch(() => {});

      // 更新 prospects 状态
      await db.prepare(`UPDATE prospects SET status = 'outreached' WHERE id = ?`).bind(p.id).run().catch(() => {});

      // 5. 存 123 云盘
      if (panDirID && (env as any).PAN123_CLIENT_ID) {
        const fileName = `outreach-${new Date().toISOString().slice(0,10)}-${p.brand.replace(/\s/g,'')}.json`;
        const fullData = JSON.stringify({
          prospect_id: p.id, brand: p.brand, email, subject,
          draft: draftBody, final_body: finalBody, scores: review.scores,
          top_score: topScore, status, created_at: new Date().toISOString(),
        });
        try { await uploadJSON(env, panDirID, fileName, fullData); } catch {}
      }
    } catch { skipped++; }
  }

  // 6. 群通知
  if (generated > 0) {
    const text = `【开发信自动生成】${generated} 封草稿就绪（${approved} 射分数≥85 已自动审批，${generated - approved} 封待人工审）\n后台：https://biosphere-ai.com/bohui/prospects/?tab=outreach`;
    await notifyHook(env, text).catch(() => {});
  }

  // 心跳
  await db.prepare(
    `INSERT INTO jobs (name, note, status, heartbeat_at, started_at) VALUES ('outreach-auto', ?, 'ok', datetime('now'), datetime('now'))`,
  ).bind(`generated=${generated} approved=${approved} skipped=${skipped}`).run().catch(() => {});

  return json({ ok: true, generated, approved, skipped, total_prospects: prospects.length });
};
