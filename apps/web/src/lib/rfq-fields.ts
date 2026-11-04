/**
 * Market① RFQ 字段（SEA / GCC / Halal-ready / 通告协助国 / 首单区间）。
 * rfq/index.astro 与 /api/inquiry 共用，tools/rfq-fields.test.mjs 直接 import。
 *
 * 只问需求，不写死价、不写死交期、不自动报价。
 * Halal 只问是否需要 ready；禁止展示「Halal certified」。
 * 通告国家是 filing / notification assist，不是代办承诺，也不是获批保证。
 * 持证只列 GMPC / ISO 22716 / HALAL；备案与通告另栏。
 */
import { publicSample } from './comply-copy.ts';

export const TARGET_MARKETS = ['SEA', 'GCC', 'EU', 'Other'] as const;
export const HALAL_READY = ['yes', 'no', 'unsure'] as const;
export const NOTIFY_COUNTRIES = ['ID', 'MY', 'TH', 'VN', 'AE', 'SA', 'EU', 'Other'] as const;
export const ORDER_BANDS = ['sample', '<1k', '1k-5k', '5k-20k', '>20k', 'tbd'] as const;
export const YES_NO = ['yes', 'no'] as const;
/** 配方路径只做页面选项。不是五键以外的新必填字段。 */
export const FORMULA_PATHS = ['ready', 'tweak', 'new'] as const;
export const RFQ_DOORS = ['sample', 'quote', 'docs'] as const;

export type FormulaPath = (typeof FORMULA_PATHS)[number];
export type RfqDoor = (typeof RFQ_DOORS)[number];

const SEA_CC = ['ID', 'MY', 'TH', 'VN'];
const GCC_CC = ['AE', 'SA'];
const MULTI_KEYS = new Set(['target_market', 'notification_assist_country']);

export interface RfqHooks {
  spf_pa: string;
  texture: string;
  skin_type: string;
}

export interface RfqTicket {
  target_market: string;
  halal_ready: string;
  halal_scope_note: string;
  notification_assist_country: string;
  first_order_band: string;
  need_msds_coa: string;
  need_written_lead_confirm: string;
  lead_time_window_note: string;
  spf_pa: string;
  texture: string;
  skin_type: string;
}

export interface RfqTicketResult {
  ok: boolean;
  msg: string;
  fields: RfqTicket;
}

const CJK = /[一-鿿]/;

function clip(v: unknown, n: number): string {
  const s = String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, n);
  if (!s || /^(?:-|—|–|n\/a|na|none)$/i.test(s)) return '';
  return s;
}

function asList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap((x) => asList(x));
  return String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** 表单里同名多选会被后值覆盖；多选键按出现顺序拼成逗号串。 */
export function assignInquiryField(bag: Record<string, string>, key: string, value: string): void {
  if (MULTI_KEYS.has(key) && bag[key]) bag[key] = `${bag[key]},${value}`;
  else bag[key] = value;
}

function packMulti(raw: unknown, allowed: readonly string[], otherText: unknown, otherMax: number): string {
  const chosen = new Set<string>();
  let detail = clip(otherText, otherMax).replace(/[,;]/g, ' ');
  for (const part of asList(raw)) {
    if (part === 'Other' || part.startsWith('Other:')) {
      chosen.add('Other');
      if (!detail && part.startsWith('Other:')) detail = clip(part.slice(6), otherMax).replace(/[,;]/g, ' ');
      continue;
    }
    if (allowed.includes(part)) chosen.add(part);
  }
  return allowed
    .filter((k) => chosen.has(k))
    .map((k) => (k === 'Other' && detail ? `Other:${detail}` : k))
    .join(',');
}

function oneOf(raw: unknown, allowed: readonly string[]): string {
  const v = String(raw ?? '').trim();
  return allowed.includes(v) ? v : '';
}

export function leadTimeWindowNote(zh: boolean): string {
  const interval = zh
    ? '交期只给区间，并以书面确认为准。'
    : 'Lead time is an interval only, and only after written confirmation.';
  return zh ? `${interval}${publicSample(zh)}` : `${interval} ${publicSample(zh)}`;
}

export function rfqFieldCopy(zh: boolean) {
  return zh
    ? {
        targetMarket: '目标市场',
        targetMarketHint: '至少选一项。SEA 东南亚、GCC 海湾、EU 欧盟，或其他请写明。',
        other: '其他',
        otherPh: '其他市场（可选）',
        country: '国家或城市',
        countryPh: '例：印尼、美国、沙特',
        notify: '备案 / 通告协助国家',
        notifyHint: '通告 / 备案协助：只协助准备工厂侧资料。这不是代办承诺，也不保证获批。',
        halal: '是否需要清真就绪（Halal-ready）配方/产线能力？',
        halalHint: '只询问需求（原料、成品或工厂哪一层）。不表示本品已有清真证书。',
        halalYes: '需要',
        halalNo: '不需要',
        halalUnsure: '还不确定',
        halalScope: '清真范围（可选）',
        halalScopePh: '原料、成品或工厂，哪一层需要',
        held: '工厂已持有认证仅列 GMPC、ISO 22716、HALAL（范围以证书为准）。备案与通告是协助，与持证分开，不是获批保证。',
        band: '预估首单量区间',
        bandPh: '选择区间（可待定）',
        bandOpt: {
          sample: '仅样品',
          '<1k': '1,000 以下',
          '1k-5k': '1,000–5,000',
          '5k-20k': '5,000–20,000',
          '>20k': '20,000 以上',
          tbd: '待定',
        } as Record<string, string>,
        bandHint: '只收区间，不在此报价。',
        msds: '需要进口文件包（MSDS/COA）？',
        msdsYes: '需要',
        msdsNo: '暂不需要',
        leadConfirm: '需要书面确认交期',
        leadConfirmHint: '建议勾选。交期以书面确认为准，本表不承诺具体天数。',
        spf: 'SPF / PA',
        texture: '肤感',
        skin: '肤质',
        needMarket: '请至少选择一个目标市场（SEA、GCC、EU 或其他）。',
        pleaseSpecifyMarket: '请写明目标市场',
        needBand: '请选择首单量区间',
        needNotify: '请写明备案协助国家',
        pathLead: '先选配方路径（现成 / 改方 / 全新），再选样品、报价区间询或文件包入口。',
        pathLegend: '配方路径',
        pathOpt: {
          ready: { name: '现成 · 已有完整配方', guide: '可在备注附上 INCI 或工艺摘要。' },
          tweak: { name: '改方 · 在现有配方上改方', guide: '写明要改的活性物、肤感或宣称边界。' },
          new: { name: '全新 · 全新配方开发', guide: '写目标市场、肤质和宣称边界。不写功效断言。' },
        },
        doorsLabel: '样品、报价区间或文件包',
        doorOpt: {
          sample: { name: '申请样品', hint: '建议把首单区间选为「仅样品」。样品费用以书面确认为准，本页不列固定样品费。' },
          quote: { name: '询报价区间', hint: '只询区间，并以书面回复为准。提交不会自动生成报价，本页不列固定目录价。' },
          docs: { name: '申请文件包', hint: '建议勾选需要 MSDS/COA。文件包是协助，不是获批。' },
        },
        complyLine: '备案协助不是获批。清真就绪不是证书。',
      }
    : {
        targetMarket: 'Target market',
        targetMarketHint: 'Select at least one: SEA, GCC, EU, or Other.',
        other: 'Other',
        otherPh: 'Other market (optional)',
        country: 'Country or city',
        countryPh: 'e.g. Indonesia, US, Saudi Arabia',
        notify: 'Filing / notification assist country',
        notifyHint: 'Filing / notification assist only: we can assist with factory-side documents. This is not a promise to file on your behalf and not an approval guarantee.',
        halal: 'Halal-ready needed?',
        halalHint: 'This only asks whether you need it (ingredient, finished goods, or plant). It does not say this item already has a halal certificate.',
        halalYes: 'Yes',
        halalNo: 'No',
        halalUnsure: 'Not sure',
        halalScope: 'Halal scope (optional)',
        halalScopePh: 'Ingredient, finished goods, or plant — which layer',
        held: 'Factory certifications held: GMPC, ISO 22716 and HALAL only (scope as on the certificate). Filings and notifications are assist only, kept separate from held certificates, and are not an approval guarantee.',
        band: 'Est. first order volume',
        bandPh: 'Select a band (to be confirmed is fine)',
        bandOpt: {
          sample: 'Sample only',
          '<1k': 'Under 1,000',
          '1k-5k': '1,000–5,000',
          '5k-20k': '5,000–20,000',
          '>20k': 'Over 20,000',
          tbd: 'To be confirmed',
        } as Record<string, string>,
        bandHint: 'A band only. This form does not quote a price.',
        msds: 'Need import file pack (MSDS/COA)?',
        msdsYes: 'Yes',
        msdsNo: 'Not now',
        leadConfirm: 'Need written lead-time confirmation',
        leadConfirmHint: 'On by default. Lead time is confirmed in writing. This form does not promise a number of days.',
        spf: 'SPF / PA',
        texture: 'Texture',
        skin: 'Skin type',
        needMarket: 'Select at least one target market (SEA, GCC, EU or Other).',
        pleaseSpecifyMarket: 'Please specify market',
        needBand: 'Select estimated first order volume',
        needNotify: 'Please specify notification assist country',
        pathLead: 'Tell us your formula path — ready, tweak, or new — then pick Sample / Quote / Docs below.',
        pathLegend: 'Formula path',
        pathOpt: {
          ready: { name: 'Ready · We have a finished formula', guide: 'You can add an INCI list or a process summary in notes.' },
          tweak: { name: 'Tweak · Adapt an existing formula', guide: 'Name the active, texture, or claim boundary you want changed.' },
          new: { name: 'New · Develop a new formula', guide: 'Share the target market, skin type, and claim boundary. No efficacy claims.' },
        },
        doorsLabel: 'Sample, quote band, or docs',
        doorOpt: {
          sample: { name: 'Request sample', hint: 'Suggests the first-order band “Sample only”. Sample fees are confirmed in writing; this page does not list a fixed sample fee.' },
          quote: { name: 'Request quote band', hint: 'A volume band plus a written reply. Submitting does not generate an automatic quote, and this page does not list a fixed catalog price.' },
          docs: { name: 'Request docs pack', hint: 'Suggests MSDS/COA = yes. The pack is filing assistance, not an approval.' },
        },
        complyLine: 'Filing assist is not approval. Halal-ready is not a certificate.',
      };
}

/** 只接受三选一。其它词（含 certified）丢掉，避免写进备注。 */
export function formulaPathToken(raw: unknown): FormulaPath | '' {
  const v = String(raw ?? '').trim().toLowerCase();
  return (FORMULA_PATHS as readonly string[]).includes(v) ? (v as FormulaPath) : '';
}

/** 落库时只给备注加前缀，不新增五键以外的字段。已有同一行则不重复。 */
export function prefixFormulaPath(notes: string, raw: unknown): string {
  const token = formulaPathToken(raw);
  if (!token) return notes;
  const line = `formula_path=${token}`;
  if (notes.includes(line)) return notes;
  const body = notes.trim();
  return body ? `${line}\n${body}` : line;
}

/**
 * intent 只提示既有字段，不造新键，也不改枚举。
 * sample → 建议 first_order_band=sample（调用方仅在当前为空时预填）。
 * docs → 建议 need_msds_coa=yes（同样不覆盖已选）。
 * quote → 只强调区间和书面回复，不填价格、不自动报价。
 */
export function rfqIntentEffect(intent: string): {
  door: RfqDoor | '';
  suggestBand: 'sample' | '';
  suggestMsds: 'yes' | '';
  emphasizeQuote: boolean;
} {
  const id = intent.trim().toLowerCase();
  if (id === 'sample') return { door: 'sample', suggestBand: 'sample', suggestMsds: '', emphasizeQuote: false };
  if (id === 'docs') return { door: 'docs', suggestBand: '', suggestMsds: 'yes', emphasizeQuote: false };
  if (id === 'quote') return { door: 'quote', suggestBand: '', suggestMsds: '', emphasizeQuote: true };
  return { door: '', suggestBand: '', suggestMsds: '', emphasizeQuote: false };
}

const DOOR_KEEP = [
  'product_id', 'category', 'market', 'about', 'formula',
  'spf_pa', 'texture', 'skin_type', 'target_market',
  'halal_ready', 'notification_assist_country',
  'first_order_band', 'need_msds_coa',
] as const;

/** 三个入口回到同一 RFQ。保留已有产品/市场参数，只替换 intent。 */
export function rfqDoorHref(lang: string, door: RfqDoor, search = ''): string {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const sp = new URLSearchParams(raw);
  const out = new URLSearchParams();
  for (const key of DOOR_KEEP) {
    const v = sp.get(key);
    if (v && v.trim()) out.set(key, v);
  }
  out.set('intent', door);
  const locale = String(lang || 'en').trim() || 'en';
  return `/${locale}/rfq/?${out.toString()}`;
}

/** 深链 ?market= 只在整段就是区域或国家码时预勾，避免把自由文本误当成 SEA。 */
export function rfqPrefill(market: string): { target_market: string[]; notification_assist_country: string[] } {
  const token = market.trim().toUpperCase();
  const target: string[] = [];
  const notify: string[] = [];
  if (token === 'SEA' || token === 'GCC' || token === 'EU') target.push(token);
  else if (token === 'OTHER') target.push('Other');
  else if (SEA_CC.includes(token)) { target.push('SEA'); notify.push(token); }
  else if (GCC_CC.includes(token)) { target.push('GCC'); notify.push(token); }
  if (token === 'EU') notify.push('EU');
  return { target_market: target, notification_assist_country: notify };
}

/**
 * ?target_market= 只预勾 SEA / GCC / EU / Other，不写入国家或城市文本框。
 * 与 ?market= 合并；国家码带来的通告协助国仍只来自 market。
 */
export function rfqQueryPrefill(input: { market?: string; target_market?: string }): { target_market: string[]; notification_assist_country: string[] } {
  const fromMarket = rfqPrefill(input.market ?? '');
  const chosen = new Set(fromMarket.target_market);
  for (const part of asList(input.target_market)) {
    const token = part.trim().toUpperCase();
    if (token === 'SEA' || token === 'GCC' || token === 'EU') chosen.add(token);
    else if (token === 'OTHER') chosen.add('Other');
  }
  return {
    target_market: TARGET_MARKETS.filter((id) => chosen.has(id)),
    notification_assist_country: fromMarket.notification_assist_country,
  };
}

export interface RfqLinkPrefill {
  target_market: string[];
  notification_assist_country: string[];
  halal_ready: string;
  first_order_band: string;
  need_msds_coa: string;
}

/**
 * 产品深链上的勾选预填。
 * ?notification_assist_country= 与 ?market= 里的国家码合并。
 * halal_ready / first_order_band / need_msds_coa 只接受表单允许的值，certified 这类词丢掉。
 */
export function rfqLinkPrefill(input: {
  market?: string;
  target_market?: string;
  halal_ready?: string;
  notification_assist_country?: string;
  first_order_band?: string;
  need_msds_coa?: string;
}): RfqLinkPrefill {
  const base = rfqQueryPrefill({ market: input.market, target_market: input.target_market });
  const notify = new Set(base.notification_assist_country);
  for (const part of asList(input.notification_assist_country)) {
    const token = part.trim().toUpperCase();
    if ((NOTIFY_COUNTRIES as readonly string[]).includes(token)) notify.add(token);
    else if (token === 'OTHER') notify.add('Other');
  }
  return {
    target_market: base.target_market,
    notification_assist_country: NOTIFY_COUNTRIES.filter((id) => notify.has(id)),
    halal_ready: oneOf(input.halal_ready, HALAL_READY),
    first_order_band: oneOf(input.first_order_band, ORDER_BANDS),
    need_msds_coa: oneOf(input.need_msds_coa, YES_NO),
  };
}

function hookFromLabel(label: string): keyof RfqHooks | null {
  const l = label.toLowerCase();
  if (/spf|pa\+|防晒/.test(l)) return 'spf_pa';
  if (/texture|肤感|质地/.test(l)) return 'texture';
  if (/skin[\s_-]*type|肤质|适用肤/.test(l)) return 'skin_type';
  return null;
}

function hooksFromSpecs(specs: unknown): RfqHooks {
  const out: RfqHooks = { spf_pa: '', texture: '', skin_type: '' };
  const take = (key: keyof RfqHooks, value: unknown, n: number) => {
    if (!out[key]) out[key] = clip(value, n);
  };
  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const row of node) visit(row);
      return;
    }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const label = o.label ?? o.name;
    const value = o.value ?? o.text;
    if (typeof label === 'string' && value != null && (typeof value === 'string' || typeof value === 'number')) {
      const key = hookFromLabel(label);
      if (key) take(key, value, key === 'texture' ? 80 : 40);
    }
    if (!out.spf_pa && (o.spf_pa != null || o.spf != null || o.pa != null)) {
      const direct = clip(o.spf_pa, 40);
      if (direct) out.spf_pa = direct;
      else {
        const spf = clip(o.spf, 20);
        const pa = clip(o.pa, 20);
        const spfBit = !spf ? '' : /^spf/i.test(spf) ? spf : `SPF ${spf}`;
        const paBit = !pa ? '' : /^pa/i.test(pa) ? pa : `PA${pa}`;
        out.spf_pa = clip([spfBit, paBit].filter(Boolean).join(' '), 40);
      }
    }
    if (!out.texture && o.texture != null) take('texture', o.texture, 80);
    if (!out.skin_type && (o.skin_type != null || o.skinType != null)) take('skin_type', o.skin_type ?? o.skinType, 40);
    if (Array.isArray(o.specs)) visit(o.specs);
  };
  visit(specs);
  return out;
}

/** 无产品上下文，或三项都空，调用方应整块隐藏。 */
export function rfqProductHooks(input: {
  hasContext: boolean;
  specsJson?: string | null;
  query?: Partial<RfqHooks>;
  hideCjk?: boolean;
}): RfqHooks {
  const empty: RfqHooks = { spf_pa: '', texture: '', skin_type: '' };
  if (!input.hasContext) return empty;
  let parsed: unknown = null;
  if (input.specsJson) {
    try { parsed = JSON.parse(input.specsJson); } catch { parsed = null; }
  }
  const from = hooksFromSpecs(parsed);
  const q = input.query ?? {};
  const out: RfqHooks = {
    spf_pa: clip(q.spf_pa, 40) || from.spf_pa,
    texture: clip(q.texture, 80) || from.texture,
    skin_type: clip(q.skin_type, 40) || from.skin_type,
  };
  if (input.hideCjk) {
    (Object.keys(out) as (keyof RfqHooks)[]).forEach((k) => {
      if (CJK.test(out[k])) out[k] = '';
    });
  }
  return out;
}

export function emptyRfqTicket(): RfqTicket {
  return {
    target_market: '',
    halal_ready: '',
    halal_scope_note: '',
    notification_assist_country: '',
    first_order_band: '',
    need_msds_coa: '',
    need_written_lead_confirm: '0',
    lead_time_window_note: '',
    spf_pa: '',
    texture: '',
    skin_type: '',
  };
}

/** 规范化 RFQ 附加字段。缺 target_market 时 ok=false，调用方应拒绝提交。 */
export function normalizeRfqTicket(f: Record<string, unknown>, zh: boolean): RfqTicketResult {
  const fields = emptyRfqTicket();
  fields.target_market = packMulti(f.target_market, TARGET_MARKETS, f.target_market_other, 80);
  fields.halal_ready = oneOf(f.halal_ready, HALAL_READY);
  fields.halal_scope_note = fields.halal_ready === 'yes' ? clip(f.halal_scope_note, 200) : '';
  fields.notification_assist_country = packMulti(f.notification_assist_country, NOTIFY_COUNTRIES, f.notification_assist_other, 80);
  fields.first_order_band = oneOf(f.first_order_band, ORDER_BANDS);
  fields.need_msds_coa = oneOf(f.need_msds_coa, YES_NO);
  const lead = String(f.need_written_lead_confirm ?? '').trim().toLowerCase();
  fields.need_written_lead_confirm = lead === '1' || lead === 'on' || lead === 'true' || lead === 'yes' ? '1' : '0';
  fields.lead_time_window_note = leadTimeWindowNote(zh);
  const hooks = rfqProductHooks({
    hasContext: true,
    query: {
      spf_pa: String(f.spf_pa ?? ''),
      texture: String(f.texture ?? ''),
      skin_type: String(f.skin_type ?? ''),
    },
  });
  fields.spf_pa = hooks.spf_pa;
  fields.texture = hooks.texture;
  fields.skin_type = hooks.skin_type;
  if (!fields.target_market) {
    return { ok: false, msg: rfqFieldCopy(zh).needMarket, fields };
  }
  return { ok: true, msg: '', fields };
}

const TICKET_KEYS = [
  'target_market',
  'halal_ready',
  'halal_scope_note',
  'notification_assist_country',
  'first_order_band',
  'need_msds_coa',
  'need_written_lead_confirm',
  'lead_time_window_note',
  'spf_pa',
  'texture',
  'skin_type',
] as const;

/** 写入询盘正文的稳定 key=value 行。空值不写；书面交期确认的 0 要留下。 */
export function rfqTicketLines(fields: RfqTicket): string[] {
  return TICKET_KEYS
    .filter((k) => fields[k] !== '')
    .map((k) => `${k}=${fields[k]}`);
}
