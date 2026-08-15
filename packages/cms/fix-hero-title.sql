-- 回填内页 hero 的空标题。
-- 种子数据里内页 hero 的 title 是空串,渲染出 <h1></h1> —— 标签在、字没有。
-- 代码侧已加兜底(见 [...path].astro 的 hero 分支),这里把数据本身补正,
-- 让后台编辑器里也能看到真实标题,而不是一个空输入框。
UPDATE block_i18n
   SET data_json = json_set(data_json, '$.title', (
         SELECT i.title FROM page_i18n i
          WHERE i.page_id = (SELECT b.page_id FROM blocks b WHERE b.id = block_i18n.block_id)
            AND i.lang = block_i18n.lang
       ))
 WHERE json_extract(data_json, '$.title') = ''
   AND block_id IN (SELECT id FROM blocks WHERE type = 'hero')
   AND EXISTS (
         SELECT 1 FROM page_i18n i
          WHERE i.page_id = (SELECT b.page_id FROM blocks b WHERE b.id = block_i18n.block_id)
            AND i.lang = block_i18n.lang AND i.title <> ''
       );
