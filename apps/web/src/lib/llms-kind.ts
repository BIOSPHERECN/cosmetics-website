/** 分语种 llms.txt:中文留在本页,其它语种 301 到英文全文 /llms.txt。 */
export function llmsKind(lang: string): 'zh' | 'redirect' {
  return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'redirect';
}
