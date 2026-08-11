-- 询盘车 —— DTC 购物车的 B 端等价物
-- 采购经理边逛边"加入询盘",最后一次性提交整车,而不是每次都填一遍表。
-- 车存在浏览器本地(localStorage),只有提交时才落库 —— 不建会话表、不设 cookie,
-- 逛的过程零服务端状态,也就没有隐私与合规负担。

-- 询盘明细:一次询盘可含多个剂型,每个带自己的规格选择
CREATE TABLE IF NOT EXISTS inquiry_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id    INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  -- 冗余存快照:产品日后改名或下架,历史询盘仍要能看懂当时选的是什么
  product_name  TEXT NOT NULL,
  -- 采购在卡片上选的规格,如 {"容量":"50ml","包材":"玻璃瓶","起订":"5000"}
  options_json  TEXT NOT NULL DEFAULT '{}',
  qty_note      TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inq_items ON inquiry_items(inquiry_id, sort_order);
