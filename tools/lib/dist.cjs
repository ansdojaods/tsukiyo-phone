/**
 * 版本号与发布件路径的唯一来源：package.json。
 * 测试与发布脚本都从这里取，升版本时不用再逐个改测试里写死的文件名（v2.9.7 起）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function pkgVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
}

/** 独立版发布件：dist/tsukiyo-phone-v<版本>.js */
function distFile(version = pkgVersion()) {
  return path.join(ROOT, "dist", "tsukiyo-phone-v" + version + ".js");
}

module.exports = { ROOT, pkgVersion, distFile };
