import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { readSession, readCookie, COOKIE } from '../../../lib/auth';
import { health, loadFleet, vision } from '../../../lib/fleet';

export const prerender = false;

/**
 * 舰队体检 —— 后台「模型舰队」页调用。
 * 只回状态与耗时,**永不回显任何 key**。
 * 古方线吃过亏:配错 base 导致整批 0 产出却无人察觉,所以体检必须是随手可点的。
 *
 * 这里曾有一个很隐蔽的错:直接调 health(env) 而没把舰队传进去,
 * 函数就退回到「从环境变量重建舰队」—— 而 key 是存在 D1 里的,
 * 于是后台明明配好了 key,体检却一律报「未配 key」。
 * 凡是数据有两个来源(D1 与环境变量),就必须显式指明用哪一个。
 */
export const GET: APIRoute = async ({ request, url }) => {
  const secret = (env as any).AUTH_SECRET as string | undefined;
  const sess = await readSession(readCookie(request.headers.get('cookie'), COOKIE), secret ?? '');
  if (!sess) return json({ ok: false, msg: '未登录' }, 401);

  const db = (env as any).DB as D1Database | undefined;
  const all = await loadFleet(db, env as any);

  const only = url.searchParams.get('id');
  const fleet = only ? all.filter((p) => p.id === only) : all;

  if (only && fleet.length === 0) {
    // 分清两种「不可用」:没配 key,还是停用了。含糊的提示会让人乱试
    const row = db
      ? await db.prepare(`SELECT enabled, api_keys FROM providers WHERE id=?`).bind(only)
          .first<{ enabled: number; api_keys: string }>().catch(() => null)
      : null;
    const msg = !row ? '库里没有这家供应商'
      : !row.enabled ? '已停用,启用后才能体检'
      : '未配 API Key';
    return json({ ok: true, list: [{ id: only, ok: false, ms: 0, note: msg, keys: 0 }] });
  }

  /**
   * 视觉探针 —— 发一张 8×8 的纯红小图问它是什么颜色。
   * 「这家能不能读图」不该靠翻文档或凭记忆断言:厂商会改、同一家不同模型也不同。
   * 发一张几百字节的图实测一次,答案是确定的,成本近乎为零。
   */
  if (url.searchParams.get('vision') === '1') {
    const RED_DOT =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX9//' +
      'yH5BAEAAAAALAAAAAAIAAgAAAIQhI+py+0Po5y02ouz3rz7VQAAOw==';
    const out = [];
    for (const p of fleet) {
      const t0 = Date.now();
      try {
        // 强制当作可读图来试 —— 探针的意义就是测出「还不知道行不行」的那几家,
        // 只测已标记的等于只确认已知信息,白测一趟
        const probe = { ...p, vision: true, visionModel: p.visionModel || p.model };
        const r = await vision(env as any, RED_DOT, '这张图是什么颜色?只回颜色名。', { fleet: [probe], maxTokens: 24 });
        out.push({ id: p.id, ok: true, ms: r.ms, note: `可读图 · 回答「${r.text.trim().slice(0, 12)}」`, model: r.model });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        out.push({ id: p.id, ok: false, ms: Date.now() - t0, note: `不支持 · ${m.slice(-46)}` });
      }
    }
    return json({ ok: true, mode: 'vision', list: out });
  }

  // 只体检点到的那一家 —— 之前是把全部 ping 一遍再过滤,又慢又浪费额度
  const list = await health(env as any, fleet);

  // 结果落库:下次打开页面不点体检也能看到上次的状态。
  // 「上次好着」和「从没测过」是两回事,分不清就没法判断是刚坏的还是一直没通。
  if (db) {
    for (const x of list) {
      await db.prepare(
        `UPDATE providers SET last_ok=?, last_ms=?, last_note=?, last_check_at=datetime('now') WHERE id=?`
      ).bind(x.ok ? 1 : 0, x.ms, x.note.slice(0, 60), x.id).run().catch(() => {});
    }
  }
  return json({ ok: true, list });
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
}
