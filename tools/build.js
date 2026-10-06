#!/usr/bin/env node
/**
 * 把 src/ 下的模块切片按 manifest 顺序拼回单文件脚本（默认写到 dist/tsukiyo-phone-v2.9.1.js）。
 *
 *   node tools/build.js                 # 默认输出到 dist/tsukiyo-phone-v2.9.1.js
 *   node tools/build.js /tmp/out.js      # 指定输出路径
 *
 * 判定：拼出的内容 sha256 与 manifest.sha256 相同时，说明与发布版逐字一致；
 * 不相同则说明你改过源码（属正常），脚本会打印新的 sha256 供你记录。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "src", "manifest.json"), "utf8"));
const target = process.argv[2] || path.join(root, "dist", "tsukiyo-phone-v" + manifest.version + ".js");

let out = "";
for (const c of manifest.chunks) {
  const p = path.join(root, "src", c.file);
  const body = fs.readFileSync(p, "utf8");
  const sha = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  if (sha !== c.sha256) console.log("  注意：src/" + c.file + " 已改动（原 " + c.sha256.slice(0, 12) + "… 现 " + sha.slice(0, 12) + "…）");
  out += body;
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out, "utf8");
const sum = crypto.createHash("sha256").update(out, "utf8").digest("hex");
console.log("写出 " + path.relative(root, target) + "（" + out.length + " 字符）");
console.log(sum === manifest.sha256
  ? "✓ 与发布版逐字一致 · sha256 " + sum
  : "⚠ 与发布版不同（源码已修改）· 新 sha256 " + sum);
