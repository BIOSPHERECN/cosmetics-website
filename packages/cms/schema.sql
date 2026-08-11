-- ══════════════════════════════════════════════════════════════════════════
--  帛卉集团 CMS · D1 结构
--  设计目标:支撑 5 个站 × 4 种语言 × 多页面 × 产品库 × 媒体库,运营可自助改。
--
--  为什么不沿用旧库:旧 bohui-cms 只有一张扁平 content 表(lang/section/key→value,75 行),
--  它只能改文字 —— 没有产品、没有媒体、没有多站、没有修订。天花板在结构上,不在界面上。
--  所以重建结构,旧库原样保留不动。
--
--  多语言策略:主表存与语言无关的字段(slug/排序/状态/图片),
--  文案另立 *_i18n 表按 (parent_id, lang) 存。好处是加一门语言不用改表结构,
--  且能查出"哪些内容还缺某语言"——这是四语站最容易烂尾的地方。
-- ══════════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- ── 站点:5 个品牌 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id            TEXT PRIMARY KEY,           -- beauty2oem / skin2oem / ...
  domain        TEXT NOT NULL,
  brand_color   TEXT NOT NULL,
  -- 当前选定的风格(对应 variants.css 的 [data-variant]),运营在后台可切换
  variant       TEXT NOT NULL DEFAULT 'v1',
  -- 收录闸门:占位数据核实完毕前保持 0,前端据此输出 noindex + robots Disallow
  is_live       INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_i18n (
  site_id       TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL,              -- zh-cn / zh-tw / en / ja
  name          TEXT NOT NULL,
  tagline       TEXT,
  description   TEXT,
  PRIMARY KEY (site_id, lang)
);

-- ── 页面:多页结构的骨架(首页/能力/产品/质量/关于/联系/隐私/法律)──────────
CREATE TABLE IF NOT EXISTS pages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,              -- '' = 首页;'capabilities' / 'products' ...
  -- 父页面,用于两级导航(标杆站 Intercos/KDC-One 都是两级)
  parent_id     INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  -- 页面模板:决定用哪套版式渲染
  template      TEXT NOT NULL DEFAULT 'standard',
  in_nav        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft / published
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS page_i18n (
  page_id       INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL,
  nav_label     TEXT NOT NULL,              -- 导航里显示的短标签
  title         TEXT NOT NULL,              -- <title> 与 H1
  seo_desc      TEXT,
  PRIMARY KEY (page_id, lang)
);

-- ── 版块:页面由若干版块拼成,顺序可拖拽(Shopify Section 式体验)────────────
CREATE TABLE IF NOT EXISTS blocks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id       INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  -- 版块类型对应一个渲染组件:hero / workshop / certs / matrix / process / proof / form / content / faq
  type          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_visible    INTEGER NOT NULL DEFAULT 1,
  -- 与语言无关的配置(配色深浅、栏数、绑定的媒体 id 等)
  config_json   TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS block_i18n (
  block_id      INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL,
  -- 该版块的全部文案,形状随 type 而定,与 packages/core/src/types.ts 的契约一致
  data_json     TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (block_id, lang)
);

-- ── 产品库 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL,
  category      TEXT NOT NULL,              -- skincare / makeup / cleansing / oral ...
  -- 起订量:PDF 定案要求品类矩阵标注,B 端第一个问的就是这个
  moq           TEXT,
  cover_media   INTEGER REFERENCES media(id) ON DELETE SET NULL,
  is_featured   INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS product_i18n (
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL,
  name          TEXT NOT NULL,
  summary       TEXT,
  description   TEXT,
  specs_json    TEXT NOT NULL DEFAULT '[]',   -- [{label,value}]
  highlights_json TEXT NOT NULL DEFAULT '[]', -- [{name,desc}]
  PRIMARY KEY (product_id, lang)
);

-- 产品配图(多图,可排序)
CREATE TABLE IF NOT EXISTS product_media (
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id      INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, media_id)
);

-- ── 媒体库:运营拖拽上传的图片,文件存 R2,这里只存索引 ──────────────────────
--    纪律(zero-r2-move):R2 里的 key 一次写定,永不搬移;
--    重新归类只改本表的 folder 字段,绝不 copy 对象(曾因事后搬图一天烧 $40)。
CREATE TABLE IF NOT EXISTS media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- R2 对象键,形如 media/2026/08/uuid.jpg —— 写定后永不变更
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  -- 分类只改这个字段,不动 R2 对象
  folder        TEXT NOT NULL DEFAULT 'uncategorized',
  -- 无障碍必需:没有 alt 的图后台会标红提醒
  alt_zh        TEXT,
  alt_en        TEXT,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 询盘池:落地页表单提交落库(PDF 第 7 屏「提交即进系统询盘池」)──────────
CREATE TABLE IF NOT EXISTS inquiries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  lang          TEXT NOT NULL,
  name          TEXT NOT NULL,
  company       TEXT,
  email         TEXT NOT NULL,
  country       TEXT,
  message       TEXT NOT NULL,
  -- 反垃圾:蜜罐字段命中或频率超限时标记,不直接丢弃以便复核
  spam_score    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new',   -- new / replied / archived
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 用户与修订 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  -- 只存 PBKDF2 派生值与盐,绝不存明文口令
  pass_hash     TEXT NOT NULL,
  pass_salt     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor',  -- admin / editor
  display_name  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 修订历史:改错了能回滚,这是 WP 后台最被依赖的能力之一
CREATE TABLE IF NOT EXISTS revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity        TEXT NOT NULL,              -- block_i18n / product_i18n / page_i18n
  entity_id     TEXT NOT NULL,              -- 复合主键序列化后的值
  lang          TEXT,
  before_json   TEXT,
  after_json    TEXT NOT NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 索引:按站按语言取内容是最高频查询 ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pages_site      ON pages(site_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_blocks_page     ON blocks(page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_site   ON products(site_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_media_folder    ON media(folder, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_site  ON inquiries(site_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_ent   ON revisions(entity, entity_id, created_at DESC);
