/**
 * B-COMPLY display guard (2026-11-04).
 * Mother copy is /en/services/: factory certs are GMPC, ISO 22716:2007, HALAL only.
 * FDA / CPNP are filing assistance, never factory certifications.
 * SGS is third-party testing. CE is not held.
 * Product display names are catalog labels, not marketable claims.
 * Cards never render a dead point MOQ (including 3000).
 */

export type CertSlot = 'gmpc' | 'iso' | 'halal' | 'fda' | 'cpnp';

export interface CertItem {
  label?: string;
  note?: string;
  image?: string;
  name?: string;
  title?: string;
}

export interface CatalogName {
  name: string;
  /** Display string differs from the stored catalog name, or the row is a claim label. */
  claim: boolean;
  /** Hard medical / body-shape label: show a delist-review marker. */
  delist: boolean;
}

const BANNED_IMAGE = '/media/155';

export function certWallCopy(zh: boolean) {
  return zh
    ? {
        title: '工厂已有认证（仅列真有）',
        lede: '按工厂口径仅列出：GMPC、ISO 22716:2007、HALAL。FDA / CPNP 等为注册或通报路径，不作「认证」口号。注册≠批准、不发证书。',
        factory: '工厂认证（仅持有）',
        filing: '备案与协助（不是工厂认证）',
        other: '其他在档文件（不是工厂认证）',
        sgs: 'SGS 为第三方检测，不列入工厂持证清单。',
        held: '范围以证书原件为准',
        fda: '设施注册协助，不是工厂认证。注册≠批准、不发证书。',
        cpnp: '产品通报协助，不是工厂认证',
      }
    : {
        title: 'Plant certifications on file (held only)',
        lede: 'Per factory terms we list only: GMPC, ISO 22716:2007, and HALAL. FDA / CPNP are registration or notification routes — never marketed as plant certifications. Registration is not approval, and no certificate is issued.',
        factory: 'Factory certifications (held only)',
        filing: 'Filings and assistance (not factory certifications)',
        other: 'Other documents on file (not factory certifications)',
        sgs: 'SGS is third-party testing, not a held factory certificate.',
        held: 'Scope as stated on the certificate',
        fda: 'Facility registration assistance, not a factory certification. Registration is not approval, and no certificate is issued.',
        cpnp: 'Product notification assistance — not a factory certification',
      };
}

export function itemLabel(it: CertItem): string {
  return String(it?.label ?? it?.name ?? it?.title ?? '').trim();
}

export function certSlot(label: string): CertSlot | null {
  const s = label.toLowerCase();
  if (/gmpc/.test(s)) return 'gmpc';
  if (/iso\s*22716|iso22716/.test(s)) return 'iso';
  if (/halal|清真/.test(s)) return 'halal';
  if (/\bfda\b|美国\s*fda|u\.s\.\s*fda/.test(s)) return 'fda';
  if (/cpnp/.test(s)) return 'cpnp';
  return null;
}

function isCe(label: string): boolean {
  return /\bce\b|欧盟\s*ce|ce\s*认证/i.test(label) && !/cpnp/i.test(label);
}

function isSgs(label: string): boolean {
  return /sgs|intertek/i.test(label);
}

function isUnheldIso(label: string): boolean {
  return /iso\s*9001|iso\s*14001/i.test(label);
}

/** A procgrid / cert list that mixes plant certs with filings. */
export function isCertWall(title: string, items: CertItem[]): boolean {
  const slots = new Set<CertSlot>();
  for (const it of items) {
    const slot = certSlot(itemLabel(it));
    if (slot) slots.add(slot);
  }
  const factoryN = (['gmpc', 'iso', 'halal'] as CertSlot[]).filter((s) => slots.has(s)).length;
  const filingN = (['fda', 'cpnp'] as CertSlot[]).filter((s) => slots.has(s)).length;
  const titleHit = /certif|资质|认证|qualification|credential/i.test(title);
  return (factoryN + filingN) >= 2 && (titleHit || (factoryN >= 1 && filingN >= 1));
}

export interface CertPartition {
  factory: CertItem[];
  filing: CertItem[];
  other: CertItem[];
  sawSgs: boolean;
}

const FACTORY_ORDER: CertSlot[] = ['gmpc', 'iso', 'halal'];
const FILING_ORDER: CertSlot[] = ['fda', 'cpnp'];

function factorySeed(slot: CertSlot, zh: boolean): CertItem {
  const c = certWallCopy(zh);
  if (slot === 'gmpc') return { label: 'GMPC', note: c.held };
  if (slot === 'iso') return { label: 'ISO 22716:2007', note: c.held };
  return { label: 'HALAL', note: c.held };
}

function filingSeed(slot: CertSlot, zh: boolean): CertItem {
  const c = certWallCopy(zh);
  if (slot === 'fda') return { label: zh ? '美国 FDA' : 'US FDA', note: c.fda };
  return { label: 'EU CPNP', note: c.cpnp };
}

/** Split a mixed cert grid. Does not invent certificate scans. Missing held certs are text-only. */
export function partitionCertWall(items: CertItem[], zh: boolean): CertPartition {
  const c = certWallCopy(zh);
  const factory = new Map<CertSlot, CertItem>();
  const filing = new Map<CertSlot, CertItem>();
  const other: CertItem[] = [];
  let sawSgs = false;

  for (const raw of items) {
    const label = itemLabel(raw);
    if (!label) continue;
    if (String(raw.image ?? '') === BANNED_IMAGE) continue;
    if (isCe(label) || isUnheldIso(label)) continue;
    if (isSgs(label)) { sawSgs = true; continue; }
    const slot = certSlot(label);
    const image = raw.image && raw.image !== BANNED_IMAGE ? raw.image : undefined;
    if (slot === 'gmpc' || slot === 'iso' || slot === 'halal') {
      if (!factory.has(slot)) {
        factory.set(slot, {
          label: slot === 'iso' ? 'ISO 22716:2007' : slot === 'gmpc' ? 'GMPC' : 'HALAL',
          note: slot === 'halal' ? c.held : (raw.note || c.held),
          image,
        });
      }
      continue;
    }
    if (slot === 'fda' || slot === 'cpnp') {
      if (!filing.has(slot)) {
        filing.set(slot, {
          label: slot === 'fda' ? (zh ? '美国 FDA' : 'US FDA') : 'EU CPNP',
          note: slot === 'fda' ? c.fda : c.cpnp,
          image,
        });
      }
      continue;
    }
    other.push({ label, note: raw.note, image });
  }

  for (const slot of FACTORY_ORDER) {
    if (!factory.has(slot)) factory.set(slot, factorySeed(slot, zh));
  }
  for (const slot of FILING_ORDER) {
    if (!filing.has(slot)) filing.set(slot, filingSeed(slot, zh));
  }

  return {
    factory: FACTORY_ORDER.map((s) => factory.get(s)!),
    filing: FILING_ORDER.map((s) => filing.get(s)!),
    other,
    sawSgs,
  };
}

const HELD_ANSWER = {
  zh: '工厂持有认证仅列：GMPC、ISO 22716:2007、HALAL（范围以证书原件为准）。FDA 工厂注册与 EU CPNP 是备案或通报协助，不是工厂认证。注册≠批准、不发证书。SGS 为第三方检测，不列入持证清单。编号与有效期凭原件提供。',
  en: 'Factory certifications held: GMPC, ISO 22716:2007 and HALAL only (scope as stated on each certificate). FDA facility registration and EU CPNP are filing or notification assistance, not factory certifications. Registration is not approval, and no certificate is issued. SGS reports are third-party tests and are not part of the held-certificate list. Numbers and validity are shared from the originals.',
};

/** Rewrite a cert inventory that lists filings or SGS/CE in the same held-certs sentence. */
export function rewriteHeldCertAnswer(text: string, zh: boolean): string {
  const t = String(text ?? '');
  if (/不是工厂认证|not a factory certification|never marketed as plant/i.test(t)) {
    if (/注册≠批准|registration is not approval/i.test(t)) return t;
    if (/\bFDA\b|美国\s*FDA/i.test(t)) {
      const zhClause = '注册≠批准、不发证书。';
      const enClause = 'Registration is not approval, and no certificate is issued.';
      return zh ? `${t}${zhClause}` : `${t} ${enClause}`;
    }
    return t;
  }
  if (!/GMPC/i.test(t)) return t;
  if (t.length > 700) return t;
  const mixed = /(FDA|SGS|\bCE\b|CPNP)/i.test(t);
  if (!mixed) return t;
  if (!/(hold|certif|认证|持有|资质|注册)/i.test(t)) return t;
  return zh ? HELD_ANSWER.zh : HELD_ANSWER.en;
}

export function claimNote(zh: boolean): string {
  return zh
    ? '展示名 ≠ 可宣称功效。标签宣称受目标市场规则与第三方报告限制；无报告则不上标签。'
    : 'Display name ≠ marketable claim. Label claims follow target-market rules and a third-party report; no report, no label claim.';
}

export function publicMoq(zh: boolean): string {
  return zh
    ? '起订量按品类与包材议定（书面确认）'
    : 'MOQ by category and packaging (confirmed in writing)';
}

export function publicSample(zh: boolean): string {
  return zh
    ? '打样通常 5–14 天（样品指示，书面确认；非大货交期）'
    : 'Sampling typically 5–14 days (sample indication, confirmed in writing; not a production lead time)';
}

/** Word-level claim softening. Does not replace a whole sentence. */
export function softenClaims(text: string): string {
  let s = String(text ?? '');
  s = s.replace(/acne\s*clear/gi, 'Blemish-prone');
  s = s.replace(/acne\s*treatment/gi, 'Blemish-prone care');
  s = s.replace(/anti[-\s]?itch/gi, 'Soothing');
  s = s.replace(/\bwhitening\b/gi, 'Brightening');
  s = s.replace(/祛痘/g, '油痘肌护理');
  s = s.replace(/痤疮治疗/g, '油痘肌护理');
  s = s.replace(/美白/g, '亮肤');
  s = s.replace(/止痒/g, '舒缓');
  return s;
}

function tidy(s: string): string {
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.)])/g, '$1').replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
}

function markDelist(name: string, zh: boolean): string {
  if (/下架复核|delist review/i.test(name)) return name;
  return zh ? `${name}（下架复核）` : `${name} (delist review)`;
}

/** Catalog label for a product name. Hard medical names are neutralized or marked for delist review. */
export function catalogLabel(raw: string, zh: boolean): CatalogName {
  const original = String(raw ?? '').trim();
  if (!original) return { name: original, claim: false, delist: false };

  const kidsHard = /(kid|child|baby|infant|儿童|婴|幼儿)/i.test(original)
    && /(treatment|anti[-\s]?itch|\bitch\b|\brash\b|治疗|止痒|湿疹|疹)/i.test(original);
  const acneTx = /acne\s*treatment|痤疮治疗/i.test(original);
  const hardBody = /fat[-\s]?burn|slimming|\bslim\b|breast|bust[-\s]?enhanc|丰胸|瘦身|燃脂|减肥/i.test(original);

  let name = softenClaims(original);
  if (kidsHard) {
    name = name
      .replace(/\btreatment\b/gi, 'care')
      .replace(/\brash\b/gi, 'comfort')
      .replace(/治疗/g, '护理')
      .replace(/湿疹/g, '肌肤不适')
      .replace(/疹/g, '');
  }
  if (hardBody) {
    name = name
      .replace(/fat[-\s]?burn(?:ing|er)?/gi, '')
      .replace(/slimming/gi, '')
      .replace(/\bslim\b/gi, '')
      .replace(/breast|bust[-\s]?enhanc\w*/gi, '')
      .replace(/丰胸|瘦身|燃脂|减肥/g, '');
  }
  name = tidy(name);
  const delist = kidsHard || acneTx || hardBody;
  if (hardBody) {
    const leftover = name.replace(/\d+\s*(?:g|ml|pcs|支|片)?/gi, '').replace(/[×xX\d.+-]/g, '').trim();
    if (leftover.length < 2) name = zh ? '身体护理' : 'Body care';
  }
  if (!name) name = zh ? '目录品' : 'Catalog item';
  if (delist) name = markDelist(name, zh);
  const claim = delist || name !== original;
  return { name, claim, delist };
}
