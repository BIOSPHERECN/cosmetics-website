-- 2026-09-16 创始人:「发起询盘,你不索要客户的 WhatsApp 啊」「WhatsApp / WeChat 这些你都没修改」
ALTER TABLE inquiries ADD COLUMN whatsapp TEXT;
ALTER TABLE sites ADD COLUMN contact_whatsapp TEXT;
ALTER TABLE sites ADD COLUMN contact_wechat TEXT;
