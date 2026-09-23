# 法规原文语料(合规检索 AI 的取证底料)

来源:WorkBuddy 2026-09-14 采集(trafilatura 抽正文),按司法辖区分目录,每个 .md 带 YAML 头(title / source_url / jurisdiction / status)。
`index.csv` 是采集清单;status = ok 的是完整全文,low 是只抓到概览页,fetch_failed 的只有标题(未用)。
装载:`python tools/reg-corpus-load.py --apply` → D1 `reg_corpus`(按关键词检索,不做向量)。
原则:模型只能引用检索到的块;块里没有的不许说;所有结论「以最新官方文本为准」。
