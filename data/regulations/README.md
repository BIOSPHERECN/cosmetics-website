# 各国化妆品法规 · 调研原始数据

站上 `/[lang]/regulations/` 的数据源。2026-09-11 由三个子代理用搜索引擎从官方站 / 法规咨询机构页面整理,
每条带 `sources`(URL 列表)与 `notes`(拿不准的写在这里);`tools/regulations-load.py` 读本目录全部 `*.json`,
英文句子用 Agnes 3.0(思考关)译成中文,写进 D1 的 `regulations` / `regulation_updates`。

| 文件 | 覆盖 | 市场数 | 2025–2026 动态 |
|:--|:--|--:|--:|
| `eu-americas.json` | 欧盟、英国、瑞士、土耳其、俄罗斯/欧亚经济联盟、美国、加拿大、墨西哥、巴西、阿根廷、哥伦比亚/安第斯共同体、智利、秘鲁 | 13 | 10 |
| `apac.json` | 中国大陆、香港、台湾、日本、韩国、东盟指令、新加坡、马来西亚、泰国、印尼、越南、菲律宾、印度、澳大利亚、新西兰 | 15 | 10 |
| `mea.json` | 海合会、沙特、阿联酋、以色列、埃及、南非、尼日利亚、肯尼亚、摩洛哥、巴基斯坦、孟加拉、斯里兰卡、哈萨克斯坦、乌克兰 | 14 | 8 |
| `_zh-cache.json` | 英→中译句缓存(重跑不再翻) | — | — |

每个市场的字段:主管机构、主法规与引用号、生效时间、最近一次修订(日期 / 内容 / 来源)、上市路径(通报 / 备案 / 注册)、
境内责任人、安全档案、标签要点、动物试验、禁限用清单(能对上本站 `inci_registry` 的挂 `inci_registry` id)、官方链接。

**纪律**:只写有来源的;子代理标 null 的字段留空;条文以各国官方原文为准,站上有免责声明。
官方站抓不到(gov.br、SFDA、HSA、FDA Philippines 等 socket 错)时来源是法规咨询机构(ChemLinked、CIRS、Cosmeservice、Complife 等)的摘要,`notes` 里写明。

刷新:改 JSON 或新增文件后 `python tools/regulations-load.py --apply`(幂等 upsert;动态表整表重写)。
