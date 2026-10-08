#!/usr/bin/env node
/**
 * 跨仓库契约测试 · 手机侧（记忆工作台 ms*）
 *
 * 手机 v2.9 的记忆工作台与百宝月夜书的剧情剪辑台 core 是同一套算法的两份实现
 * （有意为之：引擎没装时手机自管）。本文件把两侧必须一致的取值固定成夹具：
 * 账本键归一、覆盖块切分几何。任何一侧改算法，自己这份测试先红。
 *
 * 对照实现：`ST-BaiBai-Book-Tsukiyo/tests/memory-editor/contract.test.cjs`。
 * 默认路径找不到柏宝书仓库时，跨仓库夹具比对会自动跳过（不失败）。
 *
 *   node tools/test_contract.cjs [dist/tsukiyo-phone-v<版本>.js]
 */
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || require("./lib/dist.cjs").distFile();
const src = fs.readFileSync(FILE, "utf8");
let code = src.replace(/TsukiyoPhoneBundle\.start\([^)]*\);?\s*$/, "");
code = code.replace(
  "return __toCommonJS(index_exports);",
  "__export(index_exports, { msCoverage: () => msCoverage, msLedgerKey: () => msLedgerKey, msNorm: () => msNorm });\n  return __toCommonJS(index_exports);",
);
const mod = { exports: {} };
const bundle = new Function("module", "exports", code + "\n;return TsukiyoPhoneBundle;")(mod, mod.exports);
const { msCoverage, msLedgerKey, msNorm } = bundle;

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) {
    fails += 1;
    console.log("  ✗", msg);
  } else console.log("  ✓", msg);
};
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}${JSON.stringify(a) === JSON.stringify(b) ? "" : `（实际 ${JSON.stringify(a)} ≠ 期望 ${JSON.stringify(b)}）`}`);

// @contract-fixture:begin
const CONTRACT_FIXTURE = {
  coverage: [
    {
      name: "两块都覆盖",
      tree: [[0, 5], [6, 11]],
      from: 0,
      to: 23,
      step: 6,
      extraMissing: [],
      expect: { total: 4, covered: 2, missing: [[12, 17], [18, 23]], ratio: 0.5, extraMissing: [] },
    },
    {
      name: "宿主额外报告缺失楼层（落在已覆盖块里的才算数）",
      tree: [[0, 5], [6, 11], [18, 23]],
      from: 0,
      to: 23,
      step: 6,
      extraMissing: [3, 20],
      expect: { total: 4, covered: 3, missing: [[3, 3], [12, 17], [20, 20]], ratio: 0.75, extraMissing: [3, 20] },
    },
  ],
  ledgerKeys: [
    { row: { kind: "person", subject: " 临 安 ", key: "关系（阶段）" }, key: "person|临安|关系阶段" },
    { row: { kind: "", subject: "临安", key: "关系阶段" }, key: "other|临安|关系阶段" },
    { row: { kind: "Item", subject: "Lantern", key: "Status" }, key: "item|lantern|status" },
  ],
};
// @contract-fixture:end

const mk = (id, a, b, level = 0) => ({ id, level, from: a, to: b, text: "", covers: [], kept: true, ts: 1 });

console.log("跨仓库契约 · 账本键");
for (const { row, key } of CONTRACT_FIXTURE.ledgerKeys) eq(msLedgerKey(row), key, `msLedgerKey(${row.kind}/${row.subject}/${row.key})`);
eq(msNorm(" 临 安 "), "临安", "msNorm 去空白");
eq(msNorm("关系（阶段）"), "关系阶段", "msNorm 去标点");

console.log("跨仓库契约 · 覆盖几何（手机只把 0 级摘要当覆盖，与剪辑台「任意生效节点」是有意差异）");
/** 根据 from/to/step 生成块网格，用来判断缺口区间是不是「整块」——手机的 msCoverage 只产出整块 */
const gridWindows = (from, to, step) => {
  const size = Math.max(1, Math.round(step || 6));
  const lo = Math.max(0, Math.round(from));
  const hi = Math.max(lo, Math.round(to));
  const out = [];
  for (let a = lo; a <= hi; a += size) out.push([a, Math.min(hi, a + size - 1)]);
  return out;
};
const isGrid = (win, grid) => grid.some(([a, b]) => a === win[0] && b === win[1]);
for (const item of CONTRACT_FIXTURE.coverage) {
  const tree = item.tree.map(([a, b], i) => mk(`n${i}`, a, b));
  const r = msCoverage(tree, item.from, item.to, item.step);
  const grid = gridWindows(item.from, item.to, item.step);
  eq(r.total, item.expect.total, `${item.name} · total`);
  eq(r.covered, item.expect.covered, `${item.name} · covered`);
  eq(r.ratio, item.expect.ratio, `${item.name} · ratio`);
  eq(r.missing, item.expect.missing.filter((w) => isGrid(w, grid)), `${item.name} · missing（只比整块；宿主额外报的单楼缺失是剪辑台侧扩展）`);
}
const levelOnly = [{ id: "s", level: 1, from: 0, to: 23, text: "", covers: [], kept: true, ts: 1 }];
eq(msCoverage(levelOnly, 0, 23, 6).missing.length, 4, "1 级摘要不算手机的块覆盖（设计如此：阶段总结由手机另行处理）");

console.log("跨仓库契约 · 两侧夹具一致");
const candidates = [
  process.env.BOOK_DIR,
  path.join(__dirname, "..", "..", "ST-BaiBai-Book-Tsukiyo"),
  path.join(__dirname, "..", "..", "..", "ST-BaiBai-Book-Tsukiyo"),
].filter(Boolean);
const file = candidates.map((dir) => path.join(dir, "tests", "memory-editor", "contract.test.cjs")).find((p) => fs.existsSync(p));
if (!file) {
  console.log("  · 本机没有柏宝书仓检查目录，跨仓库比对已跳过（不失败）");
} else {
  const read = (text) => {
    const m = text.match(/@contract-fixture:begin([\s\S]*?)@contract-fixture:end/);
    return m ? m[1].replace(/\s+/g, "") : "";
  };
  ok(read(fs.readFileSync(__filename, "utf8")) === read(fs.readFileSync(file, "utf8")), "两侧 @contract-fixture 块逐字节一致（忽略空白）");
}

if (fails) {
  console.log(`\n✗ 契约测试未通过：${fails} 项`);
  process.exit(1);
}
console.log("\n✓ 契约测试全部通过（账本键 + 覆盖几何 + 两侧夹具一致）");
