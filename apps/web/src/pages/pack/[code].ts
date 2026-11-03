import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { r2Get, type StorageEnv } from '../../lib/storage';

export const prerender = false;

/**
 * 包材图册页的分发 —— 前台 <img src="/pack/FLD-P042"> 直接取。
 *
 * 为什么不复用 /media/{id}:图册页有 800 多张,不该把媒体库塞满;
 * 而且这里要的是**按我们自己的编码取图** —— 编码印在方案与报价单上,
 * 客户回头说「FLD-P042 那一款」时,我们能一秒调出同一张图。
 *
 * 缓存:图册页一旦生成就不再变(要换就换编码),给 immutable 长缓存,
 * 边缘扛住绝大多数请求,D1 只在冷缓存时被打一次。
 */
export const GET: APIRoute = async ({ params }) => {
  const db = (env as any).DB as D1Database | undefined;
  const code = String(params.code ?? '').replace(/\.(webp|jpg|png)$/i, '').toUpperCase().slice(0, 48);
  /* 两种编码格式都要认:
       FLD-P042 / FLD-P042-3  图册页与页内单品(2026-09-06 那批,现全部待审)
       ST-A3650 / ST-B2529    目录站单品,后缀是供应商料号(2026-09-07 起)
       SX-001-1 / SX-047-3    1688 主图,第几个商品-第几张主图(2026-09-07 起)
     正则写死成第一种时,新入库的三千五百款全部 404;
     补了第二种又漏了第三种,那 93 款照样是破图 ——
     每加一种编码格式就要回来改这里,所以三种都写在注释里,别再漏。 */
  /* ST- 与 SX- 这两批是我们自己编的,R2 路径按编码直拼,所以只需要挡住路径穿越,
     不必用形状正则去猜编码长什么样。
     2026-09-07 实测:形状正则挡掉了 182 款 —— 134 个编码里带中文
     (ST-A2396纸巾盖、ST-A1299盖-18牙 这类,是从供应商料号带进来的),
     47 个是多段编码(ST-D80-30、ST-E3-50ML)。图在 R2 里、库里也有,
     页面上却是破图。每加一种编码格式就回来改一次正则,这个做法本身是错的:
     取不到就 404 是 R2 该管的事,路由只该管安全。 */
  /* 前缀解析必须放在这里 —— 下面的 known 会用到它。
     上一版把它留在文件后半段,而 known 在前面引用,
     JS 的 TDZ 直接抛 ReferenceError,表现是整条路由返回空 body 的 404。
     今天第三次踩这个:const 不是 var,写在下面就是用不了。 */
  /* 编码前缀 → R2 目录。上一版把 ST / SX 写成两个 if,
     结果 2026-09-07 新增 MZ / AL / MX 三批(809 张)当天全是破图 ——
     "每加一个前缀就回来改一次代码"本身就是错的做法。
     现在改成:前缀小写即目录名,只有两个历史批次是例外。
     队列侧写 key 时用的就是 `media/pack/{src}/`,两边同一套规则。 */
  const PREFIX_DIR: Record<string, string> = { ST: 'stnewwave', SX: 'shunxu' };
  const pre = (code.match(/^([A-Z]{2,4})-/) ?? [])[1] ?? '';
  const key = pre ? `media/pack/${PREFIX_DIR[pre] ?? pre.toLowerCase()}/${code}.webp` : null;

  const unsafe = code.length < 3 || /[\/]/.test(code) || code.includes("..")
                 || [...code].some((ch) => ch.charCodeAt(0) < 32);
  if (unsafe) return new Response('Not found', { status: 404 });
  const known = !!pre;   // 有前缀就按目录规则取,取不到就 404 —— R2 说了算
  /* 其余编码(FLD-Pxxx 那批图册页)仍走原来的形状校验 + reviewed 闸门 */
  if (!known && !/^[A-Z]{2,4}-P\d{3}(-\d{1,2})?$/.test(code)) {
    return new Response('Not found', { status: 404 });
  }

  /* ST- 这批(目录站单品)的 R2 路径是按编码拼出来的,查库只是白查一次。
     一个货架页有六十张图 = 六十次 D1 查询,这是 2026-09-07 那天把日读额度
     烧穿的原因之一;而且 D1 一挂,图就跟着全挂 —— 页面还在,全是破图。
     这批本来就是逐张审过才入库的(reviewed=1),路径确定,直接取。 */

  /* 其余编码仍要过 reviewed = 1 这道闸(2026-09-06 加的)。
     只在页面上藏起来不够 —— 编码是可猜的(FLD-P001、FLD-P002…),
     未审过的图册页里带着供应商 logo 与公司全名,接口不拦就等于没撤下来。 */
  let r2key = key;
  if (!r2key && db) {
    const row = await db.prepare(
      `SELECT r2_key FROM pack_assets WHERE our_code = ? AND reviewed = 1 LIMIT 1`)
      .bind(code).first<{ r2_key: string }>().catch(() => null);
    r2key = row?.r2_key ?? null;
  }
  if (!r2key) return new Response('Not found', { status: 404 });

  let res = await r2Get(env as unknown as StorageEnv, r2key).catch(() => null);
  /* 路径里的 + 会被解成空格(ST-C19-10G+5G → ST-C19-10G 5G),
     而 R2 里的文件名带的是真的 +。取不到就把空格换回加号再试一次。
     2026-09-07 实测有 11 款编码含 +,不补这一句它们永远是破图。 */
  if ((!res || !res.ok) && r2key.includes(' ')) {
    res = await r2Get(env as unknown as StorageEnv, r2key.replace(/ /g, '+')).catch(() => null);
  }
  if (!res || !res.ok) return new Response('Not found', { status: 404 });

  return new Response(res.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
