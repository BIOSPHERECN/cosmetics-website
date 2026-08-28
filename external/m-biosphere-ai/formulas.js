/**
 * 配方受控库 + 标签匹配。
 *
 * 数据原样保留(19 条),只把匹配逻辑改成倒排索引。
 *
 * ══ 为什么改 ══
 * 原实现每次请求把整库线性扫一遍,对每条配方再遍历一次标签 —— O(条数 × 标签数)。
 * 19 条时看不出差别;这张表是给业务用的,迟早会长到几百上千条,
 * 那时每个请求都在做同一件重复的事,而结果只取前 10 条。
 * 建一张「标签 → 配方下标」的倒排表,模块加载时建一次,之后每请求只碰命中的那几条。
 *
 * ══ 另一件更重要的事 ══
 * 这张表现在**硬编码在代码里**:改一条配方要重新部署整个 Worker。
 * 配方是业务数据不是代码,应该进数据库让运营自己维护 ——
 * 帛卉主站(bohui-web)那边的 formulas 表就是干这个的,已经有导入与编辑界面。
 * 这一版先不动数据源(避免一次改太多),但这条债记在这里。
 */

export const FORMULA_LIBRARY = [
    {
      "tags": [
        "防晒",
        "修护",
        "屏障"
      ],
      "category": "成品方案",
      "name": "积雪草光护乳",
      "brief": "物理防晒打底 + 积雪草修护，日间通勤友好",
      "key_ingredients": "积雪草提取物、氧化锌、泛醇",
      "suitable": "敏感肌/干性肌",
      "note": "SPF 值按原料备案调整"
    },
    {
      "tags": [
        "防晒",
        "控油"
      ],
      "category": "成品方案",
      "name": "绿茶轻透防晒凝露",
      "brief": "绿茶多酚协同控油，清爽不闷痘",
      "key_ingredients": "绿茶提取物、二氧化钛、烟酰胺",
      "suitable": "油性肌/混合肌",
      "note": "成膜后叠妆需测试"
    },
    {
      "tags": [
        "润肤",
        "保湿",
        "干性"
      ],
      "category": "成品方案",
      "name": "灵芝深润乳霜",
      "brief": "灵芝多糖锁水 + 神经酰胺屏障，干纹即刻舒缓",
      "key_ingredients": "灵芝提取物、神经酰胺、角鲨烷",
      "suitable": "干性肌/熟龄肌",
      "note": "秋冬厚涂建议"
    },
    {
      "tags": [
        "润肤",
        "身体",
        "止痒"
      ],
      "category": "成品方案",
      "name": "燕麦舒缓身体乳",
      "brief": "胶体燕麦安抚干燥泛痒，沐浴后全肤可用",
      "key_ingredients": "燕麦β-葡聚糖、甘油、尿素",
      "suitable": "全身/敏感肌",
      "note": "适用于干燥瘙痒场景"
    },
    {
      "tags": [
        "抗敏",
        "舒缓",
        "泛红"
      ],
      "category": "成品方案",
      "name": "光果甘草安肌精华",
      "brief": "光果甘草抑制泛红因子，降温镇静",
      "key_ingredients": "光果甘草提取物、马齿苋、红没药醇",
      "suitable": "敏感肌/泛红肌",
      "note": "测试期建议先耳后试用"
    },
    {
      "tags": [
        "抗敏",
        "修护",
        "屏障"
      ],
      "category": "成品方案",
      "name": "角鲨烷屏障修护霜",
      "brief": "模拟皮脂膜，重建脆弱屏障",
      "key_ingredients": "角鲨烷、神经酰胺、维生素E",
      "suitable": "干敏肌/屏障受损肌",
      "note": "早晚薄涂即可"
    },
    {
      "tags": [
        "止痒",
        "舒缓"
      ],
      "category": "成品方案",
      "name": "洋甘菊舒缓喷雾",
      "brief": "洋甘菊+积雪草快速镇痒，妆后可喷",
      "key_ingredients": "洋甘菊提取物、积雪草苷、海藻糖",
      "suitable": "各肤质",
      "note": "冷藏后使用体感更佳"
    },
    {
      "tags": [
        "美白",
        "提亮",
        "暗沉"
      ],
      "category": "成品方案",
      "name": "人参光感精华",
      "brief": "人参皂苷促循环 + 烟酰胺提亮，改善熬夜暗沉",
      "key_ingredients": "人参提取物、烟酰胺、维生素C衍生物",
      "suitable": "暗沉肌/熟龄肌",
      "note": "建议夜间配合修护"
    },
    {
      "tags": [
        "美白",
        "淡斑"
      ],
      "category": "成品方案",
      "name": "光果甘草淡斑精华",
      "brief": "光甘草定抑制黑色素转运，针对局部色沉",
      "key_ingredients": "光果甘草提取物、α-熊果苷、传明酸",
      "suitable": "色斑肌/肤色不均",
      "note": "淡斑周期约8-12周"
    },
    {
      "tags": [
        "抗老",
        "紧致",
        "淡纹"
      ],
      "category": "成品方案",
      "name": "灵芝紧致面霜",
      "brief": "灵芝多糖 + 胜肽矩阵，紧致轮廓淡化细纹",
      "key_ingredients": "灵芝提取物、乙酰基六肽-8、玻色因",
      "suitable": "熟龄肌/松弛肌",
      "note": "配合按摩手法效果更佳"
    },
    {
      "tags": [
        "抗老",
        "修护"
      ],
      "category": "成品方案",
      "name": "人参赋活眼霜",
      "brief": "人参皂苷改善眼周循环，舒缓干纹",
      "key_ingredients": "人参提取物、咖啡因、神经酰胺",
      "suitable": "熟龄肌/眼周干燥",
      "note": "轻点按压吸收"
    },
    {
      "tags": [
        "控油",
        "祛痘",
        "毛孔"
      ],
      "category": "成品方案",
      "name": "茶树控油精华",
      "brief": "茶树油调节油脂，积雪草收细毛孔",
      "key_ingredients": "茶树精油、烟酰胺、锌PCA",
      "suitable": "油性肌/痘痘肌",
      "note": "局部点涂，勿全脸厚涂"
    },
    {
      "tags": [
        "祛痘",
        "痘印"
      ],
      "category": "成品方案",
      "name": "积雪草痘印修护乳",
      "brief": "积雪草苷淡化红印，传明酸改善暗印",
      "key_ingredients": "积雪草提取物、传明酸、尿囊素",
      "suitable": "痘印肌/油痘肌",
      "note": "红印消退周期约4周"
    },
    {
      "tags": [
        "保湿",
        "补水",
        "缺水"
      ],
      "category": "成品方案",
      "name": "玻尿酸水润精华",
      "brief": "多重分子量玻尿酸分层补水，即刻水润",
      "key_ingredients": "透明质酸钠、甘油、泛醇",
      "suitable": "各肤质/缺水肌",
      "note": "妆前使用更服帖"
    },
    {
      "tags": [
        "屏障",
        "修护",
        "敏感"
      ],
      "category": "成品方案",
      "name": "神经酰胺屏障乳",
      "brief": "三类神经酰胺重建屏障，降低刺激感",
      "key_ingredients": "神经酰胺NP/AP/EOP、角鲨烷",
      "suitable": "敏感肌/脆弱肌",
      "note": "精简护肤期首选"
    },
    {
      "tags": [
        "身体",
        "润肤"
      ],
      "category": "成品方案",
      "name": "人参滋养身体霜",
      "brief": "人参提取物滋养 + 乳木果锁水，全身润泽",
      "key_ingredients": "人参提取物、乳木果油、甘油",
      "suitable": "全身/干性肌",
      "note": "沐浴后3分钟内涂抹"
    },
    {
      "tags": [
        "唇部",
        "润唇"
      ],
      "category": "成品方案",
      "name": "灵芝润唇膏",
      "brief": "灵芝多糖 + 蜂蜡，即时软化唇纹",
      "key_ingredients": "灵芝提取物、蜂蜡、维生素E",
      "suitable": "各肤质",
      "note": "夜间厚涂可作唇膜"
    },
    {
      "tags": [
        "清洁",
        "温和",
        "洁面"
      ],
      "category": "成品方案",
      "name": "积雪草氨基酸洁面",
      "brief": "氨基酸表活温和清洁，积雪草舒缓洗后紧绷",
      "key_ingredients": "氨基酸表活、积雪草提取物、甘油",
      "suitable": "各肤质/敏感肌",
      "note": "晨间晚间均适用"
    },
    {
      "tags": [
        "提亮",
        "熬夜",
        "急救"
      ],
      "category": "成品方案",
      "name": "绿茶熬夜急救面膜",
      "brief": "绿茶多酚抗氧化，快速去黄提亮",
      "key_ingredients": "绿茶提取物、烟酰胺、海藻糖",
      "suitable": "暗沉肌/熬夜肌",
      "note": "每周2-3次"
    }
  ];

/** 同义词表:把访客的各种说法归到一个标准标签上 */
const TAG_ALIAS = {
    "防晒": [
      "防晒",
      "sun",
      "uv",
      "防嗮"
    ],
    "润肤": [
      "润肤",
      "滋润",
      "润泽",
      "moistur",
      "emollient"
    ],
    "保湿": [
      "保湿",
      "补水",
      "水润",
      "hydrat",
      "补湿"
    ],
    "抗敏": [
      "抗敏",
      "抗过敏",
      "敏感",
      "sensitive",
      "低敏",
      "温和"
    ],
    "止痒": [
      "止痒",
      "瘙痒",
      "itch",
      "痒"
    ],
    "美白": [
      "美白",
      "提亮",
      "淡斑",
      "brighten",
      "whiten",
      "暗沉",
      "去黄"
    ],
    "抗老": [
      "抗老",
      "抗衰",
      "抗皱",
      "紧致",
      "淡纹",
      "anti-aging",
      "aging",
      "熟龄"
    ],
    "控油": [
      "控油",
      "油性",
      "出油",
      "oil",
      "清爽"
    ],
    "修护": [
      "修护",
      "修复",
      "repair",
      "修復"
    ],
    "舒缓": [
      "舒缓",
      "镇静",
      "sooth",
      "泛红",
      "红肿"
    ],
    "屏障": [
      "屏障",
      "屏障修护",
      "屏障修复",
      "barrier",
      "皮脂膜"
    ],
    "祛痘": [
      "祛痘",
      "痘痘",
      "痘印",
      "粉刺",
      "acne",
      "痘"
    ],
    "清洁": [
      "清洁",
      "洁面",
      "洗面",
      "cleans",
      "去角质"
    ],
    "身体": [
      "身体",
      "body",
      "全身"
    ],
    "唇部": [
      "唇部",
      "唇",
      "lip"
    ],
    "熬夜": [
      "熬夜",
      "急救",
      "去黄"
    ]
  };

/** 品名兜底:描述里认不出标签时,从产品名猜一个方向 */
const PRODUCT_TAG_HINT = [
    {
      "k": "防晒",
      "tag": "防晒"
    },
    {
      "k": "面霜",
      "tag": "润肤"
    },
    {
      "k": "乳",
      "tag": "润肤"
    },
    {
      "k": "精华",
      "tag": "保湿"
    },
    {
      "k": "眼霜",
      "tag": "抗老"
    },
    {
      "k": "面膜",
      "tag": "保湿"
    },
    {
      "k": "洁面",
      "tag": "清洁"
    },
    {
      "k": "喷雾",
      "tag": "舒缓"
    },
    {
      "k": "身体",
      "tag": "身体"
    },
    {
      "k": "唇",
      "tag": "唇部"
    }
  ];

/* ── 倒排索引:标签 → 命中该标签的配方下标。模块加载时建一次 ── */
const INDEX = new Map();
FORMULA_LIBRARY.forEach((f, i) => {
  for (const t of f.tags) {
    if (!INDEX.has(t)) INDEX.set(t, []);
    INDEX.get(t).push(i);
  }
});

/* 别名表反向摊平成「别名 → 标准标签」,避免每次请求都遍历 Object.entries */
const ALIAS_FLAT = [];
for (const [canon, aliases] of Object.entries(TAG_ALIAS)) {
  for (const a of aliases) ALIAS_FLAT.push([a.toLowerCase(), canon]);
}
/* 长别名优先:「屏障修护」应当先命中「屏障」而不是被「修护」抢先 */
ALIAS_FLAT.sort((a, b) => b[0].length - a[0].length);

/**
 * 从自由文本里认标签。
 * 合并了原来分散在两处的逻辑(normalizeLabel + 调用方那段品名兜底),
 * 因为它们本来就是同一件事的两步,分开写导致调用方每次都要重复那段 if。
 */
export function normalizeLabel(raw, productName = '') {
  const q = String(raw || '').toLowerCase();
  const hit = new Set();
  for (const [alias, canon] of ALIAS_FLAT) if (q.includes(alias)) hit.add(canon);

  if (productName) {
    const p = String(productName).toLowerCase();
    for (const [alias, canon] of ALIAS_FLAT) if (p.includes(alias)) hit.add(canon);
    /* 描述和品名都认不出来时,才用品名关键词猜一个方向 —— 猜只猜一个,不铺开 */
    if (!hit.size) {
      for (const h of PRODUCT_TAG_HINT) {
        if (String(productName).includes(h.k)) { hit.add(h.tag); break; }
      }
    }
  }
  return [...hit];
}

const firstClause = (s) => String(s || '').split(/[，,]/)[0] || String(s || '');

export function matchFormulas(labels) {
  /* 只碰命中的配方,不扫全表 */
  const score = new Map();
  for (const lb of labels) {
    for (const i of INDEX.get(lb) || []) score.set(i, (score.get(i) || 0) + 1);
  }
  const top = [...score.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])   // 同分按原始顺序,保证结果稳定可复现
    .slice(0, 10)
    .map(([i]) => {
      const { tags, ...rest } = FORMULA_LIBRARY[i];
      const benefit = firstClause(rest.brief);
      return {
        ...rest,
        benefit,
        effect_comparison: {
          skin_type: rest.suitable,
          key_ingredients: rest.key_ingredients,
          benefit,
          usage: rest.note,
        },
      };
    });

  return {
    top,
    comparison: {
      key: '功效对比',
      items: top.map((m) => ({
        name: m.name, suitable: m.suitable,
        key_ingredients: m.key_ingredients, benefit: m.benefit,
      })),
    },
  };
}
