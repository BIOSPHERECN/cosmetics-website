/**
 * 产品的增删改。
 *
 * 与配方库刻意分表:配方库是内部技术资产(配方细节不对外),
 * 产品是对外可展示的成品形态。混在一张表里,迟早有人把配方发到前台。
 *
 * 三条纪律:
 *  ① 只写中文源,不在这里造译文 —— 译文由翻译中心统一产出,
 *     否则同一个产品会出现"后台手写的英文"和"机器翻的英文"两份,谁也不知道该信哪个。
 *  ② 改了中文就把该产品的**其余语种标记为过期**,而不是留着旧译文。
 *     旧译文比没有译文更危险:它看起来是好的,内容却对不上。
 *  ③ 每次写入前抄一份旧值进 revisions。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { apiGuard, json, logRevision, canProductInternal } from '../../../lib/guard';
import { chat, vision, loadFleet } from '../../../lib/fleet';
import { blockPublishTransition } from '../../../lib/listing-cite';

export const prerender = false;

/** 确认这个产品属于当前账号能管的站 —— 光有 id 不够,地址栏能改 */
async function own(db: D1Database, id: number, siteId: string) {
  return db.prepare(`SELECT * FROM products WHERE id = ? AND site_id = ?`).bind(id, siteId).first<any>();
}

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;
  const site = c.tenant.siteId;

  /* 产品保存自动补 SEO 摘要(创始人 2026-09-01:「以后自己上传产品,
     要自动设定 GEO 和 SEO,而不是每次麻烦你」)。
     摘要就是产品页的 meta description 和 Product JSON-LD 的 description ——
     运营留空时按站内既定口径生成一条 70–160 字的合格描述;写了就尊重人工。
     刻意用模板不用 AI:数字纪律要求描述里只出现站内已发布口径,模板不会现编。 */
  const CAT_ZH: Record<string, string> = {
    skincare: '护肤', color: '彩妆', makeup: '彩妆', bodycare: '身体洗护', body: '身体洗护',
    oralcare: '口腔护理', oral: '口腔护理', haircare: '洗护', wash: '洗护', kids: '儿童护肤',
    hair: '洗护', cleansing: '清洁', fragrance: '香氛',
  };
  const autoSummary = (name: string, category: string, moq: string | null) => {
    const cat = CAT_ZH[category] ?? '美妆';
    /* 2026-09-26: sampling wording set by the owner via the coordinator: marketing copy says「通常 3–7 天出样」(never a promise);
       the terms page keeps SAMPLE_DAYS. No MOQ claim is invented when the product has no MOQ on file. */
    const moqPart = moq ? `,起订 ${moq}` : '';
    return `${name}:帛卉化妆品(BIOSPHERE)${cat}线源厂 OEM/ODM 定制${moqPart},通常 3–7 天出样,GMPC / ISO 22716 认证工厂直供,支持配方按品牌定位改良。`;
  };

  let b: any;
  try { b = await request.json(); } catch { return json({ ok: false, msg: '请求格式不对' }, 400); }

  /* ── AI 帮我填(A9 · 09-23)──────────────────────────────
     创始人:「产品上传也非常的轻松容易操作」。人只给名称 + 品类 + 一张图,模型写卖点 / 描述 / SEO。
     只用舰队里的国产免费档(Agnes / 商汤,舰队白名单铁令);结果只回填到表单,人看过点保存才入库。
     提示词把商务条款、功效数字、认证编号全部禁掉 —— 这些只能来自「工厂口径」页与真实检测报告。 */
  if (b.action === 'ai-fill') {
    const name = String(b.name ?? '').trim().slice(0, 60);
    if (!name) return json({ ok: false, msg: '先填产品名称' }, 400);
    const cat = CAT_ZH[String(b.category ?? '')] ?? '美妆';
    const all = await loadFleet(c.db, env as any);
    const fleet = all.filter((p) => p.free && /^(agnes|sensenova)/.test(p.id));
    if (!fleet.length) return json({ ok: false, msg: '没有可用的国产免费模型,请管理员在「模型」页检查' }, 503);
    let look = '';
    const img = String(b.image ?? '');
    if (img.startsWith('data:image/') && img.length < 400_000) {
      try {
        const v = await vision(env as any, img, '用 60 字以内描述这张化妆品图片:包装形态(瓶/管/罐/泵头等)、颜色、质地线索。只写看得见的,不猜品牌。',
          { fleet, maxTokens: 200, promptKey: 'product-ai-look' });
        look = String(v.text ?? '').trim().slice(0, 200);
      } catch { /* 看图失败就只凭名称写,不拦 */ }
    }
    const sys = `你是化妆品 OEM/ODM 工厂的产品文案编辑,给工厂官网的产品页写中文文案。只输出一个 JSON 对象,不要围栏,字段:
{"seo_title":"≤30字,含产品名与品类关键词","summary":"70-140字,一句话讲清这款产品是什么、给谁、核心方向,可作搜索摘要","description":"150-300字,定位、目标人群、适合的市场与渠道","points":[{"title":"≤12字","body":"≤60字"}]}
points 给 3 条卖点。硬规则:不写价格、起订量、交期、打样天数、认证编号;不写功效百分比、临床数据、SPF 数值;不用「治疗、药用、根治、100%」;不提任何品牌名或公司名;看不出的成分不要编。`;
    const user = `产品名称:${name}\n品类:${cat}${look ? `\n图片所见:${look}` : ''}`;
    try {
      const r = await chat(env as any, [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { fleet, maxTokens: 1200, temperature: 0.5, timeoutMs: 40000, promptKey: 'product-ai-fill' });
      const raw = String(r.text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      const m = raw.match(/\{[\s\S]*\}/);
      const o = m ? JSON.parse(m[0]) : null;
      if (!o) return json({ ok: false, msg: '模型这次没给出可用结果,再点一次试试' }, 502);
      const points = (Array.isArray(o.points) ? o.points : []).slice(0, 5)
        .map((x: any) => ({ title: String(x?.title ?? '').slice(0, 24), body: String(x?.body ?? '').slice(0, 120) }))
        .filter((x: any) => x.title || x.body);
      return json({ ok: true, seoTitle: String(o.seo_title ?? '').slice(0, 60), summary: String(o.summary ?? '').slice(0, 200),
        description: String(o.description ?? '').slice(0, 800), points, by: r.model });
    } catch (e: any) {
      return json({ ok: false, msg: `AI 暂时没响应:${String(e?.message ?? e).slice(0, 100)}` }, 502);
    }
  }

  /* ── 新建 ─────────────────────────────────────────── */
  if (b.action === 'create') {
    const name = String(b.name ?? '').trim();
    if (!name) return json({ ok: false, msg: '请填产品名' }, 400);
    // slug 用来做前台地址,必须是 URL 安全的;中文名自动转拼音代价太大,
    // 所以没填时用时间戳兜底,让运营回头再改成有意义的
    const slug = String(b.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
      || `p-${Date.now().toString(36)}`;
    const dup = await c.db.prepare(`SELECT id FROM products WHERE site_id=? AND slug=?`).bind(site, slug).first();
    if (dup) return json({ ok: false, msg: `标识 ${slug} 已被占用` }, 400);

    const r = await c.db.prepare(
      `INSERT INTO products (site_id, slug, category, moq, sort_order, status) VALUES (?,?,?,?,?,?)`,
    ).bind(site, slug, String(b.category ?? 'skincare'), String(b.moq ?? '').trim() || null,
           Number(b.sortOrder) || 0, 'draft').run();
    const id = Number(r.meta.last_row_id);

    await c.db.prepare(
      `INSERT INTO product_i18n (product_id, lang, name, summary, description) VALUES (?, 'zh-cn', ?, ?, ?)`,
    ).bind(id, name,
           String(b.summary ?? '').trim() || autoSummary(name, String(b.category ?? 'skincare'), String(b.moq ?? '').trim() || null),
           String(b.description ?? '').trim() || null).run();

    await logRevision(c.db, 'products', id, null, null, { action: 'create', slug, name }, c.sess.uid);
    return json({ ok: true, id, slug });
  }

  const id = Number(b.id);
  if (!id) return json({ ok: false, msg: '缺少 id' }, 400);
  const cur = await own(c.db, id, site);
  if (!cur) return json({ ok: false, msg: '找不到这个产品,或它不属于当前站点' }, 404);

  /* ── 保存(基本信息 + 中文文案)──────────────────────── */
  if (b.action === 'save') {
    /* 闸在写库之前。草稿改成 published 时，用这次要写入的中文描述；
       已经 published 的空壳允许继续保存，不在这里下架。 */
    const nextStatus = b.status === 'published' ? 'published' : 'draft';
    const nameForGate = String(b.name ?? '').trim();
    let descForGate: string | null;
    if (nameForGate) descForGate = String(b.description ?? '').trim() || null;
    else {
      const held = await c.db.prepare(
        `SELECT description FROM product_i18n WHERE product_id=? AND lang='zh-cn'`,
      ).bind(id).first<{ description: string | null }>();
      descForGate = held?.description ?? null;
    }
    const block = blockPublishTransition({
      currentStatus: String(cur.status ?? ''),
      nextStatus,
      description: descForGate,
    });
    if (block) return json({ ok: false, msg: block }, 400);

    const before = await c.db.prepare(
      `SELECT p.slug, p.category, p.moq, p.status, p.sort_order, p.is_featured, p.is_showcase,
              i.name, i.summary, i.description
         FROM products p LEFT JOIN product_i18n i ON i.product_id=p.id AND i.lang='zh-cn'
        WHERE p.id = ?`,
    ).bind(id).first();

    await c.db.prepare(
      `UPDATE products SET category=?, moq=?, status=?, sort_order=?, is_featured=?, is_showcase=?, updated_at=datetime('now')
        WHERE id=? AND site_id=?`,
    ).bind(String(b.category ?? cur.category), String(b.moq ?? '').trim() || null,
           nextStatus,
           Number(b.sortOrder) || 0, b.featured ? 1 : 0, b.showcase ? 1 : 0, id, site).run();

    const name = String(b.name ?? '').trim();
    if (name) {
      await c.db.prepare(
        `INSERT INTO product_i18n (product_id, lang, name, summary, description) VALUES (?, 'zh-cn', ?, ?, ?)
         ON CONFLICT(product_id, lang) DO UPDATE SET name=excluded.name,
           summary=excluded.summary, description=excluded.description`,
      ).bind(id, name,
             String(b.summary ?? '').trim() || autoSummary(name, String(b.category ?? cur.category), String(b.moq ?? '').trim() || null),
             String(b.description ?? '').trim() || null).run();

      /* 中文改了,其余语种的译文就过期了。标 mt=2 而不是删掉:
         删了前台会立刻回落到中文,标记则让旧译文先顶着、同时在翻译中心显示"待重翻"。
         留着不标才是最糟的 —— 看起来一切正常,内容却对不上。 */
      await c.db.prepare(
        `UPDATE product_i18n SET mt = 2 WHERE product_id = ? AND lang NOT IN ('zh-cn')`,
      ).bind(id).run();

      /* 卖点与 SEO 标题存进 specs_json(前台产品页读 tech / seo_title);只在一页式编辑传了才动,
         老弹窗和脚本写的其它分节(efficacy / position / sales…)原样保留 */
      if (Array.isArray(b.points) || typeof b.seoTitle === 'string') {
        const row = await c.db.prepare(`SELECT specs_json FROM product_i18n WHERE product_id=? AND lang='zh-cn'`)
          .bind(id).first<{ specs_json: string }>();
        let sp: any = {};
        try { sp = JSON.parse(row?.specs_json || '{}') || {}; } catch { sp = {}; }
        if (Array.isArray(sp)) sp = sp.length ? { list: sp } : {};   // B2 历史导入写的是 [{label,value}] 数组,挪进 list 保留,不丢
        if (Array.isArray(b.points)) {
          sp.tech = b.points.slice(0, 8).map((x: any) => ({ title: String(x?.title ?? '').trim().slice(0, 24), body: String(x?.body ?? '').trim().slice(0, 200) }))
            .filter((x: any) => x.title || x.body);
        }
        if (typeof b.seoTitle === 'string') sp.seo_title = b.seoTitle.trim().slice(0, 60) || undefined;
        await c.db.prepare(`UPDATE product_i18n SET specs_json=? WHERE product_id=? AND lang='zh-cn'`)
          .bind(JSON.stringify(sp), id).run();
      }
    }

    await logRevision(c.db, 'products', id, 'zh-cn', before, b, c.sess.uid);
    return json({ ok: true });
  }

  /* ── 配图 ─────────────────────────────────────────── */
  if (b.action === 'images') {
    const ids = (Array.isArray(b.mediaIds) ? b.mediaIds : []).map(Number).filter(Boolean).slice(0, 12);
    await c.db.prepare(`DELETE FROM product_media WHERE product_id = ?`).bind(id).run();
    if (ids.length) {
      await c.db.batch(ids.map((m: number, i: number) =>
        c.db.prepare(`INSERT INTO product_media (product_id, media_id, sort_order) VALUES (?,?,?)`).bind(id, m, i)));
      // 第一张兼作封面 —— 前台列表只显示一张,不指定的话每次查询顺序都可能变
      await c.db.prepare(`UPDATE products SET cover_media = ? WHERE id = ?`).bind(ids[0], id).run();
    } else {
      await c.db.prepare(`UPDATE products SET cover_media = NULL WHERE id = ?`).bind(id).run();
    }
    await logRevision(c.db, 'product_media', id, null, null, { mediaIds: ids }, c.sess.uid);
    return json({ ok: true, n: ids.length });
  }

  /* ── 成本与配方比例:只给 研发 / 财务 / 老板(创始人 09-18「原料成本不可以公开」)──
     页面上对别的角色根本不渲染;这里是真正的边界,绕过页面直接 POST 也写不进、读不到 */
  if (b.action === 'internal') {
    if (!canProductInternal(c.sess.lab_role)) return json({ ok: false, msg: '成本与配方只对研发、财务、老板开放' }, 403);
    await c.db.prepare(
      `INSERT INTO product_internal (product_id, cost, formula, updated_by, updated_at) VALUES (?,?,?,?,datetime('now'))
       ON CONFLICT(product_id) DO UPDATE SET cost=excluded.cost, formula=excluded.formula, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    ).bind(id, String(b.cost ?? '').trim().slice(0, 2000) || null, String(b.formula ?? '').trim().slice(0, 4000) || null, c.sess.uid).run();
    return json({ ok: true });
  }

  /* ── 删除 ─────────────────────────────────────────── */
  if (b.action === 'delete') {
    await c.db.batch([
      c.db.prepare(`DELETE FROM product_media WHERE product_id = ?`).bind(id),
      c.db.prepare(`DELETE FROM product_i18n WHERE product_id = ?`).bind(id),
      c.db.prepare(`DELETE FROM product_internal WHERE product_id = ?`).bind(id),
      c.db.prepare(`DELETE FROM products WHERE id = ? AND site_id = ?`).bind(id, site),
    ]);
    await logRevision(c.db, 'products', id, null, cur, { action: 'delete' }, c.sess.uid);
    return json({ ok: true });
  }

  if (b.action === 'toggle') {
    const next = cur.status === 'published' ? 'draft' : 'published';
    if (next === 'published') {
      const held = await c.db.prepare(
        `SELECT description FROM product_i18n WHERE product_id=? AND lang='zh-cn'`,
      ).bind(id).first<{ description: string | null }>();
      const block = blockPublishTransition({
        currentStatus: String(cur.status ?? ''),
        nextStatus: next,
        description: held?.description ?? null,
      });
      if (block) return json({ ok: false, msg: block }, 400);
    }
    await c.db.prepare(`UPDATE products SET status=? WHERE id=?`).bind(next, id).run();
    await logRevision(c.db, 'products', id, null, { status: cur.status }, { status: next }, c.sess.uid);
    return json({ ok: true, status: next });
  }

  return json({ ok: false, msg: '未知操作' }, 400);
};
