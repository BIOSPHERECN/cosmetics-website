/**
 * 不给客户 AI 配方(2026-09-24 老板会议):AI 现编的配方没经过稳定性测试,不可以给客户;
 * 只从帛卉 13,000+ 个成熟配方里匹配现成的。对客的 AI(客服、站内检索、询盘首回)共用这一条口径。
 * 后台 /bohui/ 下的内部工具不受影响。
 */
import { ORG } from '@cosmetic/core/content/org.ts';

export const FORMULA_NOTICE_ZH = ORG.formulas.noticeZh;
export const FORMULA_NOTICE_EN = ORG.formulas.noticeEn;

/** 系统提示里的硬规矩 */
export const NO_FORMULA_RULE =
  `硬规矩:不给配方表、不给成分比例或百分比、不编配方。客户要配方时只回答「${FORMULA_NOTICE_ZH}」,并建议发起询盘。`;

/** 模型不总是听话:回答里出现「配方/成分 … 数字%」就整条换成固定口径 */
export const leaksFormula = (t: string) =>
  /(配方|成分|含量|添加量|用量|formula|ingredient|INCI)[^\n]{0,40}?\d+(?:\.\d+)?\s*%/i.test(t)
  || /\d+(?:\.\d+)?\s*%\s*(w\/w|wt)/i.test(t);
