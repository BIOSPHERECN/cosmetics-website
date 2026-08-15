-- 生产基地版块 —— 制造基地 + 植物药材种植基地
--
-- 加在 5 站的首页与「能力」页。为什么值得单独一个版块:
--   代工厂到处都是,能自己管到种植端的没几家。「从一株药材到一支成品」
--   是帛卉真正的护城河,缩成能力清单里的一行字就浪费了。
--
-- ⚠ items 里是**明确标注的占位条目**,不是真实基地。
--   我不编造基地名称、产地与面积 —— 那属于对外宣称,写错就是不实宣传。
--   创始人在后台「页面与版块 → 生产基地」逐条替换即可,汇总数字会自动重算。

-- ── 首页 ────────────────────────────────────────────────
INSERT INTO blocks (page_id, type, sort_order, is_visible)
SELECT p.id, 'bases', 45, 1
  FROM pages p
 WHERE p.slug = ''
   AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.page_id = p.id AND b.type = 'bases');

-- ── 能力页 ──────────────────────────────────────────────
INSERT INTO blocks (page_id, type, sort_order, is_visible)
SELECT p.id, 'bases', 45, 1
  FROM pages p
 WHERE p.slug = 'capabilities'
   AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.page_id = p.id AND b.type = 'bases');

-- ── 中文内容 ────────────────────────────────────────────
INSERT INTO block_i18n (block_id, lang, data_json)
SELECT b.id, 'zh-cn', json('{
  "eyebrow": "从一株药材到一支成品",
  "title": "生产基地",
  "intro": "制造端与种植端同属一个体系。原料不是买回来的一个批号,而是我们看得见来路、管得到规范的一片地 —— 这决定了配方的稳定性,也决定了功效宣称能不能挂上出处。植物药材种植基地正在持续整合中。",
  "labels": { "bases": "生产基地", "area": "种植面积", "species": "在培品种" },
  "items": [
    {
      "type": "make", "kind": "制造基地", "name": "【待填写】主生产基地",
      "region": "【待填写】所在地", "area": "【待填写】年产能",
      "focus": "【待填写】主要剂型与产线", "cert": "【待填写】洁净等级与体系认证",
      "note": "请在后台逐字段替换为真实信息。"
    },
    {
      "type": "grow", "kind": "种植基地", "name": "【待填写】药材种植基地",
      "region": "【待填写】道地产区", "area": "【待填写】面积(如 1,200 亩)",
      "focus": "【待填写】主要品种,用顿号分隔",
      "cert": "【待填写】GAP / 有机等规范",
      "note": "品种用顿号分隔,系统会自动去重统计在培品种数。"
    }
  ],
  "footnote": "基地名册持续更新;新增一条,上方汇总数字自动重算。"
}')
  FROM blocks b
 WHERE b.type = 'bases'
   AND NOT EXISTS (SELECT 1 FROM block_i18n i WHERE i.block_id = b.id AND i.lang = 'zh-cn');

-- ── 英文内容 ────────────────────────────────────────────
INSERT INTO block_i18n (block_id, lang, data_json)
SELECT b.id, 'en', json('{
  "eyebrow": "From the plant to the finished unit",
  "title": "Production Bases",
  "intro": "Manufacturing and cultivation sit inside one system. A raw material is not a batch number we buy in — it is land whose origin we can see and whose practice we can govern. That is what keeps a formula consistent, and what lets an efficacy claim carry a source. Botanical cultivation bases are being integrated on an ongoing basis.",
  "labels": { "bases": "Production bases", "area": "Cultivated area", "species": "Species under cultivation" },
  "items": [
    {
      "type": "make", "kind": "Manufacturing", "name": "[To be filled] Main plant",
      "region": "[To be filled] Location", "area": "[To be filled] Annual capacity",
      "focus": "[To be filled] Formats and lines", "cert": "[To be filled] Cleanroom class and certifications",
      "note": "Replace field by field in the admin."
    },
    {
      "type": "grow", "kind": "Cultivation", "name": "[To be filled] Botanical base",
      "region": "[To be filled] Origin region", "area": "[To be filled] Area",
      "focus": "[To be filled] Species, comma separated",
      "cert": "[To be filled] GAP / organic",
      "note": "Species are de-duplicated automatically for the summary count."
    }
  ],
  "footnote": "The roster is updated continuously; the summary above recalculates on every addition."
}')
  FROM blocks b
 WHERE b.type = 'bases'
   AND NOT EXISTS (SELECT 1 FROM block_i18n i WHERE i.block_id = b.id AND i.lang = 'en');
