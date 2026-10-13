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
  /* 繁中必须手写提示,不能落到通用模板:
     「繁体 = 简体换个字」是外行判断 —— 台港的用词、量词、行文习惯都不同,
     而台港是化妆品代工的真实市场,措辞不地道会当场掉信任。
     另一条同样要紧:化妆品法规术语在台湾有官方对应词(卫福部食药署的说法),
     不能照搬大陆的「备案」「特证」。 */
  'zh-tw': { name: '繁體中文(台港)', hint:
    '台港澳商務書面繁體中文。用台灣慣用詞:軟體/網路/資訊/品質/廠商/報價/交期/庫存,' +
    '不用大陸用語(軟件/網絡/信息/質量/供應商報價單)。化粧品法規用台灣官方說法' +
    '(衛福部食藥署、化粧品產品登錄、特定用途化粧品),不要照搬大陸的「備案」「特證」。' +
    '語氣是工廠對品牌方的專業口吻,不用行銷誇飾詞。' },
  en: { name: 'English', hint:
    'International business English for cosmetics OEM/ODM. Use industry terms: ' +
    'formulation, filling, batch, lead time, MOQ, sampling, active ingredient, INCI, ' +
    'emulsification, filling line, stability test, challenge test, preservative system. ' +
    'Plain and concrete, no marketing superlatives. Factory-to-brand tone.' },
  jp: { name: '日本語', hint:
    'B2B向けの敬体(です・ます)。化粧品OEM/ODM専門用語を使用:処方、充填、ロット、 ' +
    '納期、最小発注数量、サンプル、有効成分、INCI、乳化、充填ライン、安定性試験、 ' +
    '防腐システム。カタカナ語は業界で通用するもの(コスメティクス、フォーミュレーション、 ' +
    'OEM、ODM)のみ使う。工場からブランドへの専門的口吻。' },
  id: { name: 'Bahasa Indonesia', hint:
    'Bahasa Indonesia baku untuk konteks B2B kosmetik OEM/ODM. ' +
    'Gunakan istilah industri: formulasi, pengisian, batch, waktu pengiriman, ' +
    'MOQ, sampel, bahan aktif, INCI, emulsifikasi, lini pengisian, uji stabilitas. ' +
    'Hindari bahasa gaul. Nada profesional dari pabrik ke brand.' },
  my: { name: 'Bahasa Melayu', hint:
    'Bahasa Melayu baku Malaysia untuk konteks B2B kosmetik OEM/ODM. ' +
    'Gunakan istilah industri: formulasi, pengisian, batch, tempoh penghantaran, ' +
    'MOQ, sampel, bahan aktif, INCI, emulsifikasi, garis pengisian, ujian kestabilan. ' +
    'Bukan Bahasa Indonesia. Nada profesional dari kilang ke brand.' },
  fr: { name: 'Français', hint:
    'Français professionnel B2B pour cosmétiques OEM/ODM. Vouvoiement. ' +
    'Termes métier: formulation, remplissage, lot, délai, MOQ, échantillon, ' +
    'ingrédient actif, INCI, émulsification, ligne de remplissage, test de stabilité. ' +
    'Sans superlatifs publicitaires. Ton professionnel d\'usine vers marque.' },
  kr: { name: '한국어', hint:
    'B2B 화장품 OEM/ODM 분야의 한국어. 존댓말(하십시오체). ' +
    '업계 전문 용어 사용: 배합, 충전, 로트, 납기, 최소 주문 수량, 샘플, ' +
    '유효 성분, INCI, 유화, 충전 라인, 안정성 시험, 방부 시스템. ' +
    '외래어는 업계에서 통용되는 것만 사용. 공장에서 브랜드로의 전문적 어조.' },
  de: { name: 'Deutsch', hint:
    'Deutsch für B2B Kosmetik OEM/ODM. Branchenbegriffe verwenden: Rezeptur, Abfüllung, ' +
    'Charge, Lieferzeit, MOQ, Muster, Wirkstoff, INCI, Emulgierung, Abfülllinie, ' +
    'Stabilitätstest, Konservierungssystem. Professionelle Sie-Form. ' +
    'Keine Werbesuperlative. Ton Fabrik zu Marke.' },
  ru: { name: 'Русский', hint:
    'Русский для B2B косметики OEM/ODM. Используйте отраслевые термины: ' +
    'формуляция, фасовка, партия, срок поставки, MOQ, образец, активный ингредиент, ' +
    'INCI, эмульгирование, линия фасовки, тест на стабильность. ' +
    'Без маркетинговых преувеличений. Профессиональный тон от фабрики к бренду.' },
  th: { name: 'ไทย', hint:
    'ภาษาไทยสำหรับ B2B เครื่องสำอาง OEM/ODM ใช้คำศัพท์อุตสาหกรรม: ' +
    'สูตร, บรรจุ, ล็อต, ระยะเวลาผลิต, MOQ, ตัวอย่าง, สารออกฤทธิ์, INCI, ' +
    'อิมัลชัน, สายบรรจุ, ทดสอบความเสถียร ไม่ใช้คำโฆษณาเกินจริง ' +
    'น้ำเสียงจากโรงงานสู่แบรนด์อย่างมืออาชีพ' },
  vn: { name: 'Tiếng Việt', hint:
    'Tiếng Việt cho B2B mỹ phẩm OEM/ODM. Sử dụng thuật ngữ ngành: ' +
    'công thức, chiết rót, lô, thời gian giao hàng, MOQ, mẫu, thành phần hoạt tính, ' +
    'INCI, nhũ hóa, dây chuyền chiết rót, kiểm tra độ ổn định. ' +
    'Không dùng văn phong quảng cáo phóng đại. Giọng chuyên nghiệp từ nhà máy đến thương hiệu.' },
  ph: { name: 'Filipino', hint:
    'Filipino para sa B2B kosmetiko OEM/ODM. Gamit ng mga terminong industriya: ' +
    'formulation, pagpuno, batch, lead time, MOQ, sample, aktibong sangkap, INCI, ' +
    'emulsification, linya ng pagpuno, stability test. ' +
    'Walang mga labis na adverb. Propesyonal na tono mula pabrika patungo sa brand.' },
  es: { name: 'Español', hint:
    'Español profesional B2B para cosmética OEM/ODM. Vocabulario del sector: ' +
    'formulación, envasado, lote, plazo de entrega, MOQ, muestra, ingrediente activo, ' +
    'INCI, emulsificación, línea de envasado, prueba de estabilidad. ' +
    'Sin superlativos publicitarios. Tono de fábrica a marca, tuteo formal.' },
  pt: { name: 'Português', hint:
    'Português profissional B2B para cosméticos OEM/ODM. Vocabulário do setor: ' +
    'formulação, envase, lote, prazo de entrega, MOQ, amostra, ingrediente ativo, ' +
    'INCI, emulsificação, linha de envase, teste de estabilidade. ' +
    'Sem superlativos publicitários. Tom de fábrica para marca.' },
  ar: { name: 'العربية', hint:
    'العربية للسياق B2B لمستحضرات التجميل OEM/ODM. استخدم مصطلحات الصناعة: ' +
    'صياغة، تعبئة، دفعة، مدة التسليم، الحد الأدنى للطلب، عينة، مكون نشط، INCI، ' +
    'استحلاب، خط تعبئة، اختبار الثبات. كتابة من اليمين إلى اليسار؛ ' +
    'أبقِ أسماء العلامات التجارية ورموز الشهادات اللاتينية كما هي. ' +
    'بدون مبالغات تسويقية. نبرة احترافية من المصنع إلى العلامة التجارية.' },
  tr: { name: 'Türkçe', hint:
    'Türkçe B2B kozmetik OEM/ODM için. Sektör terimleri kullanın: ' +
    'formülasyon, dolum, parti, teslim süresi, MOQ, numune, aktif bileşen, INCI, ' +
    'emülsifikasyon, dolum hattı, stabilite testi. ' +
    'Reklam abartmaları yok. Fabrikadan markaya profesyonel ton.' },
  in: { name: 'हिन्दी', hint:
    'B2B कॉस्मेटिक्स OEM/ODM के लिए हिन्दी। उद्योग शब्दावली का उपयोग करें: ' +
    'निर्माण, भराई, बैच, डिलीवरी समय, MOQ, नमूना, सक्रिय घटक, INCI, ' +
    'इमल्सीफिकेशन, भराई लाइन, स्थिरता परीक्षण। ' +
    'विपणन अतिशयोक्तियाँ नहीं। फैक्ट्री से ब्रांड तक पेशेवर लहजा।' },
};

/**
 * 不翻的键名。
 * 注意 no —— 流程版块的 {"no":"01"} 是序号,翻了会把「第 01 步」变成一串词。
 */
const SKIP_KEY = /^(image|images|img|src|href|url|link|icon|id|ids|slug|media|mediaid|no|code|key|align|variant|theme|color|colour|ratio|aspect|kind|type|layout|cols|columns|sort|order|lang|hreflang|tone|size|gap|mode|position|placement|state|status|format)$/i;

/**
 * 不翻的值:路径 / 链接 / 颜色 / 纯数字 / 纯符号 / **枚举值**。
 *
 * 最后一条是补的,起因是韩语首翻把版块的 tone:"ink" 翻成了 "인크"、
 * tone:"paper" 翻成了 "지시서" —— 那不是文案,是组件用来选配色档的枚举,
 * 翻掉之后 `tone === 'ink'` 永远不成立,深色底整块变白。
 * 而这种坏数据不报错,要等有人打开那个语种的页面才看得出来。
 *
 * 只按键名挡(SKIP_KEY)治标:下次谁加个新组件带个新枚举键,又会静默翻错。
 * 所以再加一道**按值的形状**判定:枚举在本仓库里一律是
 * 「纯小写 ASCII 单词、不含空格」(ink / paper / sand / deep / verified / hub)。
 * 真正的展示文案不可能长这样 —— 中日韩阿是非 ASCII,英文文案带大写或空格。
 */
const ENUMISH = /^[a-z][a-z0-9_-]{0,15}$/;

/**
 * 这些键装的一定是给人看的字,形状判定对它们**不生效**。
 *
 * 起因是我自己上一版误伤:数字条的 unit 里装着 "yrs"、"units",
 * 纯小写 ASCII、不含空格,正好长得像枚举 —— 于是被跳过没翻,
 * 韩文版数字条变成「12 yrs / 3,000 units」。
 * 形状判定治的是"没在 SKIP_KEY 里的新枚举键",不该越权管到明确的文案键。
 */
const DISPLAY_KEY = /^(unit|units|label|text|title|name|note|hand|intro|tagline|eyebrow|caption|alt|summary|desc|description|lead|quote|answer|question|value)$/i;

function isNotProse(v: string, key?: string | number): boolean {
  const s = v.trim();
  if (!s) return true;
  if (/^(https?:\/\/|\/|#|data:|mailto:|tel:)/.test(s)) return true;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return true;
  if (/^[\d\s.,:%+\-–—/]+$/.test(s)) return true;
  if (ENUMISH.test(s) && !DISPLAY_KEY.test(String(key ?? ''))) return true;
  return false;
}

type Leaf = { path: (string | number)[]; text: string };

/** 深走一遍,把该翻的字符串叶子连同它的路径收出来 */
export function collectLeaves(node: unknown, path: (string | number)[] = [], out: Leaf[] = []): Leaf[] {
  if (typeof node === 'string') {
    // 传父键:形状判定要看这个值挂在哪个字段下(unit 里的 "yrs" 是文案,tone 里的 "ink" 是枚举)
    if (!isNotProse(node, path[path.length - 1])) out.push({ path, text: node });
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
    if (!cur || last === undefined || typeof cur[last] !== 'string') return;
    // 最后一道闸:原值若是枚举形状,不管模型回了什么都保留原值。
    // collectLeaves 已经挡过一次,这里再挡是因为**两处的代价不对称**:
    // 漏翻一句文案只是难看,翻错一个枚举是整块渲染错。
    if (isNotProse(String(cur[last]), last)) return;
    cur[last] = t;
  });
  return copy;
}

const GLOSSARY = [
  'BOHUI', '帛卉', 'BEAUTY2OEM', 'SKIN2OEM', 'MEDIERBA', 'BIOSPHERE',
  'OEM', 'ODM', 'OBM', 'MOQ', 'SKU', 'GMPC', 'ISO 22716', 'ISO 9001',
  'FDA', 'MSDS', 'COA', 'INCI', 'R&D',
].join(' · ');

/**
 * 目标语言 → 该优先派给谁。
 *
 * 韩语首翻实测吐出这些:
 *   帛卉集团생산기지  (中韩混排,原文的中文没翻掉)
 *   피부护理         (韩中混排)
 *   에마ulsifying    (韩文粘着拉丁碎片,"乳化"翻了一半)
 * 干这活的是 tier1 的 Llama-3.3 —— 它的英法德西葡没问题,
 * 但中日韩训练语料薄,长句一压缩就露出这种半成品。
 *
 * 所以按语种换档:中日韩交给中文系模型(GLM / Qwen / LongCat / 商汤),
 * 它们的 CJK 语料密度高一个量级;拉丁语系仍按原顺序,不必折腾。
 * 这不是"哪家更强"的排名,是**语料匹配**。
 */
const CJK_FIRST = ['zhipu', 'siliconflow', 'longcat', 'sensenova'];

export function orderFleetFor(to: string, fleet: Provider[]): Provider[] {
  if (!['jp', 'kr', 'zh-cn'].includes(to)) return fleet;
  const rank = (p: Provider) => {
    const i = CJK_FIRST.indexOf(p.id);
    return i === -1 ? CJK_FIRST.length + p.tier : i;
  };
  return [...fleet].sort((a, b) => rank(a) - rank(b));
}

/**
 * 书写系统混排检查 —— 译文质量的硬闸门。
 *
 * 为什么要有:模型翻不动的时候不会报错,它会**交一个混着两种文字的半成品**。
 * 这种输出 JSON 结构完全合法、字段一个不少、入库毫无阻碍,
 * 只有真人打开那个语种的页面才看得出来 —— 而 15 门语言不会有人逐页看。
 *
 * 两条判据:
 *  ① 目标语种里不该出现的文字(韩/泰/阿/印地文里出现汉字 = 原文没翻掉);
 *     日语不查汉字 —— 汉字本来就是日文的一部分。
 *  ② 非拉丁文字后面直接粘着三个以上小写拉丁字母(에마ulsifying)——
 *     正常译文里外来语要么整词保留、要么整词转写,不会粘在一起。
 */
const HAN = /[一-鿿]/;
const GLUED = /[぀-ヿ一-鿿가-힯฀-๿؀-ۿऀ-ॿ][a-z]{3,}/;
/** 这些语种的译文里不该出现汉字。日语不在内 —— 汉字是它自己的字。 */
const NO_HAN = new Set(['kr', 'th', 'ar', 'in', 'vn', 'ru', 'tr']);

/**
 * 目标语言真的翻出来了吗 —— 比"有没有混排"更基本的一问。
 *
 * 起因是评测时 NVIDIA 的 riva-translate 在阿拉伯语和葡萄牙语上都拿了满分,
 * 而它交回的是**英文**:"Vacuum emulsification, available in both hot and cold process"。
 * 混排没有、术语齐全、条数不缺 —— 我那套判据一条都没拦住。
 * 一个"永远回英文"的模型能拿满分,说明那把尺子本身缺了最基本的一刻度。
 *
 * 两类判法:
 *  ① 有独特文字的语种(阿/泰/韩/日/俄/印地/中):译文里必须出现该文字,没有就是没翻。
 *  ② 拉丁字母语种:靠该语言的高频虚词判 —— 这类词在任何一段正常商务文案里
 *    都必然出现若干个,而英文原文里不会有。比逐词比对可靠,也比调语言识别模型便宜。
 */
const SCRIPT_OF: Record<string, RegExp> = {
  ar: /[؀-ۿ]/,
  th: /[฀-๿]/,
  kr: /[가-힯]/,
  jp: /[぀-ヿ]/,          // 假名。只查汉字会被中文原文蒙混过去
  ru: /[Ѐ-ӿ]/,
  in: /[ऀ-ॿ]/,
  'zh-cn': /[一-鿿]/,
};

/** 拉丁语种的高频虚词。命中 0 个基本可判定"没翻成这门语言" */
const STOPWORDS: Record<string, string[]> = {
  pt: ['de', 'para', 'com', 'que', 'não', 'ou', 'em', 'do', 'da', 'são'],
  es: ['de', 'para', 'con', 'que', 'no', 'los', 'las', 'en', 'del', 'son'],
  fr: ['de', 'pour', 'avec', 'que', 'les', 'des', 'du', 'est', 'sont', 'et'],
  de: ['und', 'für', 'mit', 'der', 'die', 'das', 'von', 'bei', 'sind', 'wird'],
  tr: ['ve', 'için', 'ile', 'bir', 'olarak', 'veya', 'bu', 'da'],
  vn: ['và', 'cho', 'với', 'của', 'các', 'được', 'là', 'trong'],
  id: ['dan', 'untuk', 'dengan', 'yang', 'dari', 'pada', 'atau', 'dapat'],
  my: ['dan', 'untuk', 'dengan', 'yang', 'daripada', 'pada', 'atau', 'boleh'],
  ph: ['ang', 'ng', 'sa', 'para', 'mga', 'at', 'na', 'ay'],
};

/** 整批译文是否根本没翻成目标语言。返回 true 表示这一家不能用。 */
export function wrongLanguage(to: string, out: Record<string, string>, src: string[] = []): boolean {
  const entries = Object.entries(out).filter(([, v]) => typeof v === 'string' && v.trim().length > 6);
  if (entries.length < 3) return false;                // 样本太少不下结论

  const re = SCRIPT_OF[to];
  if (re) {
    /* 只拿「真句子」判,专名条目豁免 —— 德语分支当年修过同一坑(虚词误杀短标签),
       CJK 分支一直没同步:证书徽章「ISO 22716」「GMPC」「OEM / ODM / OBM」
       译成日文后**理应原样保留**,却被计入「不含假名」的分母,
       一个块里徽章一多,占比必跌破线,整批被误判 —— 343 号店招块 12 门语言
       全军覆没就是这么来的。判据:原文含非 ASCII(有实词可翻)或 ≥4 个单词的才参与。 */
    const judged = entries.filter(([k]) => {
      const o = String(src[Number(k)] ?? '');
      return /[^\x00-\x7F]/.test(o) || o.trim().split(/\s+/).length >= 4;
    }).map(([, v]) => v);
    if (judged.length < 3) return false;
    return judged.filter((v) => re.test(v)).length < judged.length * 0.6;
  }
  const vals = entries.map(([, v]) => v);

  const sw = STOPWORDS[to];
  if (!sw) return false;                               // en 之类不判

  /* 只拿**长句**来判。
     德语首翻实测被这条误杀:那批里大半是「R&D」「Manufacturing」这种版块标签,
     译成 Forschung / Fertigung 后一个虚词都没有 —— 完全正常的德语,
     却因为"没命中虚词"被判成没翻,整门语言被拒,最后把回填进程也带崩了。
     虚词是长句里必然出现的东西,短标签里本来就不该指望有。 */
  const long = vals.filter((v) => v.length > 40);
  if (long.length < 3) return false;                   // 长句太少,判不了就别判
  const hit = long.filter((v) => {
    /* NFC 归一 + 组合记号并入词:越南语等带声调文本若是分解形态(NFD),
       \p{L} 会把 được 拆成碎片,虚词永远命不中 —— 三家模型的标准越南语
       全被误杀数小时,病根就在这一行的分词。 */
    const words = new Set(v.normalize('NFC').toLowerCase().split(/[^\p{L}\p{M}]+/u));
    return sw.some((w) => words.has(w));
  }).length;
  /* 阈值回归本意(见上方注释「命中 0 个基本可判没翻」):
     整批长句一个虚词都没有才拒 —— 质量细查交给 scriptProblems 混排闸门。 */
  return hit === 0;
}

export function scriptProblems(to: string, out: Record<string, string>, src: string[]): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(out)) {
    const orig = src[Number(k)] ?? '';
    if (typeof v !== 'string' || !v.trim()) continue;
    // 原文本来就带汉字商标(帛卉)的条目不算 —— 那是词表要求保留的
    if (NO_HAN.has(to) && HAN.test(v) && !HAN.test(orig.replace(/帛卉/g, ''))) { bad.push(k); continue; }
    if (GLUED.test(v)) bad.push(k);
  }
  return bad;
}

/**
 * 翻一批字符串。传入扁平表,返回同下标的扁平表。
 * 用 JSON 模式,因为下游要按下标对齐 —— 散文格式对不齐就前功尽弃。
 */
/**
 * 翻译专用的模型名单 —— 不是把舰队 9 家全拉来排队。
 *
 * 实测(同一批文案、同一把尺子、泰/韩/阿三门):
 *   minimax-m3(免费)   三门全对,5–7 秒     ← 又快又全
 *   gemini-2.5-flash   泰韩对,阿拉伯语挂    ← 快,做第二道
 *   qwen3.8-max        三门全对但 63–107 秒 ← 准但慢,只当保底
 *   其余六家           泰语翻成「沥青」那一类,救不回来
 *
 * 为什么要专门限定:translateBatch 遇到"结果有小瑕疵"时会继续往下试,
 * 想找一版完全干净的。名单不限,它就会为了一两条瑕疵把九家跑穿 ——
 * 既慢,又可能让「检查器看着干净但其实更差」的模型赢过好模型。
 * 三家足够:好的、快的备份、慢但稳的保底。
 *
 * 线上 AI 功能(测肤/工作室)不用这个名单 —— 那边访客在等,
 * 谁先应答谁上,和翻译要的"选最好的"是两种取舍。
 */
/* 2026-08-31 扩容:三家名单在 gemini 全天 429 + orfree 偶发被校验拒时会全灭
   (实测 34 个块卡死数小时)。追加中文系四家做后备 —— 质量参差没关系,
   wrongLanguage/scriptProblems 闸门会把坏译文拦下,总比整批翻不出强。 */
/* 2026-09-08 再修:这份名单是**偏好**,不是白名单。
   上一版把它当白名单用,而名单里七个 id 只有 sensenova / longcat 还开着 ——
   舰队里另外七家可用的文本模型(agnes 四个、sensenova 三个变体)一个都没进来。
   后果:两家被限流就整批翻不动,实测一次回填 997 条失败,
   报错全是 `sensenova:429 rpm exhausted` 与 `longcat:402 too_many_req`。
   名单本身没错,错在它会过期 —— 新接一家模型,不改这一行就等于没接。
   所以改成:名单里的排前面,**其余可用的全部接在后面**。 */
const TRANSLATE_RANK = [
  'orfree', 'gemini', 'dashscope', 'zhipu', 'siliconflow',
  'agnes-30flash-cn', 'agnes', 'agnes-25pro', 'agnes-25flash', 'agnes-30flash', 'agnes-cn',
  'sensenova', 'sensenova-68', 'sensenova-ds', 'sensenova-kimi', 'longcat',
];

export function translationFleet(fleet: Provider[]): Provider[] {
  const rank = new Map(TRANSLATE_RANK.map((id, i) => [id, i]));
  const picked = [...fleet].sort(
    (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999),
  );
  return picked.length ? picked : fleet;
}

export async function translateBatch(
  env: FleetEnv,
  fleet: Provider[],
  texts: string[],
  to: string,
  context: string,
  timeoutMs?: number,
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

  const msgs = [
    { role: 'system' as const, content: sys },
    { role: 'user' as const, content: JSON.stringify(payload) },
  ];

  const parse = (text: string): Record<string, string> => {
    let raw = text.trim();
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
  };

  /*
   * 一家一家试,而不是让 chat() 内部自己轮换。
   *
   * 差别在于**换家的条件**:chat() 只在调用出错时换下一家,
   * 而翻译最常见的失败根本不报错 —— 模型交回一个结构完全合法、
   * 字段一个不少、但混着两种文字的半成品(에마ulsifying)。
   * 那种输出入库毫无阻碍,只有真人打开那页才看得出来。
   *
   * 所以把「合格」的判据从「没抛异常」提到「过了书写系统检查」,
   * 不合格就换下一家重翻。全都不合格时交回问题最少的那一版 ——
   * 有瑕疵的译文仍然强过整块回落英文,但会打日志说清楚是哪几条。
   */
  const ordered = orderFleetFor(to, fleet);
  let best: { out: Record<string, string>; bad: string[]; who: string } | null = null;

  const why: string[] = [];   // 记下每家为什么不行 —— 只报"全都不行"没法查

  for (const p of ordered) {
    let out: Record<string, string>;
    try {
      const r = await chat(env, msgs, { temperature: 0.2, maxTokens: 3000, json: true, fleet: [p], timeoutMs });
      out = parse(r.text);
    } catch (e) { why.push(`${p.id}:${String((e as Error).message).slice(0, 60)}`); continue; }

    const got = Object.keys(out).length, want = Object.keys(payload).length;
    if (got < want * 0.9) { why.push(`${p.id}:只回了 ${got}/${want} 条`); continue; }

    // 先问"翻成这门语言了吗",再问"翻得干不干净"——
    // 顺序不能反:一段纯英文的译文在书写系统检查里是完全干净的。
    if (wrongLanguage(to, out, texts)) { why.push(`${p.id}:交回的不是 ${to}`); continue; }

    /* 原样退回 = 根本没翻。
       实测栽过 55 条:泰语、越南语等语种的"译文"和英文原文**逐字节相同**,
       连 linkHref 里的 /en/contact/ 都照抄。条数是满的、后台显示"已翻译",
       只有真人打开那一页才看得出来 —— 比缺译文难查得多。
       原因是下面那个"问题最少的一版"兜底:所有家都没过检时它会交回最不糟的,
       而英文在书写系统检查里"问题最少"(它没有混排,只是错语言)。
       所以这一条要在兜底之前拦:交回原文的一律当这家失败,换下一家。 */
    /* 只拿**成句的长文本**来判。
       短串原样退回是正常的:「BASF 巴斯夫」「ISO 22716」「Aloe barbadensis」
       「30ml」这类本来就不该翻,整块全是这种的版块(供应商墙、原料档案)
       会被一刀切的判据全部误杀 —— 实测就误杀了两块。
       12 个字符以上才算句子;这种句子成批原样退回,才是真没翻。 */
    const sentences = texts.map((t, i) => [t, i]).filter(([t]) => t && t.length > 12);
    const same = sentences.filter(([t, i]) => out[String(i)] === t).length;
    if (sentences.length >= 2 && same >= sentences.length * 0.8) {
      why.push(`${p.id}:${same}/${sentences.length} 条长句原样退回(没翻)`);
      continue;
    }

    const bad = scriptProblems(to, out, texts);
    if (!bad.length) return out;
    if (!best || bad.length < best.bad.length) best = { out, bad, who: p.id };
  }

  if (!best) throw new Error(`${to}:全部模型都没交回可用译文 —— ${why.join(' | ')}`);
  console.warn(`[translate] ${to} 由 ${best.who} 交付,${best.bad.length}/${texts.length} 条未过书写系统检查`);
  return best.out;
}

/**
 * AI 功能的回答语言规则 —— 给 skin / studio 这类对客生成接口用。
 *
 * 起因是实测发现两处都在给外语访客回中文:
 *   skin.ts  写的是 `用${lang === 'en' ? '英文' : '中文'}输出` —— 只认英文和中文,
 *            韩语、阿拉伯语、泰语、葡萄牙语的访客一律拿到中文;
 *   studio.ts 系统提示里直接写死「中文回答」,连 lang 都没看。
 * 页面本身翻得再好,一点 AI 测肤蹦出一段中文,前面的功夫就全白做了。
 *
 * 两个决定:
 *  ① 语种名用**该语言的自称**(한국어 而不是「韩语」)。模型对自称的响应更稳,
 *    尤其是小语种 —— 用中文说「用他加禄语回答」,模型有时会当成英语。
 *  ② 判不出语言时兜底**英文,不是中文**。这是出海站,英文是安全默认;
 *    回中文既看不懂又显得这站是给国内看的。
 */
/**
 * 从客户写的这段话里判断他在用什么语言。
 *
 * 为什么需要:AI 功能原本按**页面语种**决定回什么语言,
 * 于是一个在韩语站上用英文写需求的采购,会收到一封韩文回复 ——
 * 而他之所以用英文写,恰恰说明英文是他更顺手的工作语言。
 * 换成真人业务员不会这么干:对方用什么语言来的,就用什么语言回。
 *
 * 只在**判得准**的时候才覆盖页面语种:
 *  · 有独特文字的(韩/日/泰/阿/俄/印地/中)——看文字就够,几乎不会错;
 *  · 拉丁字母的靠虚词,而且要够长的一段才算数;
 *  · 太短、判不准、或者判出来的语种我们没有 —— 一律退回页面语种,不猜。
 * 判错语言比不判更糟:客户会觉得这站在"猜他是哪国人"。
 */
export function detectLanguage(text: string): string | null {
  const t = String(text || '').trim();
  if (t.length < 20) return null;          // 太短判不准,别猜

  // 假名优先于汉字:日文里有汉字,但中文里没有假名
  if (/[぀-ヿ]/.test(t)) return 'jp';
  if (/[가-힯]/.test(t)) return 'kr';
  if (/[฀-๿]/.test(t)) return 'th';
  if (/[؀-ۿ]/.test(t)) return 'ar';
  if (/[Ѐ-ӿ]/.test(t)) return 'ru';
  if (/[ऀ-ॿ]/.test(t)) return 'in';
  if (/[一-鿿]/.test(t)) return 'zh-cn';

  const words = new Set(t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean));
  if (words.size < 5) return null;
  let best: { code: string; n: number } | null = null;
  for (const [code, sw] of Object.entries(STOPWORDS)) {
    const n = sw.filter((w) => words.has(w)).length;
    if (n >= 2 && (!best || n > best.n)) best = { code, n };
  }
  if (best) return best.code;

  // 英语没进 STOPWORDS(它是兜底语言),单独判
  const EN = ['the', 'and', 'for', 'with', 'we', 'our', 'you', 'need', 'want', 'please', 'is', 'are'];
  return EN.filter((w) => words.has(w)).length >= 2 ? 'en' : null;
}

/**
 * 决定这次该用哪种语言回答:客户写的语言优先,判不出来才用页面语种。
 */
export function replyLanguageFor(pageLang: string | undefined, customerText: string): string {
  const d = detectLanguage(customerText);
  return d && TARGETS[d] ? d : (pageLang && TARGETS[pageLang] ? pageLang : 'en');
}

export function replyLanguageRule(lang: string | undefined): string {
  const t = (lang && TARGETS[lang]) || TARGETS.en;
  const rtl = ['ar'].includes(String(lang));
  return [
    `全文用${t.name}回答,不要夹杂其他语言,也不要附上原文或译文对照。`,
    t.hint,
    rtl ? '从右向左书写;拉丁文品牌名与证书编号保持原样。' : '',
    '专有名词按行业惯例保留:BOHUI、ISO 22716、GMPC、OEM/ODM/OBM、MSDS、COA。',
    // 原料名单列一条,因为它是最容易被"顺手翻掉"的:
    // 采购手里的规格书、报关单、各国注册资料上写的都是 INCI 拉丁名,
    // 译成本地语或音译过去,他反而对不上自己的文件。
    '化妆品原料一律用 INCI 拉丁名原样输出(如 Sodium Hyaluronate、Niacinamide、Ceramide NP),不要翻译、不要音译、不要加注本地语名称。',
  ].filter(Boolean).join('');
}

/**
 * 一段自由文本是否合格地用了目标语言。
 *
 * 和 scriptProblems 的差别是**输入形状**:那个收的是「下标→译文」的批次表,
 * 这个收的是模型直接吐出来的一段话(测肤建议、选品方案)。
 * 但判据是同一套 —— 因为坏法也是同一套:
 *   AI 智造工作室实测给韩语访客回过「청凉爽한肤感」,韩文里夹着中文;
 *   而那条链上原本一道闸门都没有,模型吐什么就原样发给客户。
 *   页面翻得再好,一点 AI 功能蹦出这种东西,专业感就没了。
 */
export function proseLanguageOk(lang: string | undefined, text: string): boolean {
  const t = String(text || '').trim();
  if (t.length < 12) return false;
  const to = lang && TARGETS[lang] ? lang : 'en';

  const re = SCRIPT_OF[to];
  if (re) {
    // 目标语言有自己的文字:正文里必须真的出现,且要占得住 —— 只蹦出一两个字不算
    const hits = (t.match(new RegExp(re.source, 'gu')) || []).length;
    if (hits < t.length * 0.15) return false;
  } else {
    const sw = STOPWORDS[to];
    if (sw) {
      const words = new Set(t.toLowerCase().split(/[^\p{L}]+/u));
      if (!sw.some((w) => words.has(w))) return false;
    }
  }
  if (NO_HAN.has(to) && /[一-鿿]/.test(t.replace(/帛卉/g, ''))) return false;
  if (GLUED.test(t)) return false;
  return true;
}

/**
 * 对客生成的统一入口:自动带上语言规则,并且**校验完再返回**。
 *
 * 逐家试,第一家交出合格文本就用它;全都不合格时返回最长的那一版
 * (总比空白强),但会把情况打进日志。
 */
export async function chatInLanguage(
  env: FleetEnv,
  fleet: Provider[],
  lang: string | undefined,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const ordered = orderFleetFor(lang ?? 'en', fleet);
  let fallback = '';
  for (const p of ordered) {
    try {
      const r = await chat(env, messages, { ...opts, fleet: [p] });
      const txt = String(r.text || '').trim();
      if (proseLanguageOk(lang, txt)) return txt;
      if (txt.length > fallback.length) fallback = txt;
    } catch { /* 换下一家 */ }
  }
  if (fallback) console.warn(`[ai] ${lang}:${ordered.length} 家都没交出合格的目标语言文本,退而用最完整的一版`);
  return fallback;
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
