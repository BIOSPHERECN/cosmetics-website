-- 模板句多语言(2026-09-16):意图落地页(oem)等页面的中英模板句翻到其它 15 语,tools/ui-i18n.py 用免费舰队翻;页面按 ns+lang 取,没有回落英文。
CREATE TABLE IF NOT EXISTS ui_i18n (ns TEXT NOT NULL, lang TEXT NOT NULL, key TEXT NOT NULL, text TEXT, src_hash TEXT, updated_at TEXT, PRIMARY KEY (ns, lang, key));
