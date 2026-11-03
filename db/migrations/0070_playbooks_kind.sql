-- 知识库分类维度(05:25 创始人:要像专业知识库一样按类型/阶段组织)
ALTER TABLE playbooks ADD COLUMN kind TEXT DEFAULT '规则';
ALTER TABLE playbooks ADD COLUMN stage TEXT DEFAULT '通用';
ALTER TABLE playbooks ADD COLUMN sort INTEGER DEFAULT 500;
