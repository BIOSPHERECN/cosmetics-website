-- 买手问答多语言(2026-09-16 创始人:「GEO 是多语言展现吗」—— 之前只有中 / 英,其它 15 语显示英文)。
-- tools/geo-answers-i18n.py 用免费舰队(Agnes / 商汤)整页翻,src_hash 记源文指纹,源文变了才重翻。
CREATE TABLE IF NOT EXISTS geo_answers_i18n (
  slug TEXT NOT NULL, lang TEXT NOT NULL, q TEXT, lead TEXT, sections_json TEXT, faqs_json TEXT, src_hash TEXT, updated_at TEXT,
  PRIMARY KEY (slug, lang)
);
