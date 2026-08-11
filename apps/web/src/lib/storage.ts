/**
 * 媒体存储层 —— 可插拔驱动
 * ═══════════════════════════════════════════════════════════════════════
 * 上层(后台上传、前端取图)只认「存储键 storageKey」这一个抽象,
 * 底下是 R2 还是仓库文件,由环境变量决定。所以以后换后端不用改业务代码。
 *
 * 两条纪律直接写进实现,不靠人记(来自 zero-r2-move 的血证):
 *  ① 键一次写定即终态,永不 copy/move。分类改的是 D1 的 media.folder 字段,
 *     物理对象不动 —— 事后搬文件既慢又贵,还容易搬丢。
 *  ② 列媒体库只查 D1,**本模块不提供任何 list 能力**。
 *     真要列桶请去面板看;代码里没有这条路,就不会有人误调。
 */

export type StorageDriver = 'r2-s3' | 'git-repo';

export interface StoredObject {
  /** 存储键,写定后终生不变。形如 media/2026/08/<uuid>.webp */
  key: string;
  /** 对外可访问的 URL */
  url: string;
  bytes: number;
  mime: string;
}

export interface StorageEnv {
  MEDIA_DRIVER?: string;
  /** r2-s3 驱动 */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  /** 桶的公开访问域名(自定义域或 r2.dev);没有则回退到经本站 /media/ 代理 */
  R2_PUBLIC_BASE?: string;
  /** git-repo 驱动 */
  GH_TOKEN?: string;
  GH_REPO?: string;
  GH_BRANCH?: string;
}

/** 允许的图片类型 —— 白名单,不做黑名单(黑名单永远漏) */
const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
]);

/** 单文件上限 10MB —— 运营直接传手机原图很容易超,超了给人话提示而不是 500 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function pickDriver(env: StorageEnv): StorageDriver {
  if (env.MEDIA_DRIVER === 'r2-s3' || (env.R2_ACCESS_KEY_ID && env.R2_BUCKET)) return 'r2-s3';
  return 'git-repo';
}

/**
 * 生成终态键。
 * 按年月分层是为了让对象天然分散,避免某天需要按前缀检索时扫描面过大;
 * 用 UUID 而非原文件名:原名可能重复、可能带中文与空格、可能泄露内部信息。
 */
export function makeKey(mime: string, now: Date): string {
  const ext = ALLOWED.get(mime);
  if (!ext) throw new Error(`不支持的图片类型: ${mime}`);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `media/${y}/${m}/${crypto.randomUUID()}.${ext}`;
}

export function assertUploadable(mime: string, bytes: number): void {
  if (!ALLOWED.has(mime)) {
    throw new Error(`只接受 JPG / PNG / WebP / AVIF / SVG,收到的是 ${mime || '未知类型'}`);
  }
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new Error(`图片 ${(bytes / 1048576).toFixed(1)}MB,超过 10MB 上限,请先压缩`);
  }
  if (bytes <= 0) throw new Error('文件是空的');
}

/* ══════════════════════════════════════════════════════════════════════
   驱动一:R2(S3 兼容接口)
   走 S3 API 而不是 Workers 绑定,是因为桶在创始人主账号、站点在 BIOSPHERECN 账号
   —— 绑定只能同账号,S3 接口才能跨账号。
   ══════════════════════════════════════════════════════════════════════ */

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
}
async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const d = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** AWS SigV4 签名的 PUT —— R2 的 S3 接口区域固定为 auto */
async function r2Put(env: StorageEnv, key: string, body: ArrayBuffer, mime: string): Promise<StoredObject> {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = `/${env.R2_BUCKET}/${key.split('/').map(enc).join('/')}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const canonicalHeaders =
    `content-type:${mime}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(canonicalRequest)}`;

  let sig: ArrayBuffer = await hmac(new TextEncoder().encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), dateStamp);
  sig = await hmac(sig, 'auto');
  sig = await hmac(sig, 's3');
  sig = await hmac(sig, 'aws4_request');
  sig = await hmac(sig, stringToSign);
  const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const res = await fetch(`https://${host}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': mime,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`R2 写入失败 ${res.status}:${(await res.text()).slice(0, 200)}`);
  }
  const base = (env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
  return { key, url: base ? `${base}/${key}` : `/media/${key}`, bytes: body.byteLength, mime };
}

/* ══════════════════════════════════════════════════════════════════════
   驱动二:仓库(不绑卡也能跑)
   通过 GitHub Contents API 提交图片,Pages 重建后生效。
   代价是生效慢 1–2 分钟;好处是零费用、图片随代码一起有版本。
   ══════════════════════════════════════════════════════════════════════ */

async function repoPut(env: StorageEnv, key: string, body: ArrayBuffer, mime: string): Promise<StoredObject> {
  if (!env.GH_TOKEN || !env.GH_REPO) throw new Error('仓库驱动缺少 GH_TOKEN / GH_REPO 配置');
  const path = `apps/web/public/${key}`;
  // base64 编码,分块避免大文件时爆栈
  const bytes = new Uint8Array(body);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bohui-cms',
    },
    body: JSON.stringify({
      message: `media: 上传 ${key}`,
      content: btoa(bin),
      branch: env.GH_BRANCH || 'bohui-monorepo',
    }),
  });
  if (!res.ok) throw new Error(`仓库写入失败 ${res.status}:${(await res.text()).slice(0, 200)}`);
  return { key, url: `/${key}`, bytes: body.byteLength, mime };
}

/**
 * 上传入口 —— 唯一对外的写方法。
 * 注意本模块**没有** list / move / copy / delete:
 * 分类改 D1、下架改 D1,物理对象只增不动,这是刻意的设计而非遗漏。
 */
export async function putMedia(
  env: StorageEnv,
  file: { body: ArrayBuffer; mime: string; now?: Date },
): Promise<StoredObject> {
  assertUploadable(file.mime, file.body.byteLength);
  const key = makeKey(file.mime, file.now ?? new Date());
  return pickDriver(env) === 'r2-s3' ? r2Put(env, key, file.body, file.mime) : repoPut(env, key, file.body, file.mime);
}
