/**
 * 机器翻译引擎 —— 把一行 i18n 记录从源语言翻成目标语言。
 *
 * 为什么要有这个东西:
 *   实测日语只翻了 28/208 个版块(13%),而创始人要再上印尼语、马来语、法语,
 *   之后还会更多。5 站 × 17 页 × N 语,人工翻是不可能完成的量 ——
 *   不是「慢一点」,是根本翻不完,最后会变成一堆半成品语言版。
 *   所以翻译必须是产品功能,不是一次性的人工活。
 *
 * 三条设计约束,每条都是踩过的坑:
 *
 * ① 只翻文字叶子,不让模型碰 JSON 结构。
 *    做法是先把 data_json 里的字符串叶子抽成 {"0":"…","1":"…"},
 *    只把这个扁平表交给模型,回来再按下标塞回原结构。
 *    直接把整块 JSON 丢给模型让它「翻译并保持结构」,十次里有一两次
 *    会少个字段、把数组变成对象、或者顺手把 image 路径也「翻译」了 ——
 *    而这种坏数据要等前台渲染时才炸,最难查。
 *
 * ② 图片路径、颜色、编号、序号一律不翻。
 *    "/media/3" 翻成法语是灾难;"01" 翻成 "premier" 会把流程编号搞坏。
 *
 * ③ 术语表焊死。BOHUI、ISO 22716、GMPC、OEM/ODM 这些在任何语言里都不译。
 *    模型很爱把 GMPC 意译成一长串本地词,那样客户反而认不出来。
 */
import { chat, type Provider, type FleetEnv } from './fleet.ts';   // 带扩展名:tools/ 下的回填脚本用 node 直接跑同一份逻辑,Node 的 ESM 不做无扩展名解析

/** 目标语言的自称 + 给模型的写作提示。加语种时补一行即可 */
export const TARGETS: Record<string, { name: string; hint: string }> = {
  'zh-cn': { name: '简体中文', hint: '书面商务中文,不用台港用语。' },
  en: { name: 'English', hint: 'International business English, plain and concrete. No marketing superlatives.' },
  ja: { name: '日本語', hint: 'B2B 向けの敬体(です・ます)。カタカナ語は業界で通用するものだけ。' },
  id: { name: 'Bahasa Indonesia', hint: 'Bahasa Indonesia baku untuk konteks B2B. Hindari bahasa gaul.' },
  ms: { name: 'Bahasa Melayu', hint: 'Bahasa Melayu baku Malaysia untuk konteks B2B. Bukan Bahasa Indonesia.' },
  fr: { name: 'Français', hint: 'Français professionnel B2B, vouvoiement, sans superlatifs publicitaires.' },
  /* 以下 30 语由 tools/locales.json 同步生成 —— 措辞提示是通用模板,
     哪个语种译得不对味,把它挪到上面手写一份更细的提示即可。 */
  ko: { name: '한국어', hint: 'Write in 한국어 (ko). B2B register, plain and concrete, no marketing superlatives.' },
  th: { name: 'ไทย', hint: 'Write in ไทย (th). B2B register, plain and concrete, no marketing superlatives.' },
  vi: { name: 'Tiếng Việt', hint: 'Write in Tiếng Việt (vi). B2B register, plain and concrete, no marketing superlatives.' },
  hi: { name: 'हिन्दी', hint: 'Write in हिन्दी (hi). B2B register, plain and concrete, no marketing superlatives.' },
  bn: { name: 'বাংলা', hint: 'Write in বাংলা (bn). B2B register, plain and concrete, no marketing superlatives.' },
  tl: { name: 'Filipino', hint: 'Write in Filipino (tl). B2B register, plain and concrete, no marketing superlatives.' },
  de: { name: 'Deutsch', hint: 'Write in Deutsch (de). B2B register, plain and concrete, no marketing superlatives.' },
  es: { name: 'Español', hint: 'Write in Español (es). B2B register, plain and concrete, no marketing superlatives.' },
  it: { name: 'Italiano', hint: 'Write in Italiano (it). B2B register, plain and concrete, no marketing superlatives.' },
  pt: { name: 'Português', hint: 'Write in Português (pt). B2B register, plain and concrete, no marketing superlatives.' },
  nl: { name: 'Nederlands', hint: 'Write in Nederlands (nl). B2B register, plain and concrete, no marketing superlatives.' },
  pl: { name: 'Polski', hint: 'Write in Polski (pl). B2B register, plain and concrete, no marketing superlatives.' },
  sv: { name: 'Svenska', hint: 'Write in Svenska (sv). B2B register, plain and concrete, no marketing superlatives.' },
  da: { name: 'Dansk', hint: 'Write in Dansk (da). B2B register, plain and concrete, no marketing superlatives.' },
  fi: { name: 'Suomi', hint: 'Write in Suomi (fi). B2B register, plain and concrete, no marketing superlatives.' },
  no: { name: 'Norsk', hint: 'Write in Norsk (no). B2B register, plain and concrete, no marketing superlatives.' },
  cs: { name: 'Čeština', hint: 'Write in Čeština (cs). B2B register, plain and concrete, no marketing superlatives.' },
  el: { name: 'Ελληνικά', hint: 'Write in Ελληνικά (el). B2B register, plain and concrete, no marketing superlatives.' },
  hu: { name: 'Magyar', hint: 'Write in Magyar (hu). B2B register, plain and concrete, no marketing superlatives.' },
  ro: { name: 'Română', hint: 'Write in Română (ro). B2B register, plain and concrete, no marketing superlatives.' },
  uk: { name: 'Українська', hint: 'Write in Українська (uk). B2B register, plain and concrete, no marketing superlatives.' },
  ru: { name: 'Русский', hint: 'Write in Русский (ru). B2B register, plain and concrete, no marketing superlatives.' },
  'pt-br': { name: 'Português (BR)', hint: 'Write in Português (BR) (pt-br). B2B register, plain and concrete, no marketing superlatives.' },
  'es-mx': { name: 'Español (MX)', hint: 'Write in Español (MX) (es-mx). B2B register, plain and concrete, no marketing superlatives.' },
  ar: { name: 'العربية', hint: 'Write in العربية (ar). B2B register, plain and concrete, no marketing superlatives. Right-to-left script; keep Latin brand names and certificate codes as-is.' },
  tr: { name: 'Türkçe', hint: 'Write in Türkçe (tr). B2B register, plain and concrete, no marketing superlatives.' },
  fa: { name: 'فارسی', hint: 'Write in فارسی (fa). B2B register, plain and concrete, no marketing superlatives. Right-to-left script; keep Latin brand names and certificate codes as-is.' },
  he: { name: 'עברית', hint: 'Write in עברית (he). B2B register, plain and concrete, no marketing superlatives. Right-to-left script; keep Latin brand names and certificate codes as-is.' },
  sw: { name: 'Kiswahili', hint: 'Write in Kiswahili (sw). B2B register, plain and concrete, no marketing superlatives.' },
  kk: { name: 'Қазақша', hint: 'Write in Қазақша (kk). B2B register, plain and concrete, no marketing superlatives.' },
};

/**
 * 不翻的键名。
 * 注意 no —— 流程版块的 {"no":"01"} 是序号,翻了会把「第 01 步」变成一串词。
 */
const SKIP_KEY = /^(image|images|img|src|href|url|link|icon|id|ids|slug|media|mediaid|no|code|key|align|variant|theme|color|colour|ratio|aspect|kind|type|layout|cols|columns|sort|order|lang|hreflang)$/i;

/** 不翻的值:路径 / 链接 / 颜色 / 纯数字 / 纯符号 */
function isNotProse(v: string): boolean {
  const s = v.trim();
  if (!s) return true;
  if (/^(https?:\/\/|\/|#|data:|mailto:|tel:)/.test(s)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return true;
  if (/^[\d\s.,:%+\-–—/]+$/.test(s)) return true;
  return false;
}

type Leaf = { path: (string | number)[]; text: string };

/** 深走一遍,把该翻的字符串叶子连同它的路径收出来 */
export function collectLeaves(node: unknown, path: (string | number)[] = [], out: Leaf[] = []): Leaf[] {
  if (typeof node === 'string') {
    if (!isNotProse(node)) out.push({ path, text: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectLeaves(v, [...path, i], out));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (SKIP_KEY.test(k)) continue;
      collectLeaves(v, [...path, k], out);
    }
  }
  return out;
}

/** 按路径把译文塞回结构副本;塞不进去就保留原值,绝不因为一个字段毁掉整块 */
export function applyLeaves(src: unknown, leaves: Leaf[], translated: Record<string, string>): unknown {
  const copy = structuredClone(src);
  leaves.forEach((leaf, i) => {
    const t = translated[String(i)];
    if (typeof t !== 'string' || !t.trim()) return;
    let cur: any = copy;
    for (let d = 0; d < leaf.path.length - 1; d++) cur = cur?.[leaf.path[d]];
    const last = leaf.path[leaf.path.length - 1];
    if (cur && last !== undefined && typeof cur[last] === 'string') cur[last] = t;
  });
  return copy;
}

const GLOSSARY = [
  'BOHUI', '帛卉', 'BEAUTY2OEM', 'SKIN2OEM', 'MEDIERBA', 'BIOSPHERE',
  'OEM', 'ODM', 'OBM', 'MOQ', 'SKU', 'GMPC', 'ISO 22716', 'ISO 9001',
  'FDA', 'MSDS', 'COA', 'INCI', 'R&D',
].join(' · ');

/**
 * 翻一批字符串。传入扁平表,返回同下标的扁平表。
 * 用 JSON 模式,因为下游要按下标对齐 —— 散文格式对不齐就前功尽弃。
 */
export async function translateBatch(
  env: FleetEnv,
  fleet: Provider[],
  texts: string[],
  to: string,
  context: string,
): Promise<Record<string, string>> {
  if (!texts.length) return {};
  const target = TARGETS[to];
  if (!target) throw new Error(`未知目标语言:${to}`);

  const payload: Record<string, string> = {};
  texts.forEach((t, i) => { payload[String(i)] = t; });

  const sys = [
    `你是化妆品代工(OEM/ODM)行业的专业本地化译者,现在把网站文案翻成${target.name}。`,
    target.hint,
    '',
    '硬规则:',
    `1. 返回一个 JSON 对象,键与输入完全一致(都是数字字符串),值是${target.name}译文。不要多键、不要少键、不要改键名。`,
    '2. 逐条独立翻译,不要合并、不要拆分、不要补充原文没有的信息。',
    '3. 以下词条原样保留,不译不改:' + GLOSSARY,
    '4. 数字、单位、证书编号、年份原样保留。',
    '5. 不要出现任何价格、报价、金额、货币符号 —— 我们只接单不报价,原文里也没有,你更不能加。',
    '6. 不用「最」「第一」「顶级」这类绝对化表述(多国广告法禁用),原文没有就不要加。',
    '7. 只输出 JSON,不要解释、不要 markdown 代码围栏。',
    '',
    `这批文案的上下文:${context}`,
  ].join('\n');

  const r = await chat(env, [
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify(payload) },
  ], { temperature: 0.2, maxTokens: 3000, json: true, fleet });

  let raw = r.text.trim();
  // 有些模型无视 json 模式仍然套围栏,剥掉再解析
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  if (fence) raw = fence[1].trim();
  const obj = JSON.parse(raw) as Record<string, unknown>;

  const out: Record<string, string> = {};
  for (const k of Object.keys(payload)) {
    const v = obj[k];
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** 翻一整块 data_json(收叶子 → 翻 → 塞回),返回新的 JSON 字符串 */
export async function translateJson(
  env: FleetEnv, fleet: Provider[], srcJson: string, to: string, context: string,
): Promise<string> {
  const src = JSON.parse(srcJson);
  const leaves = collectLeaves(src);
  if (!leaves.length) return srcJson;
  const got = await translateBatch(env, fleet, leaves.map((l) => l.text), to, context);
  return JSON.stringify(applyLeaves(src, leaves, got));
}
