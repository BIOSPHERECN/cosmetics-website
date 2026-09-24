-- C4 知识库后台(2026-09-24):说服卡(④ 对外层)与方法卡(② 方法层)进 playbooks,不另起新表(《帛卉行业知识库-架构-v1》第四节)。
-- 只加列。status NULL = 普通篇(业务员自己的规则/模板,照旧不走人审);
-- '待审' / '在用' / '下线' 只给卡片:导入与每次改正文都回到「待审」,管理员人审通过才「在用」,只有「在用」的卡进「问知识库」。
ALTER TABLE playbooks ADD COLUMN status TEXT;
ALTER TABLE playbooks ADD COLUMN reviewed_by TEXT;
ALTER TABLE playbooks ADD COLUMN reviewed_at TEXT;
