/** 各库存量的缓存读数 —— pulse 表里 `counts` 那一行(tools/counts-refresh.py 写)。
 *  为什么不现算:SQLite 的 COUNT(*) 是全表扫;六站总览页每次渲染算六七个,GPTBot 一周抓 20 万次,
 *  2026-09-11 罗盘实测 kg_nodes 一项一天就读了 3 亿行。读这一行只花 1 行。
 *  取不到(没跑过脚本、表不存在)返回 null,调用方自行回退到现算。 */
export interface SiteCounts { [k: string]: number | Record<string, number> | undefined; registry?: Record<string, number> }

/* 09-24:同一份计数由 tools/counts-refresh.py 写成静态文件 src/data/site-counts.json,构建时打进包里。
   页面读它不碰 D1(零读取);文件缺失或为空才退回读 pulse 那一行。更新方式:跑 counts-refresh.py 后重新构建部署。 */
import STATIC from '../data/site-counts.json';

export async function getCounts(db: D1Database | undefined): Promise<SiteCounts | null> {
  if (STATIC && Object.keys(STATIC).length) return STATIC as unknown as SiteCounts;
  if (!db) return null;
  try {
    const row = await db.prepare(`SELECT json FROM pulse WHERE k = 'counts'`).first<{ json: string }>();
    return row ? (JSON.parse(row.json) as SiteCounts) : null;
  } catch { return null; }
}
