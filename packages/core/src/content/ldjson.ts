/**
 * JSON-LD 进 <script> 前的转义(09-24 代码审计 P1-3)。
 * JSON.stringify 不转义 `<`:商品标题、品牌、INCI 来自电商抓取,只要有一条带 `</script><script>…`,
 * 脚本就在本域执行(后台与前台同域,管理员打开前台页即可被借会话)。`<` 写成 <,JSON 语义不变。
 * 所有 `set:html={JSON.stringify(...)}` 一律改用它;Semgrep 规则拦新增的裸写法。
 */
export const ldJson = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c');
