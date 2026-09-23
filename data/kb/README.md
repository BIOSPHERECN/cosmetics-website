# 外部参考库交付夹(给 WorkBuddy / 其它助手)

抓来的文章放 `data/kb/inbox/`,一篇一个 `.md`,文件头用 frontmatter:

```
---
title: 销售用 AI 生成精准客户画像(B2B 开局必备)
source_url: https://www.jxxy.net/ai/xxxx
category: 销售转化        # 见下面允许的类目
tags: 客户画像, DeepSeek, B2B
date: 2026-06-30
---
正文(Markdown)
```

**只要这些类目**(其余别抓,进了也会被过滤):销售转化 / 客户分析 / 私域运营 / 客户服务 / 外贸 / 跨境电商 / 制造业 / 零售与电商 / 提示词-销售 / 工作流-销售 / WorkBuddy / Codex / Claude / OpenClaw / Accio。
**不要**:视频提示词、PPT、小红书、房产、教育、HR、日报类。

流水线 `python tools/crm/kb_import.py` 把 inbox 里的文件进库(`kb_docs` 表),处理完挪到 `done/`。后台 `/bohui/playbook/` 的搜索和「问知识库」会一起查参考库。

规矩:参考库只内部用,保留来源链接;不复制到官网、不进产品、不对外分发(那是别人的内容)。
