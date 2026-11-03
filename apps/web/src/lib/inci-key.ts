/**
 * INCI 归一键 —— 与 `[lang]/ingredients/[slug].astro:50` 和 `tools/nmpa-catalog.py` 的 `inci_key()` 同一算法。
 *
 * 为什么去括号:国家目录把甘草写成 GLYCYRRHIZA GLABRA (LICORICE) ROOT EXTRACT,
 * 库里写的是 GLYCYRRHIZA GLABRA ROOT EXTRACT,不去括号精确匹配要掉 22 条。
 * 所以先剥掉中英文括号及其内容,再把非字母数字压成单个空格。
 * **不要**用 `api/admin/registry.ts` 那套(不去括号),两套键对不上。
 */
export function inciKey(s: string | null | undefined): string {
  return String(s ?? '').toUpperCase()
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
