/**
 * 设计页电商套图的图片地址。
 *
 * 只接受解析后仍是 https:// 且带主机名的 URL。javascript:、data:、协议相对
 * 地址、站内相对路径一律丢掉。返回的是 URL 序列化结果,引号和尖括号已被编码,
 * 调用方再用 setAttribute / textContent 挂到 DOM,标签文字不能拼进 src。
 */

const CTRL = /[\u0000-\u001F\u007F]/;

export function httpsImageSrc(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 2048) return null;
  /* 浏览器会先剥掉 tab / 换行再解析。带这些字符的字符串直接拒绝,
     避免「看起来是 https、解析完变成别的协议」。 */
  if (CTRL.test(raw) || /[ \t]/.test(raw)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  if (!u.hostname || u.hostname === '.') return null;
  if (u.username || u.password) return null;
  const href = u.href;
  if (!href.startsWith('https://')) return null;
  if (CTRL.test(href) || /["'<>\s]/.test(href)) return null;
  return href;
}

/** 说明文字只做长度裁剪。不在这里做 HTML 转义 —— 转义过的字符串若再进 textContent 会显示成实体。 */
export function imageLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 200);
}

export function galleryItem(image: unknown): { src: string; label: string } | null {
  if (!image || typeof image !== 'object') return null;
  const rec = image as { url?: unknown; label?: unknown };
  const src = httpsImageSrc(rec.url);
  if (!src) return null;
  return { src, label: imageLabel(rec.label) };
}

type GalleryNode = {
  className: string;
  textContent: string;
  setAttribute(name: string, value: string): void;
  appendChild(child: GalleryNode): void;
};

/** 用 createElement / setAttribute / textContent 挂套图。不写 innerHTML。 */
export function appendGallery(
  parent: { appendChild(child: GalleryNode): void },
  images: unknown,
  doc: { createElement(tag: string): GalleryNode },
): number {
  const list = Array.isArray(images) ? images : [];
  let drawn = 0;
  for (const im of list) {
    const item = galleryItem(im);
    if (!item) continue;
    const fig = doc.createElement('figure');
    fig.className = 'ds-ai-item';
    const img = doc.createElement('img');
    img.setAttribute('src', item.src);
    img.setAttribute('alt', item.label);
    img.setAttribute('loading', 'lazy');
    const cap = doc.createElement('figcaption');
    cap.textContent = item.label;
    fig.appendChild(img);
    fig.appendChild(cap);
    parent.appendChild(fig);
    drawn++;
  }
  return drawn;
}
