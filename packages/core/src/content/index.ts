/**
 * 内容索引 —— 站点 id → 四语首页内容 的唯一入口。
 * 5 个真站的首页与风格实验室的 20 个预览页,读的都是这张表:
 * 保证「并排比较 20 套风格时,内容完全一致,只有风格在变」。
 *
 * 将来接入后台(Directus / Keystatic)后,本模块改为读取后台导出的 JSON,
 * 形状继续符合 types.ts 的 HomeContent 契约,上层页面一行都不用改。
 */
import type { HomeContent } from '../types.ts';
import type { Locale } from '../i18n/index.ts';
import { beauty2oem } from './beauty2oem.ts';
import { skin2oem } from './skin2oem.ts';
import { biosphereAi } from './biosphere-ai.ts';
import { medierba } from './medierba.ts';
import { biosphereOralcare } from './biosphere-oralcare.ts';

export const HOME: Record<string, Record<Locale, HomeContent>> = {
  beauty2oem,
  skin2oem,
  'biosphere-ai': biosphereAi,
  medierba,
  'biosphere-oralcare': biosphereOralcare,
};

/** 取某站某语言的首页内容;缺失即构建期抛错,不静默出空页 */
export function getHome(siteId: string, locale: Locale): HomeContent {
  const bySite = HOME[siteId];
  if (!bySite) throw new Error(`[content] 未找到站点内容: ${siteId}`);
  const c = bySite[locale];
  if (!c) throw new Error(`[content] 站点 ${siteId} 缺少语言: ${locale}`);
  return c;
}

export { EMAIL } from './shared.ts';
