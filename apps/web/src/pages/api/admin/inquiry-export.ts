/**
 * 询盘导出 CSV。
 *
 * 为什么必须有:询盘的下一站几乎一定是 Excel —— 业务要按国家分给不同的人跟,
 * 老板要看月度汇总。没有导出,这些都得手动抄,抄一次就再也不会有人用后台了。
 *
 * 三个容易做错、做错就很难看的地方:
 *
 *  ① BOM。Excel 打开无 BOM 的 UTF-8 CSV,中文一律乱码。
 *     加三个字节的 ﻿ 就能解决,不加就等着业务发截图问「怎么全是问号」。
 *
 *  ② 公式注入。以 = + - @ 开头的单元格,Excel 会当公式执行 ——
 *     询盘正文是访客可控的,别人填一句 =HYPERLINK(...) 就能在你同事机器上弹东西。
 *     前面加一个单引号,显示不变但不再是公式。
 *
 *  ③ 换行与引号。询盘正文一定有换行,必须整段包引号、内部引号翻倍。
 */
import type { APIRoute } from 'astro';
import { apiGuard } from '../../../lib/guard';

export const prerender = false;

/** CSV 单元格:转义 + 防公式注入 */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;      // 见文件头 ②
  return `"${s.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = async ({ request }) => {
  const c = await apiGuard(request);
  if (c instanceof Response) return c;

  const url = new URL(request.url);
  const where: string[] = ['i.site_id = ?'];
  const bind: unknown[] = [c.tenant.siteId];

  const status = url.searchParams.get('status');
  if (status) { where.push('i.status = ?'); bind.push(status); }
  const lang = url.searchParams.get('lang');
  if (lang) { where.push('i.lang = ?'); bind.push(lang); }
  const country = url.searchParams.get('country');
  if (country) { where.push('i.country = ?'); bind.push(country); }
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q) {
    where.push('(i.name LIKE ? OR i.email LIKE ? OR i.company LIKE ? OR i.message LIKE ?)');
    bind.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  // 垃圾询盘默认不导出 —— 导给业务的表里混着垃圾,业务就不信这张表了
  if (url.searchParams.get('spam') !== '1') where.push('i.spam_score < 3');

  const { results } = await c.db.prepare(
    `SELECT i.id, i.created_at, i.status, i.lang, i.country, i.name, i.company, i.email,
            i.source_path, i.referrer, i.spam_score, i.message,
            (SELECT GROUP_CONCAT(t.product_name || CASE WHEN t.qty_note IS NOT NULL AND t.qty_note <> ''
                                                        THEN ' × ' || t.qty_note ELSE '' END, ' | ')
               FROM inquiry_items t WHERE t.inquiry_id = i.id) AS items
       FROM inquiries i
      WHERE ${where.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT 5000`,
  ).bind(...bind).all<any>();

  const head = ['编号', '提交时间', '状态', '语言', '国家', '姓名', '公司', '邮箱',
    '来源页', '外部来源', '垃圾分', '询盘车内容', '正文'];
  const lines = [head.map(cell).join(',')];
  for (const r of results ?? []) {
    lines.push([r.id, r.created_at, r.status, r.lang, r.country ?? '', r.name, r.company ?? '',
      r.email, r.source_path ?? '', r.referrer ?? '', r.spam_score, r.items ?? '', r.message]
      .map(cell).join(','));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  /* BOM 用 String.fromCharCode 生成,既不写字面字符也不写转义序列。
     两种写法都栽过:
       · 字面 BOM 是**不可见字符**,保存/传输中被吃掉后源码看着完全正常,
         肉眼查不出来,只有导出的 CSV 在 Excel 里全是乱码;
       · 转义序列又会被我用来改文件的 shell 工具吞掉反斜杠。
     fromCharCode 只有 ASCII,谁也吃不掉。 */
  const BOM = String.fromCharCode(0xfeff);
  return new Response(BOM + lines.join('\r\n'), {   // 见文件头 ①
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="inquiries-${c.tenant.siteId}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
