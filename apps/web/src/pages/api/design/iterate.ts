/**
 * 设计工作台的核心接口:建项目 / 出下一版。
 *
 * 创始人 2026-09-06:「他生成的图片,可以自己接着修改,然后接着生成,那么就会形成一种依赖」。
 * 这个接口就是那个「接着」。
 *
 * 迭代是怎么做到的:出图模型(agnes-image)是纯文生图,没有 img2img。
 * 所以「在上一版基础上改」这件事落在**提示词**上 ——
 * 把上一版的完整 prompt 和客户这次的一句话交给文本模型,让它改写而不是重写。
 * 关键在于「改写」两个字:重写会把上一版好不容易调对的材质、光线、构图全丢掉,
 * 客户会觉得每点一次都是个陌生的东西,依赖就无从谈起。
 *
 * 出图本身是异步的:Workers 免费版单次调用只有 10ms CPU,出图要几十秒,
 * 所以这里只把任务塞进 pack_jobs 队列,由 GitHub Actions 上的 runner 取走跑。
 * 前端轮询 /api/design/status。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { loadFleet, chat, paidFirst } from '../../../lib/fleet';
import { tooMany, clientId, recordUse, overQuota, sweep } from '../../../lib/ratelimit';
import { aiGate, getMember } from '../../../lib/member';

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/** 链接即钥匙,所以这一段要够长、够随机 —— 22 位 base36 约等于 113 位熵 */
const newToken = () => {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 22);
};

const FIXED_TAIL = 'photorealistic product packaging render, studio lighting, sharp focus, '
  + 'clean neutral background, no watermark, no text artifacts';

export const POST: APIRoute = async ({ request }) => {
  const db = (env as any).DB as D1Database | undefined;
  if (!db) return json({ ok: false, error: 'no-db' }, 503);

  const cid = clientId(request);
  /* 每一次迭代都要打一次文本模型 + 排一张图。放开了会被人当免费出图站刷,
     所以按客户端限流;项目本身不限,限的是出图频次。 */
  /* 09-24(代码审计 P2-3):原来两行参数都传错('design' 不在 QUOTA 表里、tooMany 不收这些参数),每次调用都抛 TypeError,
     接口实际一直是坏的。修功能不拆限流:按 QUOTA['ai.design'](每小时 12 次)限客户端,再过会员与每日额度(C10)。 */
  if (await overQuota(db, 'ai.design', cid)) return tooMany('ai.design');
  const denied = await aiGate(request, env, db, 'ai.design');
  if (denied) return denied;

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400); }

  const lang = String(body.lang ?? 'zh-cn').slice(0, 8);
  const note = String(body.note ?? '').trim().slice(0, 400);
  const token = String(body.token ?? '').trim().slice(0, 32);

  let project: any = null;
  let prevPrompt = '';
  let prevN = 0;

  if (token) {
    project = await db.prepare(
      `SELECT id, token, title, lang, brief, pack_code, formula_code FROM design_projects
        WHERE token = ? AND status <> 'archived'`).bind(token).first<any>().catch(() => null);
    if (!project) return json({ ok: false, error: 'not-found' }, 404);
    const last = await db.prepare(
      `SELECT n, prompt FROM design_versions WHERE project_id = ? ORDER BY n DESC LIMIT 1`)
      .bind(project.id).first<any>().catch(() => null);
    prevPrompt = last?.prompt ?? '';
    prevN = last?.n ?? 0;
    if (!note) return json({ ok: false, error: 'need-note' }, 400);
  } else {
    /* 新项目 */
    const brief = String(body.brief ?? '').trim().slice(0, 600);
    if (brief.length < 4) return json({ ok: false, error: 'need-brief' }, 400);
    const packCode = String(body.pack ?? '').toUpperCase().slice(0, 24) || null;
    const formulaCode = String(body.formula ?? '').toUpperCase().slice(0, 24) || null;
    const tk = newToken();
    const ins = await db.prepare(
      `INSERT INTO design_projects (token, title, lang, brief, pack_code, formula_code)
       VALUES (?,?,?,?,?,?) RETURNING id`)
      .bind(tk, brief.slice(0, 60), lang, brief, packCode, formulaCode)
      .first<{ id: number }>().catch(() => null);
    if (!ins) return json({ ok: false, error: 'db' }, 500);
    project = { id: ins.id, token: tk, brief, pack_code: packCode, formula_code: formulaCode, lang };
  }

  /* 把包材与配方的真实规格喂进去,免得模型把瓶型画成另一支 ——
     客户选的是我们库里那一款,画出来必须还是那一款,否则打样时对不上。 */
  let anchor = '';
  if (project.pack_code) {
    const p = await db.prepare(
      `SELECT type, material, capacity FROM packaging WHERE code = ?`)
      .bind(project.pack_code).first<any>().catch(() => null);
    if (p) anchor += `Container must be: ${p.type}, ${p.material}, ${p.capacity}. `;
  }
  if (project.formula_code) {
    const f = await db.prepare(`SELECT format, benefits FROM formulas WHERE code = ?`)
      .bind(project.formula_code).first<any>().catch(() => null);
    if (f) anchor += `Product is a ${f.format} (${f.benefits}). `;
  }

  const fleet = paidFirst(await loadFleet(db));
  const isFirst = prevN === 0;

  const out = await chat(
    env as any,
    [
      {
        role: 'system',
        content:
          'You write prompts for a text-to-image model that renders cosmetic packaging for a B2B factory. '
          + 'Return JSON only, no explanation. '
          + 'Never invent certifications, awards, claims or numbers. Never put readable brand text in the render '
          + 'unless the user explicitly asked for a specific word.',
      },
      {
        role: 'user',
        content: isFirst
          ? `Create the first render prompt.\n`
            + `${anchor}Brand direction from the client (may be Chinese): ${project.brief}\n\n`
            + `Return JSON: {"prompt":"70-110 English words. Describe the container form, material and colour first, `
            + `then the decoration (finish, foil, emboss, label), then background, lighting and overall mood. `
            + `End with: ${FIXED_TAIL}","title":"a 4-10 character Chinese label for this design direction"}`
          : `Revise an existing render prompt. Keep everything the client did NOT ask to change — `
            + `same container, same composition, same lighting, same mood — and change only what they asked for. `
            + `This continuity matters more than making it prettier.\n\n`
            + `${anchor}Previous prompt:\n${prevPrompt}\n\n`
            + `Client's change request (may be Chinese): ${note}\n\n`
            + `Return JSON: {"prompt":"the revised full prompt, 70-110 English words, ending with: ${FIXED_TAIL}",`
            + `"title":"a 4-10 character Chinese label describing what changed"}`,
      },
    ],
    { json: true, maxTokens: 900, fleet, timeoutMs: 90000 },
  ).catch(() => null);

  let prompt = '', title = '';
  try {
    const m = (out?.text ?? '').match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      prompt = String(j.prompt ?? '').trim();
      title = String(j.title ?? '').trim().slice(0, 24);
    }
  } catch { /* 下面有兜底 */ }

  /* 模型没给出可用提示词时不要直接失败 —— 用上一版加一句客户的话继续跑,
     宁可这一版效果一般,也不要让客户点了没反应。 */
  if (prompt.length < 40) {
    prompt = isFirst
      ? `${anchor}${project.brief}. ${FIXED_TAIL}`
      : `${prevPrompt}\nAdjustment: ${note}`;
  }

  const n = prevN + 1;
  const ver = await db.prepare(
    `INSERT INTO design_versions (project_id, n, parent_n, change_note, prompt, status)
     VALUES (?,?,?,?,?, 'queued') RETURNING id`)
    .bind(project.id, n, isFirst ? null : prevN, note, prompt)
    .first<{ id: number }>().catch(() => null);
  if (!ver) return json({ ok: false, error: 'db' }, 500);

  /* 09-24 P1-2:出图单记下会员(0127 的列;没迁移时退回老写法) */
  const mid = (await getMember(request, env, db))?.id ?? null;
  const job = await db.prepare(
    `INSERT INTO pack_jobs (lang, fact_line, brief, prompt, version_id, member_id) VALUES (?,?,?,?,?,?) RETURNING id`)
    .bind(lang, `design#${project.token} v${n}`, note || project.brief, prompt, ver.id, mid)
    .first<{ id: number }>()
    .catch(() => db.prepare(`INSERT INTO pack_jobs (lang, fact_line, brief, prompt, version_id) VALUES (?,?,?,?,?) RETURNING id`)
      .bind(lang, `design#${project.token} v${n}`, note || project.brief, prompt, ver.id).first<{ id: number }>().catch(() => null));

  await db.batch([
    db.prepare(`UPDATE design_versions SET job_id = ? WHERE id = ?`).bind(job?.id ?? null, ver.id),
    db.prepare(`UPDATE design_projects SET updated_at = datetime('now')${title && isFirst ? ', title = ?' : ''} WHERE id = ?`)
      .bind(...(title && isFirst ? [title, project.id] : [project.id])),
  ]).catch(() => null);

  await recordUse(db, 'ai.design', cid).catch(() => null);
  await sweep(db).catch(() => null);

  return json({ ok: true, token: project.token, version: n, versionId: ver.id, title });
};
