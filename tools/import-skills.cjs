/**
 * 导入帛卉技能集 (64 个) 到 D1
 *
 * 用法: node tools/import-skills.js
 * 产出:
 *   - apps/web/schema/skills.sql (建表 + INSERT)
 *   - apps/web/src/pages/api/skills.ts
 *   - apps/web/src/pages/api/skills/[id].ts
 */
const path = require('path');
const fs = require('fs');

const SKILLS_DIR = "F:/0cosmetic/助手交付/7-帛卉电脑端/updates/skills";
const OUTPUT_DIR = "F:/0cosmetic/cosmetic-sites/apps/web/schema";
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 1. 读取所有 SKILL.md
const skillData = [];
let localeIndex = 0;
for (const dir of fs.readdirSync(SKILLS_DIR)) {
  const skillPath = path.join(SKILLS_DIR, dir, "SKILL.md");
  if (dir === ".") continue;
  if (!fs.existsSync(skillPath)) continue;
  localeIndex++;

  const content = fs.readFileSync(skillPath, "utf8");
  // 解析 frontmatter (--- 之间的 YAML)
  const lines = content.split("\n");
  let fmStart = -1, fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "---") {
      if (fmStart === -1) fmStart = i + 1;
      else { fmEnd = i; break; }
    }
  }
  const fmText = lines.slice(fmStart, fmEnd).join("\n");
  const fmLines = fmText.split("\n");
  let name = "", description = "", channel = "";

  for (const line of fmLines) {
    if (line.startsWith("name: ")) name = line.slice(6).trim();
    if (line.startsWith("description: ")) description = line.slice(13).trim();
    if (line.startsWith("channel: ")) channel = line.slice(9).trim();
  }
  // 用目录名当 id
  const id = dir;
  skillData.push({ id, name, description, channel, content });
}
console.log("✅ 已读取", skillData.length, "个技能。");

// 2. 生成 SQL
const sqlLines = [
  "-- Created by tools/import-skills.js",
  "-- Date: " + new Date().toISOString(),
  "",
  "CREATE TABLE IF NOT EXISTS skills (",
  "  id TEXT PRIMARY KEY,",
  "  name TEXT NOT NULL,",
  "  description TEXT NOT NULL,",
  "  channel TEXT,",
  "  content TEXT NOT NULL,",
  "  updated_at TEXT DEFAULT (datetime('now'))",
  ");",
  "",
  "-- 插入技能",
  ...skillData.map(s =>
    `INSERT INTO skills (id, name, description, channel, content) VALUES (` +
      `'${s.id.replace(/'/g, "''")}', '${s.name.replace(/'/g, "''")}', ` +
      `'${s.description.replace(/'/g, "''")}', '${s.channel.replace(/'/g, "''")}', ` +
      `'${s.content.replace(/'/g, "''")}'` +
    ");"
  ),
  "",
  "CREATE INDEX idx_skills_name ON skills(name);",
  "CREATE INDEX idx_skills_channel ON skills(channel);"
];
fs.writeFileSync(path.join(OUTPUT_DIR, "skills.sql"), sqlLines.join("\n"));
console.log("✅ 已生成 SQL: ", path.join(OUTPUT_DIR, "skills.sql"));

// 3. 生成 API 路由模板 (只在首次运行时创建)
if (!fs.existsSync(path.join("F:/0cosmetic/cosmetic-sites/apps/web/src/pages/api/skills.ts"))) {
  const apiContent = `
/**
 * GET /api/skills - 返回所有技能的列表（不含 content）
 * 需要登录
 */
import { readSession, COOKIE } from "@cosmetic/core/auth";
import { env } from "cloudflare:workers";

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  channel: string | null;
}

export interface APIRouteContext {
  env: D1Database;
  cookies: any;
}

export async function GET({ env, cookies }: APIRouteContext) {
  const token = cookies.get(COOKIE)?.value;
  const secret = String((env as any).SESSION_SECRET ?? (env as any).BOHUI_SESSION_SECRET ?? '');
  const session = token ? await readSession(token, secret) : null;
  if (!session) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { results } = await env.prepare("SELECT id, name, description, channel FROM skills ORDER BY sort_order, id").all();
  return new Response(JSON.stringify(results ?? []), { headers: { "Content-Type": "application/json" } });
}
`;
  fs.writeFileSync(path.join("F:/0cosmetic/cosmetic-sites/apps/web/src/pages/api/skills.ts"), apiContent.trim());
  console.log("✅ 已生成 API: /api/skills.ts");
}

// 4. 生成单个技能详情 API 模板
const skillsDir = "F:/0cosmetic/cosmetic-sites/apps/web/src/pages/api/skills";
if (!fs.existsSync(path.join(skillsDir, "[id].ts"))) {
  const apiContent = `
/**
 * GET /api/skills/[id] - 返回单个技能的完整内容
 * 需要登录
 */
import { readSession, COOKIE } from "@cosmetic/core/auth";
import { env } from "cloudflare:workers";

export interface APIRouteContext {
  env: D1Database;
  cookies: any;
  params: { id: string };
}

export async function GET({ env, cookies, params }: APIRouteContext) {
  const token = cookies.get(COOKIE)?.value;
  const secret = String((env as any).SESSION_SECRET ?? (env as any).BOHUI_SESSION_SECRET ?? '');
  const session = token ? await readSession(token, secret) : null;
  if (!session) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const { results } = await env.prepare("SELECT id, name, description, channel, content FROM skills WHERE id = ?").bind(params.id).all();
  const skill = results?.[0];
  if (!skill) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });

  return new Response(JSON.stringify(skill), { headers: { "Content-Type": "application/json" } });
}
`;
  fs.writeFileSync(path.join(skillsDir, "[id].ts"), apiContent.trim());
  console.log("✅ 已生成 API: /api/skills/[id].ts");
}

console.log("✅ 导入脚本执行完成。");
