import { env } from 'cloudflare:workers';

/**
 * 商务条款开关(2026-09-16 创始人铁令:起订量 / 出样 / 交期 / 价格只准用知识库「工厂口径」页的数字)。
 * 配方表和包材表里的 moq / lead_days 是早期系统占位数(配方)或供应商目录数(包材),都不是工厂口径 ——
 * 老板把「工厂口径」填好之前,公开页一律不显示这两列;答案页(geo_answers)也按同一开关生成无数字版。
 * 打开:wrangler 变量 TERMS_CONFIRMED=1(填完口径后由管理员设,顺手 bump CACHE_V)。
 */
export const TERMS_CONFIRMED = String((env as any).TERMS_CONFIRMED ?? '') === '1';

/** 出样周期 —— 工厂口径页里唯一已填的商务数字(创始人 2026-09-16 18:0x:「5–14 天出样品,这个是行业规矩」)。
 *  只允许说「通常 5–14 天」,不承诺具体某一天;起订量 / 大货交期 / 价格仍等口径页填完、TERMS_CONFIRMED=1 才出。 */
export const SAMPLE_DAYS = '5–14';
