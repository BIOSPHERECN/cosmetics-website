/**
 * 配方批量导入。
 *
 * 分两步走 —— dryRun 先验后写:
 *   真实配方表少则几十行、多则上千行,一次写错要清理很久。
 *   所以先跑一遍校验,把「哪行会失败、为什么」全列出来给人看,确认了再写。
 *   这比「导进去再发现错」便宜得多。
 *
 * 逐行独立处理:一行坏数据不该拖垮整批。失败的行报出来,好的行照常入库。
 */
import type { APIRoute } from 'astro';
import { apiGuard, json, logRevision } from '../../../lib/guard';

export const prerender = false;

type Row = Record<string, string>;
type Issue = { line: number; code: string; msg: string; level: 'bad' | 'warn' };

const CATS = new Set(['skincare', 'makeup', 'cleansing', 'oral', 'body', 'hair']);
const BANDS = new Set(['low', 'mid', 'high']);
/** 品类中文写法 → 库里的英文码。运营的表格不会用英文码,不认就等于让人手改一整列 */
const CAT_ZH: Record<string, string> = {
  护肤: 'skincare', 面部: 'skincare', 彩妆: 'makeup', 化妆: 'makeup',
  清洁: 'cleansing', 洁面: 'cleansing', 口腔: 'oral', 牙膏: 'oral',
  身体: 'body', 洗护: 'hair', 头发: 'hair', 洗发: 'hair',
};
const BAND_ZH: Record<string, string> = {
  经济: 'low', 低: 'low', 中档: 'mid', 中: 'mid', 高端: 'high', 高: 'high',
};

/**
 * 活性物自由文本 → 结构化。
 * 真实表格里这一列通常是「烟酰胺 2%、神经酰胺 0.5%」这种写法,
 * 要求运营手写 JSON 是不现实的。能解析就解析,解析不了整段塞进 name 保留原文,
 * 绝不因为格式不合就把内容丢掉 —— 原始信息比整洁重要。
 */
function parseActives(raw: string): { name: string; pct?: string }[] {
  const s = (raw ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) { try { return JSON.parse(s); } catch { /* 落到下面按文本解析 */ } }
  return s.split(/[、,,;;\n]/).map((seg) => seg.trim()).filter(Boolean).map((seg) => {
    const m = seg.match(/^(.+?)[\s::]*([\d.]+\s*[-~—]?\s*[\d.]*\s*%)\s*$/);
    return m ? { name: m[1].trim(), pct: m[2].replace(/\s/g, '') } : { name: seg };
  });
}

const numOrNull = (v: string) => {
  const n = parseFloat(String(v ?? '').replace(/[,，\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};

export const POST: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  try {
    const { rows, dryRun = true } = (await request.json()) as { rows: Row[]; dryRun?: boolean };
    if (!Array.isArray(rows) || !rows.length) return json({ ok: false, msg: '没有收到数据行' }, 400);
    if (rows.length > 2000) return json({ ok: false, msg: `一次最多 2000 行,当前 ${rows.length} 行,请分批` }, 413);

    // 库里已有的配方号:用来区分「新增」和「更新」
    const { results: exist } = await c.db.prepare(`SELECT code FROM formulas`).all<{ code: string }>();
    const have = new Set((exist ?? []).map((r) => r.code));

    const issues: Issue[] = [];
    const seen = new Set<string>();
    const ready: any[] = [];

    rows.forEach((r, i) => {
      const line = i + 2; // 表格里的行号:+1 是表头,+1 是从 1 开始数
      const code = String(r.code ?? '').trim();

      if (!code) { issues.push({ line, code: '(空)', msg: '配方号为空,该行会被跳过', level: 'bad' }); return; }
      if (seen.has(code)) { issues.push({ line, code, msg: '表格内配方号重复,只会写入最后一条', level: 'warn' }); }
      seen.add(code);

      const catRaw = String(r.category ?? '').trim();
      const category = CATS.has(catRaw) ? catRaw : (CAT_ZH[catRaw] ?? '');
      if (!category) {
        issues.push({ line, code, msg: `品类「${catRaw || '空'}」无法识别,将按 skincare 处理`, level: 'warn' });
      }

      const bandRaw = String(r.cost_band ?? '').trim();
      const cost_band = bandRaw ? (BANDS.has(bandRaw) ? bandRaw : (BAND_ZH[bandRaw] ?? null)) : null;
      if (bandRaw && !cost_band) {
        issues.push({ line, code, msg: `成本档「${bandRaw}」无法识别,将留空`, level: 'warn' });
      }

      const actives = parseActives(String(r.actives_json ?? ''));
      if (String(r.actives_json ?? '').trim() && !actives.length) {
        issues.push({ line, code, msg: '活性物一列解析不出内容', level: 'warn' });
      }

      if (!String(r.format ?? '').trim()) {
        issues.push({ line, code, msg: '剂型为空 —— AI 检索时剂型是主要筛选条件,建议补上', level: 'warn' });
      }
      if (!String(r.benefits ?? '').trim()) {
        issues.push({ line, code, msg: '功效为空 —— AI 就是按功效匹配的,留空这条配方几乎不会被推荐', level: 'warn' });
      }

      ready.push({
        code,
        category: category || 'skincare',
        format: String(r.format ?? '').trim() || '未标注',
        benefits: String(r.benefits ?? '').trim(),
        actives_json: JSON.stringify(actives),
        texture: String(r.texture ?? '').trim() || null,
        moq: numOrNull(r.moq),
        cost_band,
        lead_days: numOrNull(r.lead_days),
        markets: String(r.markets ?? '').trim(),
        cert_notes: String(r.cert_notes ?? '').trim() || null,
        _new: !have.has(code),
      });
    });

    const willAdd = ready.filter((x) => x._new).length;
    const willUpdate = ready.length - willAdd;

    if (dryRun) {
      return json({
        ok: true, dryRun: true,
        total: rows.length, valid: ready.length, willAdd, willUpdate,
        issues: issues.slice(0, 200),
        sample: ready.slice(0, 5),
      });
    }

    // ── 实际写入 ──────────────────────────────────────────
    let done = 0;
    const failed: Issue[] = [];
    for (const f of ready) {
      try {
        await c.db.prepare(
          `INSERT INTO formulas (code, category, format, benefits, actives_json, texture,
                                 moq, cost_band, lead_days, markets, cert_notes, status, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',datetime('now'))
           ON CONFLICT(code) DO UPDATE SET
             category=excluded.category, format=excluded.format, benefits=excluded.benefits,
             actives_json=excluded.actives_json, texture=excluded.texture, moq=excluded.moq,
             cost_band=excluded.cost_band, lead_days=excluded.lead_days, markets=excluded.markets,
             cert_notes=excluded.cert_notes, updated_at=datetime('now')`
        ).bind(f.code, f.category, f.format, f.benefits, f.actives_json, f.texture,
               f.moq, f.cost_band, f.lead_days, f.markets, f.cert_notes).run();
        done++;
      } catch (e) {
        failed.push({ line: 0, code: f.code, msg: e instanceof Error ? e.message.slice(0, 80) : '写入失败', level: 'bad' });
      }
    }

    await logRevision(c.db, 'formulas', 'import', null, null,
      { imported: done, added: willAdd, updated: willUpdate, failed: failed.length }, c.sess.uid);

    return json({ ok: true, dryRun: false, imported: done, added: willAdd, updated: willUpdate, failed });
  } catch (e) {
    return json({ ok: false, msg: `导入失败:${e instanceof Error ? e.message.slice(0, 200) : String(e)}` }, 500);
  }
};
