/**
 * 产线链路 —— 三个库合并成一条有先后的链。
 *
 * 创始人 2026-09-07:
 *   「原料库、包材库、配方库,建议合并到一起,不要散开」
 *   「先包材,再配方,再包装盒,才有产品」「链路要清晰」
 *
 * 以前导航里是三个不相干的入口,采购点进任何一个都看不出还有另外两个,
 * 更看不出它们之间是什么关系。合并不必动 URL —— 三个库的地址原样保留
 * (改了等于把已收录的页全部作废),变的是每一页顶上都带着整条链。
 *
 * 序号在这里是真信息:工序确有先后。不是拿来当装饰的编号。
 *
 * 计数写成常量而不是每页查一次库:一个货架页多一条 COUNT 看着不多,
 * 乘以四个入口 × 十七个语种,就是 2026-09-07 那天把 D1 日读额度打爆的量级。
 * 数据变了跑 `python tools/chain-counts.py` 重新生成这一段。
 */
import type { ShelfTab } from '../components/ShelfPage.astro';

/** 由 tools/chain-counts.py 生成 —— 手改会在下次跑脚本时被覆盖 */
export const CHAIN_COUNTS = {
  packaging: 4476,
  carton: 15,
  formula: 317,
  ingredient: 142,
  product: 72,
} as const;

export type ChainHere = 'packaging' | 'carton' | 'formula' | 'ingredient' | 'product';

const L = {
  zh: { pack: '包材', carton: '包装盒', formula: '配方', ing: '原料', prod: '产品' },
  en: { pack: 'Containers', carton: 'Cartons', formula: 'Formulas', ing: 'Botanicals', prod: 'Products' },
};

export function buildChain(lang: string, here: ChainHere): ShelfTab[] {
  const t = lang.startsWith('zh') ? L.zh : L.en;
  const b = `/${lang}`;
  return [
    { step: 1, label: t.pack, count: CHAIN_COUNTS.packaging,
      href: `${b}/packaging/`, on: here === 'packaging' },
    { step: 2, label: t.formula, count: CHAIN_COUNTS.formula,
      href: `${b}/formulas/`, on: here === 'formula',
      /* 原料是配方的组成,不是链上单独一环 —— 挂在配方下面才对 */
      sub: { label: t.ing, count: CHAIN_COUNTS.ingredient,
             href: `${b}/ingredients/`, on: here === 'ingredient' } },
    /* 包装盒是包材库里的一类,不是另一个库。给它单独一环是因为
       它在工序上确实排在灌装之后 —— 先有瓶、有料,才谈得上外盒。

       用 t=(具体类型) 而不是 g=carton:实测 carton 这个大类里只有 1 款,
       真正的礼盒/套盒 91 款挂在 use-gift 下面(那是按用途分的类型)。
       链路上的数字必须和点进去看到的一致 —— 数字对不上比不给数字更糟。 */
    { step: 3, label: t.carton, count: CHAIN_COUNTS.carton,
      href: `${b}/packaging/?t=use-gift,outer-carton`, on: here === 'carton' },
    { step: 4, label: t.prod, count: CHAIN_COUNTS.product,
      href: `${b}/products/`, on: here === 'product' },
  ];
}
