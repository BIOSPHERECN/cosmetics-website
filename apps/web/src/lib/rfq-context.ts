/**
 * RFQ 页怎么对待深链里的产品上下文。纯函数,给 rfq/index.astro 与 tools/rfq-context.test.mjs 共用。
 *
 * product_id 三种结果:
 *   missing — 有品名 / 配方 / 品类,但链接没带 id。表单仍可手填提交。
 *   bad     — id 含非法字符,或目录型 id 查库落空(配方/包材编码除外,那是链位单号不是成品 id)。
 *   ''      — 没有产品上下文,或 id 可用(查到成品、编码单号、或库暂时查不了所以不误报)。
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;
/** 链位 / 配方 / 包材编码,例如 SR-1101、AL-002-5。不是 products 表的 id。 */
const CODE_ID = /^[A-Z]{2,4}-[A-Z0-9-]{1,20}$/;

export type RfqLookup = 'skip' | 'found' | 'miss' | 'error';
export type RfqIdState = '' | 'missing' | 'bad';

export function rfqIdState(input: {
  productId: string;
  about: string;
  formula: string;
  category: string;
  lookup: RfqLookup;
}): RfqIdState {
  const id = input.productId.trim();
  const hasContext = Boolean(id || input.about.trim() || input.formula.trim() || input.category.trim());
  if (!hasContext) return '';
  if (!id) return 'missing';
  if (!SAFE_ID.test(id)) return 'bad';
  if (input.lookup === 'miss' && !CODE_ID.test(id)) return 'bad';
  return '';
}

/** 非法字符的 id 不查库(也避免把奇怪字符串送进比较)。 */
export function rfqCanLookup(productId: string): boolean {
  return SAFE_ID.test(productId.trim());
}

export function rfqHasContext(input: { productId: string; about: string; formula: string; category: string }): boolean {
  return Boolean(input.productId.trim() || input.about.trim() || input.formula.trim() || input.category.trim());
}
