# 回滚(万一线上出问题,照这个做)

切换于 2026-08-28 完成:`biosphere-ai.com` 由 `m-biosphere-ai` 改指 `m-biosphere-ai-v2`。
旧 Worker **原封未动**,随时可以切回去。

## 一、把域名切回旧 Worker(约 10 秒生效)

```bash
curl -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"zone_id":"38eac8524706eb1f7eaa6cf5d368cc52","hostname":"biosphere-ai.com","service":"m-biosphere-ai","environment":"production","override_existing_origin":true}' \
  "https://api.cloudflare.com/client/v4/accounts/894467610b4ed9d79b7bdf1b31e2f2b2/workers/domains"
```

## 二、如果切回去,AI 功能会不通

旧站的前端是**带着令牌直连** router 的,而那个令牌(名为「皮肤检测服务」)
因为写在页面与 robots.txt 里已外泄,已在网关侧停用。
切回旧 Worker 后 AI 会返回 401 —— 这是**预期行为,不是新故障**。

要临时恢复,在网关 KV(命名空间 `afd7e380f8d942f0ace0beb1867a99ae`,键 `tokens`)
里把那条的 `enabled` 改回 `true`。
**但这等于重新打开一个已经公开的令牌**,只应作为几分钟的应急,不能过夜。

## 三、单独回滚代码(域名不动)

CF 控制台 → Workers → m-biosphere-ai-v2 → 版本 → 选上一版回滚。
旧 Worker 的回滚锚点是版本 `6aa95862-b74a-447a-8415-5e9ddc7309c2`(2026-08-25 03:28)。

## 四、这次切换动了什么、没动什么

**动了**
- 域名指向:m-biosphere-ai → m-biosphere-ai-v2
- 网关令牌:新建「站点服务端代理(v2)」,停用已外泄的「皮肤检测服务」

**没动**
- 旧 Worker `m-biosphere-ai` 的代码与静态资源(完整保留)
- 旧 KV 命名空间 `975c33ab…`(只读复制过一份图,没有任何回写)
- `router.biosphere-ai.com` 网关本身的代码
