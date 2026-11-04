/**
 * 认证三列表：市场 | 认证或协助项（仅已持有 / 可协助） | RFQ 必答。
 *
 * 工厂持证只沿用现网口径：GMPC、ISO 22716、HALAL（范围以证书原件为准）。
 * FDA / CPNP / GHAD 是协助，不是工厂认证。
 * 不画徽章，不把某一市场的清真要求写成当地认证已经取得。
 */

import { certWallCopy } from './comply-copy.ts';
import { ghadBoundaryCopy } from './ghad-boundary.ts';

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;

export interface CertMatrixRow {
  market: string;
  item: string;
  rfq: string;
}

export interface CertMatrixCopy {
  title: string;
  lede: string;
  colMarket: string;
  colItem: string;
  colRfq: string;
  rows: CertMatrixRow[];
}

function zhRows(ghad: string): CertMatrixRow[] {
  const held = '工厂已持有：GMPC、ISO 22716、HALAL（范围以证书原件为准，不表示目标市场主管机构已经接受该证）。';
  return [
    {
      market: '东南亚（印尼 / 马来西亚 / 泰国 / 越南）',
      item: `${held}通告协助只准备工厂侧资料。`,
      rfq: '目标市场、是否需要清真就绪、通告协助国家。',
    },
    {
      market: '海湾 · 阿联酋',
      item: `${held}阿联酋侧的资料协助不是当地通知主体。`,
      rfq: '目标市场选 GCC，并写明是否需要清真就绪、协助国家是否含 AE。',
    },
    {
      market: '海湾 · 沙特',
      item: `${held}${ghad}`,
      rfq: '协助国家是否为 SA，以及沙特境内通知主体是谁。',
    },
    {
      market: '美国',
      item: `工厂已持有：GMPC、ISO 22716。${certWallCopy(true).mocra}注册≠批准、不发证书。`,
      rfq: '是否需要 FDA 设施注册协助。',
    },
    {
      market: '欧盟',
      item: `${held}EU CPNP 是产品通报协助，不是工厂认证。`,
      rfq: '是否需要 CPNP 通报协助。',
    },
  ];
}

function enRows(ghad: string): CertMatrixRow[] {
  const held = 'Held at the plant: GMPC, ISO 22716, and HALAL (scope as on the certificate; this does not mean the target-market authority has accepted that certificate). ';
  return [
    {
      market: 'Southeast Asia (Indonesia / Malaysia / Thailand / Vietnam)',
      item: `${held}Notification assist prepares factory-side documents only.`,
      rfq: 'Target market, whether halal-ready is needed, and the notification-assist country.',
    },
    {
      market: 'Gulf · UAE',
      item: `${held}Document assist for the UAE is not the local notification entity.`,
      rfq: 'Select target market GCC, and say whether halal-ready is needed and whether assist includes AE.',
    },
    {
      market: 'Gulf · Saudi Arabia',
      item: `${held}${ghad}`,
      rfq: 'Whether the assist country is SA, and who the in-Kingdom notification entity is.',
    },
    {
      market: 'United States',
      item: `Held at the plant: GMPC and ISO 22716. ${certWallCopy(false).mocra} Registration is not approval, and no certificate is issued.`,
      rfq: 'Whether FDA facility-registration assist is needed.',
    },
    {
      market: 'European Union',
      item: `${held}EU CPNP is product-notification assistance, not a factory certification.`,
      rfq: 'Whether CPNP notification assist is needed.',
    },
  ];
}

export function certMatrixLocale(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  return LOCALE.test(l) ? l : 'en';
}

export function certMatrixCopy(lang: string): CertMatrixCopy {
  const zh = certMatrixLocale(lang).startsWith('zh');
  const ghad = ghadBoundaryCopy(lang).text;
  return zh
    ? {
        title: '市场认证对照（仅已持有 / 可协助）',
        lede: '只写工厂已经持有的证书，以及可以协助准备的资料。不展示未核实徽章。HALAL 只按工厂已持有的证书表述，不把其它市场的清真要求写成当地认证已经取得。',
        colMarket: '市场',
        colItem: '认证或协助项（仅已持有/可协助）',
        colRfq: 'RFQ 必答',
        rows: zhRows(ghad),
      }
    : {
        title: 'Market certification matrix (held or assistable only)',
        lede: 'Only certificates the plant already holds, and documents we can help prepare. No unverified badges. HALAL is stated only as a certificate the plant holds; another market’s halal requirement is not written as a local certificate already obtained.',
        colMarket: 'Market',
        colItem: 'Certification or assist item (held or assistable only)',
        colRfq: 'RFQ must answer',
        rows: enRows(ghad),
      };
}

export function certMatrixPlain(copy: CertMatrixCopy): string[] {
  return [
    copy.title, copy.lede, copy.colMarket, copy.colItem, copy.colRfq,
    ...copy.rows.flatMap((row) => [row.market, row.item, row.rfq]),
  ];
}
