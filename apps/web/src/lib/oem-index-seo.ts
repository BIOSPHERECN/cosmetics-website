/**
 * /{lang}/oem/ 的标题与面包屑（SEO-010）。
 *
 * 页内标题原来以 `| BIOSPHERE` 结尾，BaseLayout 再按站点名补 `| BIOSPHERE-AI`，
 * 结果是 `… | BIOSPHERE | BIOSPHERE-AI`。这里去掉末尾品牌，让布局只补一次，
 * 与首页同一条规则（站点名是 BIOSPHERE-AI 时，成品标题只剩一个 `| BIOSPHERE-AI`）。
 * 其它语种的 oem-index 译文是从带 `| BIOSPHERE` 的英文模板翻的，同样剥掉。
 *
 * 面包屑与页上可见的那一串用同一份名字：首页词用界面里的 nav.home，
 * 当前级优先用导航里 slug 为 oem 的栏目名，没有这条栏目时用 OEM。
 */

export interface OemNavNode {
  slug: string;
  label: string;
  children?: OemNavNode[];
}

export interface OemCrumb {
  name: string;
  /** 站内路径，可见链接与 BreadcrumbList 的 item 都用它 */
  path: string;
}

const BRAND_TAIL = /\s*[|｜]\s*(?:BIOSPHERE-AI|BIOSPHERE|帛卉化妆品|帛卉)\s*$/iu;

/** 去掉标题末尾已经写上的品牌后缀。中间出现的品牌名不动。 */
export function oemPageTitle(raw: string): string {
  let title = String(raw ?? '').trim();
  for (let i = 0; i < 2; i++) {
    const next = title.replace(BRAND_TAIL, '').trim();
    if (next === title) break;
    title = next;
  }
  return title;
}

function oemNavLabel(nodes: OemNavNode[] | undefined): string {
  for (const n of nodes ?? []) {
    const slug = String(n.slug ?? '').split('?')[0].replace(/\/+$/, '');
    if (slug === 'oem' || slug.endsWith('/oem')) {
      const label = String(n.label ?? '').trim();
      if (label) return label;
    }
    const child = oemNavLabel(n.children);
    if (child) return child;
  }
  return '';
}

/** 与可见面包屑同一顺序、同一名字。 */
export function oemIndexCrumbs(o: {
  lang: string;
  homeLabel: string;
  nav?: OemNavNode[];
}): OemCrumb[] {
  const prefix = `/${o.lang}`;
  const here = oemNavLabel(o.nav) || 'OEM';
  return [
    { name: o.homeLabel, path: `${prefix}/` },
    { name: here, path: `${prefix}/oem/` },
  ];
}
