# 成本审核 · cost-demo(worker=formula-lab)

结论:**拦** —— 审核对象不存在,无法核对真实文件。

## 核对事实(2026-09-25)
- tree `F:/0cosmetic/cosmetic-sites/tools/formula-lab` 不存在(cd 报 No such file or directory)。
- 全 F:/0cosmetic(深度 5,排除 node_modules/.git/dist)找不到 `verify-sol*` 文件或 `formula-lab` 目录。
- cosmetic-sites 全仓 grep `verify-sol`、`formula_lab_runs`:0 命中,说明这张表在代码中未被引用。
- 根 package.json scripts 只有 build/scaffold/lab/build:lab/build:retired,没有 formula-lab 或 verify 相关脚本;工单说的「package.json 的 scripts 改动」不存在。
- 仓内定时任务:.github/workflows/deploy.yml、apps/mail-worker、apps/web(wrangler.toml / wrangler.b2o.jsonc)、tools/news-cron-worker 都不引用 formula-lab/verify-sol。

## 逐项
- 成本-① 读量:diff 本身方向对(SELECT * 全表 → 只取 id,status 加近 1 天 WHERE),但 created_at 有无索引无从核对,改动文件也不存在,**不能签**。
- 成本-② cron:当前仓内没有任何定时任务引用它;「从 cron 移出」没有可核对的对象,工单里的动作①「no-cache 读」在 diff 里也看不到。
- 成本-③ 频率/上限:没有调用方,算不出日读量;对 5 亿/日读线目前没有贡献。

## 需要补的
1. 给出真实 tree 路径(可能在别的仓/副本,比如 F:/0化妆品平台 或 skin2oem),或者先把文件落盘再送审。
2. 补完整 diff(package.json scripts、cron/workflow 的移除部分、no-cache 读的实现)。
3. 确认 formula_lab_runs.created_at 有索引(没有的话 WHERE 仍是全表扫描)。
