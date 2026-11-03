/**
 * 123云盘 OpenAPI 客户端 —— 冷数据存储层。
 *
 * 用途：prospect-mine / trends / outreach 跑完后，把完整 JSON 上传到 123 云盘，
 * 两个账号（创始人 beauty2ai + 公司 biosphere-ai）共享读同一份冷数据。
 * D1 只存轻量摘要行，不再膨胀。
 *
 * 调用流程（上传）：
 *   1. create(parentFileID, filename, etag, size) → preuploadID（或 reuse=true 秒传）
 *   2. get_upload_url(preuploadID, sliceNo=1) → presignedURL
 *   3. PUT 文件内容到 presignedURL
 *   4. upload_complete(preuploadID) → fileID
 *
 * 凭据：client_id / client_secret 从 Worker env 读取（wrangler secret 注入），
 *   不写死在代码里。
 */

const BASE = 'https://open-api.123pan.com';

/** 获取 access_token（内部缓存，过期自动刷新） */
let _token: { accessToken: string; expiredAt: number } | null = null;

async function getToken(env: any): Promise<string> {
  if (_token && Date.now() < _token.expiredAt - 60000) return _token.accessToken;
  const cid = env.PAN123_CLIENT_ID as string;
  const sec = env.PAN123_CLIENT_SECRET as string;
  if (!cid || !sec) throw new Error('PAN123_CLIENT_ID / PAN123_CLIENT_SECRET 未配置');
  const r = await fetch(`${BASE}/api/v1/access_token`, {
    method: 'POST',
    headers: { 'Platform': 'open_platform', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cid, client_secret: sec }),
  });
  const d = await r.json() as any;
  if (d.code !== 0) throw new Error(`access_token 失败: ${d.message}`);
  _token = { accessToken: d.data.accessToken, expiredAt: new Date(d.data.expiredAt).getTime() };
  return _token.accessToken;
}

async function req(env: any, path: string, body: any, method = 'POST'): Promise<any> {
  const token = await getToken(env);
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Platform': 'open_platform', 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json() as any;
}

async function reqGet(env: any, path: string): Promise<any> {
  const token = await getToken(env);
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Platform': 'open_platform', 'Authorization': `Bearer ${token}` },
  });
  return r.json() as any;
}

/** 计算字符串的 MD5（Cloudflare Worker 支持 crypto.subtle） */
async function md5(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('MD5', buf).catch(async () => {
    // Worker 不支持 MD5 时走 SHA-256 再截 16 字节（123 用 MD5 做秒传判断，不影响上传）
    const h = await crypto.subtle.digest('SHA-256', buf);
    return h;
  });
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 上传 JSON 到 123 云盘指定目录。
 * @param env Worker env（需 PAN123_CLIENT_ID / PAN123_CLIENT_SECRET）
 * @param parentDirID 父目录的 fileID（根目录 = 0）
 * @param filename 文件名（如 "prospect-2026-10-12-us-abc123.json"）
 * @param jsonStr JSON 字符串
 * @returns fileID（上传成功后的文件 ID）
 */
export async function uploadJSON(env: any, parentDirID: number, filename: string, jsonStr: string): Promise<number> {
  const etag = await md5(jsonStr);
  const size = new TextEncoder().encode(jsonStr).length;

  // 1. create
  const r1 = await req(env, '/upload/v1/file/create', { parentFileID: parentDirID, filename, etag, size });
  if (r1.code !== 0) throw new Error(`create 失败: ${r1.message}`);

  // 秒传
  if (r1.data.reuse) return r1.data.fileID;

  const preuploadID = r1.data.preuploadID;

  // 2. get_upload_url
  const r2 = await req(env, '/upload/v1/file/get_upload_url', { preuploadID, sliceNo: 1 });
  if (r2.code !== 0) throw new Error(`get_upload_url 失败: ${r2.message}`);
  const presignedURL = r2.data.presignedURL;

  // 3. PUT 文件内容
  const r3 = await fetch(presignedURL, { method: 'PUT', body: jsonStr });
  if (!r3.ok) throw new Error(`PUT 失败: ${r3.status}`);

  // 4. upload_complete
  const r4 = await req(env, '/upload/v1/file/upload_complete', { preuploadID });
  if (r4.code !== 0) throw new Error(`upload_complete 失败: ${r4.message}`);

  // 异步处理可能 fileID=0，等一下再查
  if (r4.data.fileID) return r4.data.fileID;
  // async=true 时文件刚提交，fileID 还没分配——列目录确认
  await new Promise(r => setTimeout(r, 500));
  const r5 = await reqGet(env, `/api/v2/file/list?parentFileId=${parentDirID}&page=1&limit=20`);
  const f = (r5.data?.fileList || []).find((x: any) => x.filename === filename);
  return f?.fileID ?? 0;
}

/** 创建目录（parentID=0 为根目录） */
export async function mkdir(env: any, name: string, parentID: number): Promise<number> {
  const r = await req(env, '/upload/v1/file/mkdir', { name, parentID });
  if (r.code !== 0) throw new Error(`mkdir 失败: ${r.message}`);
  return r.data.dirID;
}

/** 列目录 */
export async function listDir(env: any, parentFileId: number): Promise<any[]> {
  const r = await reqGet(env, `/api/v2/file/list?parentFileId=${parentFileId}&page=1&limit=50`);
  return r.data?.fileList || [];
}

/** 获取文件直链（需要开发者权益包） */
export async function getDirectURL(env: any, fileID: number): Promise<string> {
  const r = await req(env, '/api/v1/direct-link/url', { fileID });
  if (r.code !== 0) throw new Error(`直链失败: ${r.message}`);
  return r.data?.url || '';
}
