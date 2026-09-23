-- 汇率表(2026-09-16 创始人:「他们还选择货币,我们也要有自动换货币的」)。USD 基准,每天 06:30 由 tools/fx_rates.py 从 open.er-api.com 刷一次;
-- 前端按访客国家默认币种、页头可切换,换算在浏览器里做(页面仍可边缘缓存)。
CREATE TABLE IF NOT EXISTS fx_rates (code TEXT PRIMARY KEY, rate REAL NOT NULL, updated_at TEXT DEFAULT (datetime('now')));
