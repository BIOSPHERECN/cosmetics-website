-- 原始 .eml 整封归档到 R2(创始人 09-18 17:3x「R2 不可以作为邮件存储吗」→ 可以;只归档可信发件人且 ≤2MB,陌生/垃圾不存)
ALTER TABLE mails ADD COLUMN raw_key TEXT;   -- R2 键 mail/<message_id>/raw.eml;NULL = 没存(陌生 / 超限 / 老行)
