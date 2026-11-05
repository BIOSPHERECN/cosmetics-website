/**
 * 补产品 description + specs_json（可含 faq）。不改上架状态，不新建产品。
 *
 * 样例导入（这条不会写库；slug 是假的，库里没有就不会更新任何行）:
 *   node tools/listing-cite-import.mjs tools/listing-cite.sample.json
 *
 * 写入已有产品（仍不把 status 改成 published）:
 *   node tools/listing-cite-import.mjs 你的文件.json --apply
 *
 * 文件可以是一条对象，或 { "items": [ ... ] }。
 * 每条: slug（必填）、lang（默认 zh-cn）、description、specs_json、faq。
 * specs_json 为对象时按键并进现有 JSON；为数组时写入 list，原来的规格列表也留在 list。
 * faq 写成 specs_json.faq，产品页可见问答和 FAQPage 用这一份。
 * 描述仍是占位或有效字不足 120 时也可以先写入，后台上架会被拦住。本脚本不改 products.status。
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  effectiveCharCount,
  listingPublishBlock,
  mergeSpecsJson,
} from '../apps/web/src/lib/listing-cite.ts';

const SLUG_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANG_OK = /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/;

export function loadListingFile(raw) {
  const data = JSON.parse(raw);
  const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [data]);
  return items.map((row, i) => normalizeRow(row, i));
}

function normalizeRow(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`第 ${index + 1} 条不是对象`);
  }
  const slug = String(row.slug ?? '').trim().toLowerCase();
  const lang = String(row.lang ?? 'zh-cn').trim().toLowerCase();
  const description = String(row.description ?? '').replace(/\r\n/g, '\n').trim();
  if (!SLUG_OK.test(slug)) throw new Error(`第 ${index + 1} 条 slug 不合法: ${slug || '（空）'}`);
  if (!LANG_OK.test(lang)) throw new Error(`第 ${index + 1} 条 lang 不合法: ${lang}`);
  if (!description) throw new Error(`第 ${index + 1} 条 ${slug} 没有 description`);
  if (description.length > 8000) throw new Error(`第 ${index + 1} 条 ${slug} 描述超过 8000 字`);
  const faq = row.faq ?? row.specs_json?.faq;
  return {
    slug,
    lang,
    description,
    specs: row.specs_json,
    faq: Array.isArray(faq) ? faq : undefined,
    chars: effectiveCharCount(description),
    publishBlock: listingPublishBlock(description),
  };
}

export function previewSpecs(row) {
  return mergeSpecsJson('[]', row.specs, row.faq);
}

function sqlQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

export function updateSql(row, currentSpecs, site) {
  const specs = mergeSpecsJson(currentSpecs, row.specs, row.faq);
  return `UPDATE product_i18n SET description=${sqlQuote(row.description)}, specs_json=${sqlQuote(specs)}
WHERE lang=${sqlQuote(row.lang)}
  AND product_id=(SELECT id FROM products WHERE site_id=${sqlQuote(site)} AND slug=${sqlQuote(row.slug)})`;
}

function printPlan(file, rows) {
  console.log('PL-3 描述回填（干跑，未写库）');
  console.log(`文件: ${file}`);
  console.log(`条数: ${rows.length}`);
  for (const row of rows) {
    const gate = row.publishBlock ? `上架会被拦：${row.publishBlock}` : '字数够上架闸，但本脚本仍不改 status';
    console.log(`- slug=${row.slug} lang=${row.lang} 有效字=${row.chars} ${gate}`);
  }
  console.log('');
  console.log('样例导入说明:');
  console.log('  只看计划: node tools/listing-cite-import.mjs tools/listing-cite.sample.json');
  console.log('  写入已有产品: node tools/listing-cite-import.mjs 你的文件.json --apply');
  console.log('  --apply 按 slug + lang 更新 description 与 specs_json。找不到产品不会新建，也不会把 status 改成 published。');
  console.log('  上架仍走后台「发布」或列表「上架」。描述是「Product: 名称.」占位，或有效字少于 120，会被拦住。');
  console.log('  样例 slug example-barrier-serum 是假的，不要对它 --apply。');
}

async function applyRows(rows, site) {
  const { d1 } = await import('./d1.mjs');
  let missed = 0;
  for (const row of rows) {
    const found = d1(
      `SELECT i.specs_json AS specs_json FROM product_i18n i
         JOIN products p ON p.id = i.product_id
        WHERE p.site_id=${sqlQuote(site)} AND p.slug=${sqlQuote(row.slug)} AND i.lang=${sqlQuote(row.lang)}`,
    );
    if (!found.length) {
      missed += 1;
      console.error(`没有这支产品，未新建: ${site} / ${row.lang} / ${row.slug}`);
      continue;
    }
    d1(updateSql(row, found[0].specs_json, site));
    console.log(`已写入 ${row.slug}（${row.lang}），未改上架状态`);
  }
  if (missed) process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const apply = args.includes('--apply');
  const file = args.find((a) => !a.startsWith('--'));
  const siteFlag = args.find((a) => a.startsWith('--site='));
  const site = siteFlag ? siteFlag.slice('--site='.length) : 'biosphere-ai';
  if (!file) {
    console.error('用法: node tools/listing-cite-import.mjs <文件.json> [--apply] [--site=biosphere-ai]');
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/.test(site)) {
    console.error('site 不合法');
    process.exit(1);
  }
  const rows = loadListingFile(readFileSync(file, 'utf8'));
  if (!rows.length) {
    console.error('文件里没有条目');
    process.exit(1);
  }
  if (!apply) {
    printPlan(file, rows);
    return;
  }
  await applyRows(rows, site);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
