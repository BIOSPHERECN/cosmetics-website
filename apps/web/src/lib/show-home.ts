/**
 * BIOSPHERE 首页五块开关。
 *
 * KV 键 `show_home:biosphere-ai` 是线上准绳。改这一份 JSON 就能藏/开，不必再发藏块 PR，也不许为此抬 CACHE_V。
 * 整份 JSON 还不存在时，首页按 SEED 渲染（信任带开，展会/货架/成品关，紧凑瓶图开）。
 * JSON 里缺了某一键，这一键缺省 true（开）。
 * 硬编码常量只在读 KV 失败时垫底，见 [...path].astro。
 *
 * 绑定 HOME_FLAGS 由 ops 填进 wrangler.toml。没绑定时首页仍按 SEED 出页；
 * 本地（localhost / COPY_OF）用进程内 mock，重启即失。
 *
 * 首次写入（不覆盖已有值）:
 *   npx wrangler kv namespace create HOME_FLAGS
 *   npx wrangler kv key put --namespace-id <HOME_FLAGS_ID> --remote \
 *     "show_home:biosphere-ai" \
 *     '{"TRUST":true,"COSMOPACK":false,"HOT_SHELF":false,"SHOWCASE":false,"HERO_CARD":true}'
 *
 * 员工接口（cookie bohui_sess）:
 *   curl -s -b 'bohui_sess=...' https://biosphere-ai.com/api/admin/home-flags
 *   curl -s -b 'bohui_sess=...' -X POST https://biosphere-ai.com/api/admin/home-flags \
 *     -H 'content-type: application/json' \
 *     -d '{"TRUST":true,"COSMOPACK":false,"HOT_SHELF":false,"SHOWCASE":false,"HERO_CARD":true}'
 */

export const SHOW_HOME_KV_KEY = 'show_home:biosphere-ai';

export const SHOW_HOME_KEYS = ['TRUST', 'COSMOPACK', 'HOT_SHELF', 'SHOWCASE', 'HERO_CARD'] as const;
export type ShowHomeKey = (typeof SHOW_HOME_KEYS)[number];
export type ShowHomeFlags = Record<ShowHomeKey, boolean>;

/** 组件名与后台勾选文案。顺序即 etag 的五位。 */
export const SHOW_HOME_BLOCKS: { key: ShowHomeKey; component: string; label: string; hint: string }[] = [
  { key: 'TRUST', component: 'BioTrustStrip', label: '信任带', hint: 'HomeLead 正下方 .bio-trust-strip' },
  { key: 'COSMOPACK', component: 'CosmopackInquiry', label: '展会询盘条', hint: '只关首页这一处 #cosmopack-asia-inquiry' },
  { key: 'HOT_SHELF', component: 'shelf（爆款产品）', label: '爆款货架', hint: 'CMS 块 .dtc-sec.shelf' },
  { key: 'SHOWCASE', component: '.showcase-grid', label: '成品展示', hint: 'Product showcase' },
  { key: 'HERO_CARD', component: '.bio-hero-shot', label: '首屏紧凑瓶图', hint: '取消后只留 HomeLead 左侧文案' },
];

/** JSON 里没写的键：开。 */
export const SHOW_HOME_DEFAULTS: ShowHomeFlags = {
  TRUST: true,
  COSMOPACK: true,
  HOT_SHELF: true,
  SHOWCASE: true,
  HERO_CARD: true,
};

/** 首次写入。信任带开，展会/货架/成品关，紧凑瓶图开。不覆盖已有 KV。 */
export const SHOW_HOME_SEED: ShowHomeFlags = {
  TRUST: true,
  COSMOPACK: false,
  HOT_SHELF: false,
  SHOWCASE: false,
  HERO_CARD: true,
};

export type ShowHomeSource = 'kv' | 'seed' | 'default';

export interface ShowHomeState {
  key: typeof SHOW_HOME_KV_KEY;
  flags: ShowHomeFlags;
  /** 五位 0/1，顺序 TRUST COSMOPACK HOT_SHELF SHOWCASE HERO_CARD。种子是 10001。 */
  etag: string;
  source: ShowHomeSource;
  bound: boolean;
}

export interface HomeFlagsKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const memory = new Map<string, string>();

export function memoryHomeFlagsKv(): HomeFlagsKv {
  return {
    get: async (key) => memory.get(key) ?? null,
    put: async (key, value) => { memory.set(key, value); },
  };
}

/** 测试或本地重启时清掉进程内 mock。 */
export function resetHomeFlagsMemory(): void {
  memory.clear();
}

export function homeFlagsAllowMemory(hostname: string, env: { COPY_OF?: unknown } | undefined): boolean {
  const h = String(hostname || '').toLowerCase().replace(/^www\./, '').split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || !!env?.COPY_OF;
}

export function resolveHomeFlagsKv(env: { HOME_FLAGS?: HomeFlagsKv } | undefined, allowMemory: boolean): HomeFlagsKv | undefined {
  const kv = env?.HOME_FLAGS;
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') return kv;
  return allowMemory ? memoryHomeFlagsKv() : undefined;
}

export function showHomeEtag(flags: ShowHomeFlags): string {
  return SHOW_HOME_KEYS.map((k) => (flags[k] ? '1' : '0')).join('');
}

export function serializeShowHome(flags: ShowHomeFlags): string {
  const o: Record<string, boolean> = {};
  for (const k of SHOW_HOME_KEYS) o[k] = !!flags[k];
  return JSON.stringify(o);
}

/** 缺键、空串、坏 JSON → 五键全 true。只认布尔，字符串 "false" 不当 false。 */
export function parseShowHome(raw: string | null | undefined): ShowHomeFlags {
  const flags: ShowHomeFlags = { ...SHOW_HOME_DEFAULTS };
  if (!raw || !raw.trim()) return flags;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ...SHOW_HOME_DEFAULTS }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...SHOW_HOME_DEFAULTS };
  const o = data as Record<string, unknown>;
  for (const k of SHOW_HOME_KEYS) {
    if (typeof o[k] === 'boolean') flags[k] = o[k];
  }
  return flags;
}

function stateOf(flags: ShowHomeFlags, source: ShowHomeSource, bound: boolean): ShowHomeState {
  return { key: SHOW_HOME_KV_KEY, flags: { ...flags }, etag: showHomeEtag(flags), source, bound };
}

/**
 * 读开关。不写 KV。
 * absentAsSeed：整键不存在时按 SEED（当前藏令），而不是五键全开。
 * 首页与缓存键走这一支，避免合入后、ops 还没 put 之前四块闪回来。
 */
export async function readShowHome(
  kv: HomeFlagsKv | undefined,
  opts?: { absentAsSeed?: boolean },
): Promise<ShowHomeState> {
  const absent = opts?.absentAsSeed ? SHOW_HOME_SEED : SHOW_HOME_DEFAULTS;
  const absentSource: ShowHomeSource = opts?.absentAsSeed ? 'seed' : 'default';
  if (!kv) return stateOf(absent, absentSource, false);
  let raw: string | null;
  try { raw = await kv.get(SHOW_HOME_KV_KEY); }
  catch { return stateOf(absent, absentSource, true); }
  if (raw == null) return stateOf(absent, absentSource, true);
  return stateOf(parseShowHome(raw), 'kv', true);
}

/** 仅当键不存在时写入 SEED。已有值原样返回。读失败不写，免得盖掉线上。 */
export async function seedShowHome(kv: HomeFlagsKv | undefined): Promise<ShowHomeState> {
  if (!kv) return stateOf(SHOW_HOME_SEED, 'seed', false);
  let raw: string | null;
  try { raw = await kv.get(SHOW_HOME_KV_KEY); }
  catch { return stateOf(SHOW_HOME_SEED, 'seed', true); }
  if (raw != null) return stateOf(parseShowHome(raw), 'kv', true);
  await kv.put(SHOW_HOME_KV_KEY, serializeShowHome(SHOW_HOME_SEED));
  return stateOf(SHOW_HOME_SEED, 'seed', true);
}

/** 合并布尔补丁后整份写回。先 seed，避免空键上只写出一半。 */
export async function writeShowHome(
  kv: HomeFlagsKv,
  patch: Partial<ShowHomeFlags>,
): Promise<ShowHomeState> {
  const cur = await seedShowHome(kv);
  const next: ShowHomeFlags = { ...cur.flags };
  for (const k of SHOW_HOME_KEYS) {
    if (typeof patch[k] === 'boolean') next[k] = patch[k];
  }
  await kv.put(SHOW_HOME_KV_KEY, serializeShowHome(next));
  return stateOf(next, 'kv', true);
}

/** 语言首页：/en/ 、/zh-cn/。不匹配内页，避免 __hf 打穿全站缓存。 */
export function isLocaleHomePath(pathname: string): boolean {
  return /^\/[a-z]{2}(-[a-z]{2})?\/$/.test(pathname);
}

export function wranglerPutCommand(namespaceId = '<HOME_FLAGS_ID>'): string {
  return `npx wrangler kv key put --namespace-id ${namespaceId} --remote "${SHOW_HOME_KV_KEY}" '${serializeShowHome(SHOW_HOME_SEED)}'`;
}

export function homeFlagsCurl(origin = 'https://biosphere-ai.com'): string {
  const base = origin.replace(/\/$/, '');
  const body = serializeShowHome(SHOW_HOME_SEED);
  return [
    `curl -s -b 'bohui_sess=...' ${base}/api/admin/home-flags`,
    `curl -s -b 'bohui_sess=...' -X POST ${base}/api/admin/home-flags -H 'content-type: application/json' -d '${body}'`,
  ].join('\n');
}
