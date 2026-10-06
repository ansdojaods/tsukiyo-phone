#!/usr/bin/env node
/**
 * 一键重建发布件（v2.9.2 起加入）：
 *
 *   node tools/release.js
 *
 * 依次做三件事：
 *   1. 按 src/manifest.json 的切片顺序重新计算每个切片的字符数 / sha256，并更新整包 sha256；
 *   2. 拼出 dist/tsukiyo-phone-v<版本>.js（独立版）与 dist/tsukiyo-phone-v<版本>.embedded.js
 *      （卡内嵌版：把 tools/embedded-preset.json 注入 _prelude.js 的 TSUKIYO_PRESET 注入位）；
 *   3. 生成 dist/月夜来信小手机_酒馆助手导入版_v<版本>_剧情中心.json（酒馆助手「导入」用，
 *      content 就是独立版全文，id 沿用旧值以便覆盖式升级）。
 *
 * 只改 src/ 与 tools/，这个脚本负责让 dist/ 跟上；不需要联网、不需要装依赖。
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const pkg = { version: "2.9.2", name: "tsukiyo-phone" };
const manifestPath = path.join(root, "src", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

// ---- 1. manifest：顺序不变，条目按 src/ 实际内容重算 ----
const chunks = [];
let out = "";
for (const c of manifest.chunks) {
  const file = c.file;
  const body = fs.readFileSync(path.join(root, "src", file), "utf8");
  chunks.push({ file, chars: body.length, sha256: sha(body) });
  out += body;
}
manifest.generator = "tools/release.js";
manifest.version = pkg.version;
manifest.sha256 = sha(out);
manifest.chunks = chunks;
manifest.note = "切片为逐字节内容，按 chunks 顺序拼接即为发布版脚本；shas 由 tools/release.js 重算";
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log("✓ src/manifest.json 已更新（" + chunks.length + " 个切片）· 整包 sha256 " + manifest.sha256);

// ---- 2. 独立版 / 卡内嵌版 ----
const distDir = path.join(root, "dist");
const plain = path.join(distDir, "tsukiyo-phone-v" + pkg.version + ".js");
fs.writeFileSync(plain, out, "utf8");
console.log("✓ dist/tsukiyo-phone-v" + pkg.version + ".js（" + out.length + " 字符）");

const presetFile = path.join(__dirname, "embedded-preset.json");
if (fs.existsSync(presetFile)) {
  const preset = fs.readFileSync(presetFile, "utf8").trim();
  const marker = "var TSUKIYO_PRESET = /*@@PRESET@@*/null/*@@END@@*/;";
  if (!out.includes(marker)) throw new Error("找不到 TSUKIYO_PRESET 注入位，_prelude.js 可能被改过");
  const embedded = out.replace(marker, "var TSUKIYO_PRESET = /*@@PRESET@@*/" + preset + "/*@@END@@*/;");
  const embeddedPath = path.join(distDir, "tsukiyo-phone-v" + pkg.version + ".embedded.js");
  fs.writeFileSync(embeddedPath, embedded, "utf8");
  console.log("✓ dist/tsukiyo-phone-v" + pkg.version + ".embedded.js（" + embedded.length + " 字符，含卡内嵌预设）");
} else {
  console.log("· 未找到 tools/embedded-preset.json，跳过卡内嵌版");
}

// ---- 3. 酒馆助手导入版 JSON（content = 独立版全文） ----
const oldJson = fs
  .readdirSync(distDir)
  .filter((f) => f.startsWith("月夜来信小手机_酒馆助手导入版_") && f.endsWith(".json"))
  .sort()
  .pop();
const meta = oldJson
  ? JSON.parse(fs.readFileSync(path.join(distDir, oldJson), "utf8"))
  : { type: "script", enabled: true, id: "5ac630d9-b12e-53ec-bfd1-c7069b1337e5", button: { enabled: false, buttons: [] }, data: {}, export_with: { data: true, button: true } };
const newInfo =
  "v2.9.2（在 v2.9.1 基础上的减重整改）① 删除「外部 SoulLink 扩展桥」：它要求你先安装第三方酒馆扩展，并把手机记录写回别人的扩展设置，而小手机本就内置了功能重叠的「灵魂链接（NPC 档案 + 发送前推演）」，设置页与主页两处同名入口也容易误解——现在只保留内置灵魂链接，数据全部在本机存档里，不读取、不依赖任何外部扩展；② 清掉历年遗留的死代码（无人调用的旧页面 plannerView、旧导入函数 oldPhone、两个未使用的记忆工作台辅助函数、与 SoulStudio.exportRoster 重复的导出函数），并把 PhoneEngine 组装类从 soullink-bridge.js 切片搬回 core/engine.js；③ 修复「灵魂链接 → 导出名单」按钮调用了一个不存在的方法（点击只会报错）的问题；④ 模块索引、README、CHANGELOG 全部按新结构重写，tools/release.js 一键重建全部发布件。\n\n";
const payload = {
  ...meta,
  type: "script",
  enabled: true,
  name: "月夜来信 · 小手机 v" + pkg.version + "（记忆工作台 · 楼层记忆归属互斥 · 分层摘要 · 本地召回 · 百宝月夜书联动）",
  content: out,
  info: newInfo + (meta.info || ""),
};
const jsonPath = path.join(distDir, "月夜来信小手机_酒馆助手导入版_v" + pkg.version + "_剧情中心.json");
fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
console.log("✓ dist/" + path.basename(jsonPath) + "（" + fs.statSync(jsonPath).size + " 字节）");

// ---- 4. 清掉旧版本产物（避免 dist 里同时躺着两份） ----
const keep = new Set([path.basename(plain), path.basename(jsonPath)]);
for (const f of fs.readdirSync(distDir)) {
  if (f.includes("v2.9.1") || (f.startsWith("月夜来信小手机_酒馆助手导入版_") && !keep.has(f))) {
    fs.unlinkSync(path.join(distDir, f));
    console.log("· 已移除旧产物 dist/" + f);
  }
}
