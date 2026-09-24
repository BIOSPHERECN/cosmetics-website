/**
 * 后台鉴权闸门 —— 每个后台页与后台接口的第一行。
 *
 * 单独抽出来是因为之前每页各写一遍 readSession,一旦漏写就是一个敞开的后门。
 * 权限判断只有一处,才谈得上"可审计"。
 */
import { env } from 'cloudflare:workers';
import { readSession, readCookie, COOKIE, type Session } from './auth';
import { resolveTenant, type Tenant } from './tenant';

export type Ctx = { db: D1Database; sess: Session & { site_id?: string | null; lab_role?: string | null }; tenant: Tenant };

/** 页面用:未登录返回 null,调用方 redirect 到登录页 */
export async function pageGuard(req: Request): Promise<Ctx | null> {
  const db = (env as any).DB as D1Database | undefined;
  const secret = (env as any).AUTH_SECRET as string | undefined;
  const sess = await readSession(readCookie(req.headers.get('cookie'), COOKIE), secret ?? '');
  if (!sess || !db) return null;

  // 账号的站点归属存在库里,不在会话里 —— 会话是签发时的快照,
  // 归属改了不该等下次登录才生效,尤其是「收回权限」这种事。
  // 实验室角色(lab_role)同理:配方比例的可见性是「收回权限」里最敏感的一档,同一句 SELECT 顺便读,不进会话。
  // 0079 还没灌(lab_role 列不存在)时整句会报 no such column,不能连 site_id 一起丢 ——
  // site_id 落 null 会让 resolveTenant 把所有绑定了站点的账号当集团管理员,整个后台串站;所以退回老查询只丢 lab_role。
  const row = await db.prepare(`SELECT site_id, lab_role FROM users WHERE id = ?`).bind(sess.uid)
    .first<{ site_id: string | null; lab_role: string | null }>()
    .catch(() => db.prepare(`SELECT site_id FROM users WHERE id = ?`).bind(sess.uid)
      .first<{ site_id: string | null; lab_role?: string | null }>().catch(() => null));
  const full = { ...sess, site_id: row?.site_id ?? null, lab_role: row?.lab_role ?? null };
  const tenant = await resolveTenant(db, full, new URL(req.url));
  return { db, sess: full, tenant };
}

/** 接口用:未登录直接抛 401 JSON,不给任何数据 */
export async function apiGuard(req: Request): Promise<Ctx | Response> {
  const c = await pageGuard(req);
  if (!c) return json({ ok: false, msg: '未登录或会话已过期' }, 401);
  const cap = capOf(new URL(req.url).pathname);
  if (cap && !roleAllows(String(c.sess.role ?? ''), cap, req.method)) {
    return json({ ok: false, msg: `当前角色(${c.sess.role})没有「${cap}」的操作权限` }, 403);
  }
  return c;
}


/* ── 角色与权限 ────────────────────────────────────────────────────
   2026-09-10 创始人问「后台用户的权限管理有设置吗」。
   当时的实情是:`role` 字段有,`requireAdmin` 只挂在 3 个接口上
   (user / provider / fleet-health),其余 25 个接口任何登录用户都能调 ——
   也就是「编辑」和「管理员」在内容、密钥之外的地方权限完全一样,角色形同虚设。

   补法是把闸门放在**唯一入口** `apiGuard` 里,按 `/api/admin/<名字>` 查表。
   放在各文件里逐个加 requireXxx 的下场是漏一个就是一个后门 —— 这类漏,
   通常要等出事才发现。

   四个角色,按这家工厂真实的分工设:
     admin  全部,含账号、模型密钥、站点设置
     editor 内容运营:页面、版块、产品、资讯、媒体、配方、包材、翻译
     sales  只做询盘:看、改状态、导出;碰不到内容与设置
     viewer 只读:任何写操作一律 403(GET 放行)
     lab    实验室(2026-09-17 配方实验室 v0):只进 formula-lab 一个接口,其余一律 403。
            不用 editor 兼任 —— editor 对所有非 ADMIN_ONLY 的 cap 默认全开,等于给每个打版员整站 CMS 写权限。
            实验室内部再按 users.lab_role 五档细分(总工/配方师/打版员/业务/老板),见 LAB_ROLES */
export type Role = 'admin' | 'editor' | 'sales' | 'viewer' | 'lab';
export const ROLES: Role[] = ['admin', 'editor', 'sales', 'viewer', 'lab'];

/* 2026-09-16 创始人问「够安全吗」:整表导出(询盘 CSV / 名单 CSV / CRM JSON)只给 admin —— 业务员离职带走整份客户名单是最常见的泄露,
   页面里一家一家看可以,一键导全部不行。业务员要导,让管理员导给他。 */
const ADMIN_ONLY = ['user', 'provider', 'fleet-health', 'gateway', 'setup',
                    'invite', 'site-contact', 'site-variant', 'vision-bench', 'inquiry-export', 'crm-export',
                    'member'];   // 09-23 网站会员改档位(free / pro)是商务决定,只给 admin
const SALES_OK = ['inquiry', 'inquiry-summarize', 'prospect', 'crm', 'playbook', 'sandbox', 'matters', 'mail', 'customs', 'outreach', 'b2o-brief', 'b2o-profile', 'b2o-pool'];   // 2026-09-16:业务员要能记外联状态、用 AI 总结;09-18 推演沙盘(任务 S)业务部也开;09-18 业务协同工作台(matters)业务部可写;09-18 邮件中心(mail)业务部收发;09-18 开发信发送(outreach)业务部发;09-24 机会简报草稿(b2o-brief)业务部出稿;09-24 C2 客户档案(b2o-profile)业务部记沟通、改档案;09-24 C3 机会卡池(b2o-pool)业务部填到期复盘
/** 自己的两步验证任何人都要能设 —— 否则新账号永远开不了 TOTP */
const SELF_OK = ['totp'];

export function capOf(pathname: string): string {
  const m = /\/api\/admin\/([a-z0-9-]+)/i.exec(pathname);
  return m ? m[1].toLowerCase() : '';
}

export function roleAllows(role: string, cap: string, method: string): boolean {
  if (role === 'admin') return true;
  if (SELF_OK.includes(cap)) return true;
  if (role === 'viewer') return method === 'GET' || method === 'HEAD';
  if (role === 'lab') return cap === 'formula-lab' || cap === 'prompts' || cap === 'sandbox' || cap === 'b2o-pool';   // 09-24 C3 研发负责人在机会卡池签能力闸门(接口内再核 lab_role=chief);实验室账号:配方实验室 + 效果图提示词(09-18 开发部也要出效果图)+ 推演沙盘(09-18 任务 S),其余 403
  if (ADMIN_ONLY.includes(cap)) return false;
  if (role === 'sales') return SALES_OK.includes(cap);
  if (role === 'editor') return !ADMIN_ONLY.includes(cap);
  return false;
}

/** 只有 admin 能做的事(改账号、删数据) */
export function requireAdmin(c: Ctx): Response | null {
  return c.sess.role === 'admin' ? null : json({ ok: false, msg: '需要管理员权限' }, 403);
}

/* 实验室角色(users.lab_role)。NULL = 非实验室成员。
   与系统角色是两列:admin 且 lab_role 为空 = 「管理员不默认看配方」(创始人已定 3)。
   users.astro 有一张同名中文映射 LAB_ROLE —— 改一边必须改另一边。
   purchasing(采购)/ finance(财务):2026-09-18 12:5x 创始人「价格由财务和采购确认,我们不可以瞎编」—— 只进原料库改价 / 确认价,不进配方(canRecipe / canWrite 都不含)。 */
export const LAB_ROLES = ['chief', 'formulator', 'sampler', 'sales', 'boss', 'purchasing', 'finance'] as const;
export type LabRole = typeof LAB_ROLES[number];

/** 实验室角色闸:与 requireAdmin 同款,formula-lab 接口每个 op 第一行调。漏写一个 op 就是整表可写。 */
export function requireLab(c: Ctx, ...roles: string[]): Response | null {
  return roles.includes(c.sess.lab_role ?? '') ? null
    : json({ ok: false, msg: `需要实验室角色:${roles.join(' / ')};请管理员在「账号与权限」页设置` }, 403);
}

/** 产品的成本与配方比例(product_internal):研发(总工/配方师)、财务、老板。创始人 09-18「只有技术研发部和财务,老板看到」 */
export const canProductInternal = (r?: string | null): boolean => ['chief', 'formulator', 'finance', 'boss'].includes(r ?? '');

export function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 写修订记录 —— 谁在什么时候把什么改成了什么。没有这个就没有"可回溯" */
export async function logRevision(
  db: D1Database, entity: string, entityId: string | number,
  lang: string | null, before: unknown, after: unknown, userId: number,
) {
  await db.prepare(
    `INSERT INTO revisions (entity, entity_id, lang, before_json, after_json, user_id) VALUES (?,?,?,?,?,?)`
  ).bind(entity, String(entityId), lang, before == null ? null : JSON.stringify(before), JSON.stringify(after), userId).run();
}
