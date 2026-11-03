/**
 * cloudflare:workers stub —— 静态构建时替代 Cloudflare Workers 运行时模块。
 * 真站的 apps/web 在 Workers 环境里运行,有真正的 cloudflare:workers。
 * 静态站(sites/*)构建时用这个空 env,避免 Node.js 不认识 cloudflare: 协议。
 */
export const env = {} as Record<string, unknown>;
