/**
 * 买手问答详情的 Article JSON-LD（GEO-012）。
 *
 * FAQPage 与 BreadcrumbList 仍由页面自己发，这里只补 Article 缺的三块：
 * datePublished、publisher、image。Organization 全站只在 BaseLayout 出现一次，
 * 所以 publisher / author 只放 `@id`，不嵌第二份 Organization。
 *
 * geo_answers 只有 updated_at。发布日与修改日都用这一列，日历日与页上
 * 「更新于」那一行相同。库存的是无时区的 `YYYY-MM-DD HH:MM:SS`（或仅日期），
 * 这里改成带 +08:00 的 ISO8601，不挪时钟，避免 schema 的日期和可见日期差一天。
 */

/** 与 BaseLayout 未传 ogImage 时的默认图同一路径。 */
export const DEFAULT_OG_PATH = '/media/57';

const HAS_ZONE = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

/** 库存时间 → ISO8601。无法识别时返回空串，调用方不要编一个日期。 */
export function answerIso8601(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (HAS_ZONE.test(s)) return s.replace(/^(\d{4}-\d{2}-\d{2})[ T]/, '$1T');
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}T00:00:00+08:00`;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}+08:00`;
  return '';
}

function absoluteImage(origin: string, image: string | null | undefined): string {
  const raw = String(image ?? '').trim();
  if (!raw) return `${origin}${DEFAULT_OG_PATH}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

export function answerArticleJsonLd(o: {
  origin: string;
  path: string;
  headline: string;
  description: string;
  updatedAt: string;
  /** 单独的首发时间。没有就用 updatedAt。 */
  publishedAt?: string | null;
  /** 页面主图。空则用站点默认 OG。 */
  image?: string | null;
  /**
   * 作者显示名。空则用 Organization 的 @id。
   * 传名字时是字符串，不再包一层 Organization。
   */
  authorName?: string | null;
}): Record<string, unknown> {
  const origin = o.origin.replace(/\/$/, '');
  const orgId = `${origin}/#organization`;
  const published = answerIso8601(o.publishedAt || o.updatedAt);
  const modified = answerIso8601(o.updatedAt || o.publishedAt || '');
  const authorName = String(o.authorName ?? '').trim();
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: o.headline,
    description: o.description,
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    image: absoluteImage(origin, o.image),
    publisher: { '@id': orgId },
    author: authorName || { '@id': orgId },
    mainEntityOfPage: `${origin}${o.path}`,
  };
}
