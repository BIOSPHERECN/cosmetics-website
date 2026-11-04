/**
 * 沙特 GHAD 责任边界。
 *
 * 协助 = 文件包与资料清单。不替代沙特境内通知主体。
 * 海外 OEM 不能代开 GHAD。不写获批承诺，也不把协助写成代为提交。
 */

const LOCALE = /^[a-z]{2}(?:-[a-z]{2})?$/;

export interface GhadBoundaryCopy {
  text: string;
}

const ZH: GhadBoundaryCopy = {
  text: '若备案 / 通告协助国家包含沙特（SA）：协助仅限文件包与资料清单，不替代沙特境内的通知主体。海外 OEM 不能代开 GHAD。',
};

const EN: GhadBoundaryCopy = {
  text: 'If filing / notification assist includes Saudi Arabia (SA): assistance is a document pack and a checklist only. It does not replace the in-Kingdom notification entity. An overseas OEM cannot open a GHAD account.',
};

export function ghadBoundaryLocale(lang: string): string {
  const l = String(lang || '').trim().toLowerCase();
  return LOCALE.test(l) ? l : 'en';
}

export function ghadBoundaryCopy(lang: string): GhadBoundaryCopy {
  return ghadBoundaryLocale(lang).startsWith('zh') ? ZH : EN;
}

export function ghadBoundaryPlain(copy: GhadBoundaryCopy): string[] {
  return [copy.text];
}
