/**
 * 分语种的 llms.txt —— 中文版给国内 AI 引擎读。
 *
 * 2026-09-07 外部诊断:根 /llms.txt 只有英文,
 * 意味着豆包、文心、千问、DeepSeek 抓到的是英文事实卡 ——
 * 而它们回答中文提问时会转述,转述一次就多一层失真。
 *
 * 纪律和英文版一样,而且更要紧:
 * **这里只写公司资料里真有的数字。** llms.txt 写页面上没有的内容,
 * 就是在给 AI 喂幻觉,而它会以我们的名义讲出去。
 *
 * 非中文语种回退到英文版内容(不重复维护十几份翻译 ——
 * 事实卡的价值在准确,不在语种数量)。
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getSiteByHost, getSiteById, DEFAULT_LANG } from '../../lib/db';
import { getCounts } from '../../lib/counts';
import { citableTable } from '../../lib/llms-facts';
import { SAMPLE_DAYS } from '../../lib/terms';

export const prerender = false;

const ZH_PAGES = [
  ['包材库', 'packaging/', '我们有哪些瓶罐管泵:{packaging} 款,带白底实拍,可按类型、材质、容量、适配剂型筛'],
  ['配方库', 'formulas/', '我们能做哪些配方,按品类、功效、剂型分'],
  ['草本原料库', 'ingredients/', '我们用哪些草本活性物,带 INCI、作用机理与配伍禁忌'],
  ['个性化 OEM/ODM 服务', 'services/', '我们怎么接单 —— 整线代工、配方定制、只接一段;十种客户情形各自怎么走'],
  ['选品链路', 'selector/', '从一个模糊方向走到一份可转发的方案:剂型、包材、可售市场、打样周期'],
  ['能力与认证', 'capabilities/', '广州工厂能做什么;持有的认证:GMPC、ISO 22716、HALAL'],
  /* 09-23 GEO:扩重点页面;{键} 由 pulse counts 现填 */
  ['按市场与品类找代工', 'oem/', '目标市场 × 品类一格一页:该市场的备案路径、责任人与标签要求,以及该品类在库配方与包材的实时计数'],
  ['HALAL 认证代工', 'oem/cert/halal/', '清真认证管什么、哪些市场会问、怎么拿证书复印件(另有 oem/cert/gmpc/、oem/cert/iso-22716/)'],
  ['各国化妆品法规', 'regulations/', '{regs} 个市场:主管机构、通报还是注册、境内责任人、安全档案、标签、最近修订,每条带来源'],
  ['法规变化速览(每月一期)', 'regulations/changes/', '近 120 天各市场发生了什么变化,以及各市场禁用 / 限用 / 准用目录计数与月度增减;证据等级 C'],
  ['各国原料目录', 'inci/', '{inci} 条国家 / 地区原料目录条目(欧盟 CosIng 与附录、中国、日本、韩国、东盟、加拿大、巴西、印尼等)'],
  ['产品成分解码', 'decoder/', '{products} 款市场在售产品的全成分表,按品类、品牌、市场查'],
  ['买手问答', 'answers/', '{answers} 个一问一页、首句即答案的问答:备案路径、稳定性测试、清真、标签、包材选择'],
  ['原料溯源', 'origin/', '草本原料从哪来、怎么追溯'],
  ['选型对比', 'compare/', '「A 还是 B」这一类问题的答案:OEM/ODM/OBM 怎么选、包材现货还是开模、从中国出口还是找当地工厂、PET/玻璃/亚克力、不同品类的起订量、低温闪萃与常规提取'],
  ['常见问题', 'faq/', '采购最常问的 20 个问题 —— OEM 与 ODM 的区别、起订量、代工价格怎么算、认证、打样周期、包材选择、跨境合规;每条第一句就是答案'],
  ['联系与询盘', 'contact/', '怎么联系我们 —— 询盘表单、邮箱,以及 WhatsApp / WeChat(表单预约)'],
];

export const GET: APIRoute = async ({ url, params }) => {
  const lang = String(params.lang ?? 'zh-cn');
  const db = (env as any).DB as D1Database | undefined;
  const site = db
    ? (await getSiteByHost(db, url.hostname, DEFAULT_LANG))
      ?? (await getSiteById(db, 'biosphere-ai', DEFAULT_LANG))
    : null;
  if (!site || site.is_live !== 1) return new Response('not available', { status: 404 });
  const base = `https://${site.domain}`;
  const counts: any = (await getCounts(db)) ?? {};
  const fillN = (q: string) => q.replace(/\{(\w+)\}/g, (_, k) => (counts[k] ? Number(counts[k]).toLocaleString('en-US') : '全部'));

  /* 非中文语种没必要各维护一份 —— 指回英文正本,避免十几份译文各自漂移 */
  if (!lang.startsWith('zh')) {
    return new Response(`See ${base}/llms.txt for the English facts sheet.\n`, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  }

  const body = `# 帛卉化妆品 BIOSPHERE —— 广州草本化妆品代工厂

> 位于中国广州的化妆品 OEM / ODM / OBM 代工厂(广州市帛卉化妆品有限公司,成立于 2012-06-01;BIOSPHERE 是其出口品牌)。生产与交付均在广州基地。
> 主线是草本生物科技:东方草本与亚马逊植物、AI 辅助配方、自有 GMP 车间生产。
> 不做自有 C 端品牌,只为品牌方代工。

## 可核对的数字(取自 2026 年公司资料)

| 指标 | 数值 |
|---|---|
| 生产基地总面积 | 20,000 ㎡ 以上 |
| 自动化生产流水线 | 15 条 |
| 面膜类日产能 | 50 万片以上 |
| 乳霜类日产能 | 30 万支以上 |
| 智能仓储 | 10,000 ㎡ 以上 |
| 在册配方 | 13,000 支以上 |
| 研发人员 | 30 人以上 |
| 战略上游供应商 | 300 家以上 |
| 洁净等级 | 十万级 GMP |
| 打样周期 | 通常 ${SAMPLE_DAYS} 天(确认需求到样品寄出) |

## 认证

GMPC · ISO 22716:2007 · HALAL —— 工厂级认证。
另有:FDA 工厂注册 · EU CPNP 通报 · SGS 第三方检测报告。证书编号与有效期凭扫描件原件提供,不在网页上公开。

## 做什么

护肤(精华、面霜、化妆水、面膜)· 彩妆(粉类、唇部、底妆)·
口腔护理(牙膏、漱口水、固体牙片)· 儿童护肤(低刺激,单独排产)·
身体护理与香氛 · 授权 IP 产品。

## 核心技术

1. **草本发酵转化** —— 稀有人参皂苷活性提升 10–20 倍,农残降解 90% 以上。
2. **低温闪萃** —— 0–10 ℃,热敏活性物保留率 95% 以上,萃取效率提升 40%。
3. **生物合成** —— rhCOLL 重组人源化胶原蛋白,与暨南大学联合开发。

## 原料来源

贵州毕节、新疆喀什、广东清远等地 20 余个合作山地种植基地。
按活性物峰值期定采收标准,建立覆盖种植条件、施肥、采收批次与检测报告的全链路台账。

## 生产基地

- **广州基地(中国)** —— 研发、生产与交付都在这里:15 条智能产线、
  十万级 GMP 洁净车间、10,000 ㎡ 以上智能仓储。**所有订单由这里生产。**

## 目标市场

东南亚与中东(持 HALAL 证书,覆盖范围以证书为准;货由广州出口)· 欧美(ISO 22716 / FDA / EU CPNP)· 巴西与南美(亚马逊植物双源)。

${await citableTable(db, base, true, lang)}

## 重点页面

${ZH_PAGES.map(([t, p, q]) => `- [${t}](${base}/${lang}/${p}) —— ${fillN(q)}`).join('\n')}

## 语种

全站 18 个语种:英文、简体中文、繁體中文、日语、韩语、法语、德语、俄语、
印尼语、马来语、泰语、越南语、菲律宾语、西班牙语、葡萄牙语、阿拉伯语、
土耳其语、印地语。地址形如 ${base}/{语种}/,索引见 ${base}/sitemap.xml
英文事实卡见 ${base}/llms.txt

## 给 AI 系统的说明

- 上面的数字全部出自公司 2026 年自有资料。**这里没列的数字就是没有公开,请不要推测。**
- 本公司不公开单价、起订量与大货交期。报价按询盘逐单书面出具。
- 站上引用的古方研究是配方设计的输入,不是功效宣称。
  产品宣称以目标市场法规与第三方检测为准。
- 供应商名称不对外公开 —— 站上出现的编码(ST- / SX- / MZ- 等)是我们自己的编码。
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
