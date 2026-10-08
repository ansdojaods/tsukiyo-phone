#!/usr/bin/env node
/**
 * 同步 docs/模块索引.md 里的行号与切片数（v2.9.7 起由 tools/release.js 自动调用）。
 *
 * 做法：发布件 = manifest 各切片按顺序拼接，用每个切片的 chars 精确算出起始行号回填表格。
 * 只改「行号」「切片数」「字符 / 行数」「版本号」这些可机械计算的字段，职责描述保持人工维护。
 *
 *   node tools/sync-module-index.js            # 直接写回
 *   node tools/sync-module-index.js --check    # 只检查是否过期（过期则退出码 1），供 CI 使用
 */
const fs = require("fs");
const path = require("path");
const { ROOT, pkgVersion, distFile } = require("./lib/dist.cjs");

const checkOnly = process.argv.includes("--check");
const version = pkgVersion();
const bundle = fs.readFileSync(distFile(version), "utf8");
const lines = bundle.split("\n");

// 1) 切片起始行：发布件 = manifest 各切片按顺序拼接，因此可由 chars 精确算出每个切片的起始行（1 起）
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "manifest.json"), "utf8"));
const chunks = manifest.chunks || [];
const startLine = new Map();
let offset = 0;
for (const c of chunks) {
  const before = bundle.slice(0, offset);
  const lineNo = (before.match(/\n/g) || []).length + 1;
  startLine.set("src/" + c.file, lineNo);
  offset += c.chars;
}
if (offset !== bundle.length) throw Error("发布件长度与 manifest 不一致（" + offset + " ≠ " + bundle.length + "），请先运行 node tools/release.js");

const indexPath = path.join(ROOT, "docs", "模块索引.md");
let doc = fs.readFileSync(indexPath, "utf8");
const before = doc;

const missing = [];
doc = doc.replace(/^(\| `(src\/[^`]+)` \| )(\d+)( \|)/gm, (all, head, file, _num, tail) => {
  const n = startLine.get(file);
  if (n === undefined) {
    missing.push(file);
    return all;
  }
  return head + n + tail;
});

doc = doc.replace(/\*\*\d+ 个切片\*\*/, `**${chunks.length} 个切片**`);
doc = doc.replace(/\*\*\d+ 字符 \/ \d+ 行\*\*/, `**${bundle.length} 字符 / ${lines.length} 行**`);
doc = doc.replace(/dist\/tsukiyo-phone-v[\d.]+\.js/g, `dist/tsukiyo-phone-v${version}.js`);
doc = doc.replace(/^# 模块索引（v[\d.]+）/m, `# 模块索引（v${version}）`);

const changed = doc !== before;
if (missing.length) console.warn("· 以下切片在发布件里找不到边界注释，行号未更新：\n  " + missing.join("\n  "));
if (checkOnly) {
  if (changed) {
    console.error("✗ docs/模块索引.md 已过期，请运行 node tools/sync-module-index.js");
    process.exit(1);
  }
  console.log("✓ docs/模块索引.md 与发布件一致");
} else {
  if (changed) fs.writeFileSync(indexPath, doc, "utf8");
  console.log(changed ? "✓ docs/模块索引.md 已同步（" + chunks.length + " 个切片 · v" + version + "）" : "· docs/模块索引.md 无需改动");
}
