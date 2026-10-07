#!/usr/bin/env node
/**
 * v2.9.6 冒烟测试：楼层记忆归属互斥（检测到百宝月夜书「剧情剪辑台」时手机不重复生成 / 不重复注入）。
 *
 *   node tools/smoke_delegate.js [dist/tsukiyo-phone-v2.9.6.js]
 */
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || path.join(__dirname, "..", "dist", "tsukiyo-phone-v2.9.6.js");
const src = fs.readFileSync(FILE, "utf8");
let code = src.replace(/TsukiyoPhoneBundle\.start\([^)]*\);?\s*$/, "");
code = code.replace(
  "return __toCommonJS(index_exports);",
  "__export(index_exports, { freshPhone: () => freshPhone, msFresh: () => msFresh, msData: () => msData, msValidate: () => msValidate, MemoryStudio: () => MemoryStudio, msRecallBlock: () => msRecallBlock, msDelegateCard: () => msDelegateCard });\n  return __toCommonJS(index_exports);",
);
const mod = { exports: {} };
const bundle = new Function("module", "exports", code + "\n;return TsukiyoPhoneBundle;")(mod, mod.exports);
const { freshPhone, msFresh, msData, msValidate, MemoryStudio, msDelegateCard } = bundle;

let fails = 0;
const ok = (cond, msg) => {
  if (!cond) {
    fails += 1;
    console.log("  ✗", msg);
  } else console.log("  ✓", msg);
};

/* 假引擎：一份 12 楼聊天 + 一条手机记忆 + 一棵含「摘要标记甲」的摘要树 */
function makeEngine({ editor = true, editorEnabled = true, editorInParent = false } = {}) {
  const data = freshPhone();
  data.ms.enabled = true;
  data.ms.cfg.minScore = 0;
  data.memories = [
    { id: "m1", kind: "narrative_fact", title: "手机记忆", text: "记忆标记乙：两人在河灯埠约好保密。", keys: [], enabled: true, audience: ["user"], visibility: "private", sources: [] },
  ];
  data.ms.tree = [
    { id: "n1", level: 0, from: 0, to: 5, text: "摘要标记甲：第 1—6 楼在河灯埠谈税银案。", covers: [], source: "ai", kept: true, ts: 1 },
  ];
  const history = [];
  for (let i = 0; i < 12; i += 1) history.push({ role: i % 2 ? "assistant" : "user", text: "第" + (i + 1) + "楼：他们在河灯埠说税银案。", floor: i });
  const bridge = {
    mode: "extension",
    isBusy: () => false,
    isTyping: () => false,
    same: () => true,
    setPrompt: () => true,
    context: () => null,
    capture: () => ({ owner: "o1", floor: 11, present: [], character: { name: "测试卡" }, history, story: { date: "1604-09-05", time: "傍晚", place: "河灯埠" } }),
  };
  const editorApi = {
    capability: () => ({ available: true, apiVersion: 1, pluginVersion: "1.4.2", enabled: editorEnabled !== false, mode: "extra" }),
    open: () => {
      editorApi.opened = (editorApi.opened || 0) + 1;
    },
    mirror: () => ({
      available: true,
      apiVersion: 1,
      pluginVersion: "1.4.2",
      enabled: editorEnabled !== false,
      mode: "extra",
      counts: { summaries: 9, active: 3, drafts: 1, ledger: 4, hidden: 0 },
      coverage: { from: 0, to: 23, step: 6, total: 4, covered: 3, missing: [[18, 23]], ratio: 0.75, extraMissing: [] },
      lastRecall: { at: Date.now(), floor: 11, chars: 320, budget: 3600, hits: [{ label: "剧情摘要 1-6 楼", score: 0.4, why: ["局部相似度 0.40"] }] },
    }),
  };
  const listeners = new Map();
  const makeWin = () => {
    const w = {
      STBaiBaiBook: { memoryEditor: editorApi },
      addEventListener: (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
      },
      removeEventListener: (name, fn) => {
        const list = listeners.get(name) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
    };
    return w;
  };
  const win = editor ? makeWin() : {};
  if (editor && editorInParent) {
    // 模拟「手机在 iframe / 卡内脚本里，剪辑台在父窗口」：win 自己没有编辑器，parent 有
    win.parent = makeWin();
  } else if (editor) {
    win.parent = win;
  }
  win.__emitEditor = (detail) => {
    for (const fn of (listeners.get("st-baibai-book:memory-editor") || []).slice()) {
      try {
        fn({ type: "st-baibai-book:memory-editor", detail });
      } catch {
      }
    }
  };
  win.__editorApi = editorApi;
  win.__editorInParent = !!editorInParent;
  const engine = {
    bridge,
    win,
    repo: { data, snapshot: bridge.capture(), mutate: (fn) => { fn(data); return data; }, choose: () => data },
    settings: { secrets: () => [], data: { ui: {} }, isEnabled: () => true, route: () => ({ id: "tavern" }), key: () => "" },
    gate: { counts: () => ({ hour: 0, day: 0 }), run: async (fn) => fn(() => true), reserve: () => true },
    runner: { busy: false },
    events: { emit: () => {} },
    bookStudio: { notePhoneChange: () => {} },
    actions: { perform: async () => { throw Error("冒烟测试不真的调用模型"); } },
    router: { call: async () => "{}" },
  };
  return { engine, data };
}

console.log("\n[13] v2.9.5/2.9.6 楼层记忆归属互斥（归属探测 / 拦截 / 只留手机内记忆 / 镜像）");

const v1 = msFresh();
ok(v1.delegate && v1.delegate.enabled === true && v1.delegate.keepPhoneRecall === false, "默认：开关打开、不重复注入手机内记忆");
ok(v1.delegate.counts === null && v1.delegate.at === 0, "默认：镜像为空，尚未探测");

let vBad = 0;
const brokenDelegate = msFresh();
brokenDelegate.delegate = { enabled: "yes" };
try { msValidate(brokenDelegate); } catch (e) { vBad += 1; }
const legacy = msFresh();
delete legacy.delegate;
let vLegacy = 0;
try { msValidate(legacy); vLegacy = legacy.delegate && legacy.delegate.enabled === true ? 1 : 0; } catch (e) { vLegacy = 0; }
ok(vBad === 1 && vLegacy === 1, "校验器：非法归属开关被拦下、老存档缺字段自动补齐");

/* ① 没有引擎：一切照旧 */
const a = makeEngine({ editor: false });
const msA = new MemoryStudio(a.engine);
a.engine.ms = msA;
let aThrew = 0;
try { msA.assertOwner("剧情摘要"); } catch (e) { aThrew += 1; }
ok(msA.delegated() === false && aThrew === 0, "未检测到引擎：不接管，手机继续自己管");
ok(msA.syncMirror({ force: true }) === null, "未检测到引擎：镜像探测返回空，不假装成功");

/* ② 有引擎：接管 */
const b = makeEngine({ editor: true });
const msB = new MemoryStudio(b.engine);
b.engine.ms = msB;
ok(msB.delegated() === true, "检测到 window.STBaiBaiBook.memoryEditor：进入接管状态");
let bThrew = 0;
try { msB.assertOwner("剧情摘要"); } catch (e) { bThrew = /已交由百宝月夜书管理/.test(String(e.message)) ? 1 : 0; }
let bThrows = 0;
for (const fn of [
  () => msB.block([0, 5]),
  () => msB.stage({ from: 0, to: 5 }),
  () => msB.longer({ from: 0, to: 5 }),
  () => msB.ledgerScan([0, 5]),
]) {
  try { void fn(); } catch (e) { if (/已交由百宝月夜书管理/.test(String(e.message))) bThrows += 1; }
}
ok(bThrew === 1 && bThrows === 4, "拦截：剧情摘要 / 阶段总结 / 多次总结 / 状态核对全部改为报错引导");

const mirrored = msB.syncMirror({ force: true });
ok(
  !!mirrored && b.data.ms.delegate.engine === "1.4.2" && b.data.ms.delegate.counts.active === 3 && b.data.ms.delegate.coverage.ratio === 0.75 && !!b.data.ms.delegate.lastRecall,
  "镜像：把引擎的版本 / 摘要数 / 覆盖率 / 上次召回写进存档",
);

/* ③ 注入：默认不再注入楼层记忆，开了开关才注入且只带手机内记忆 */
const projOff = msB.projection(b.data, b.engine.repo.snapshot);
ok(projOff === "", "接管且不保留手机内注入：楼层记忆块完全不生成（不会和引擎重复）");

msB.setDelegate(true, { keepPhoneRecall: true });
const projOn = msB.projection(b.data, b.engine.repo.snapshot);
ok(
  projOn.indexOf("记忆标记乙") >= 0 && projOn.indexOf("摘要标记甲") < 0 && projOn.indexOf("只列手机内记忆") >= 0,
  "接管但保留手机内注入：只带手机自己的记忆，摘要树不参与",
);

/* ④ 生成结束不再自动摘要，只同步镜像 */
const c = makeEngine({ editor: true });
const msC = new MemoryStudio(c.engine);
c.engine.ms = msC;
c.data.ms.seen.blockAt = 0;
msC.onGenerationEnded();
ok(c.data.ms.drafts.length === 0 && c.data.ms.delegate.at > 0, "生成结束：不自动摘要，只刷新镜像");

/* ⑤ 界面与关回自管 */
const card = msDelegateCard({ data: { ms: b.data.ms }, engine: { ms: msB } });
ok(card.indexOf("楼层记忆归属") >= 0 && card.indexOf("引擎接管中") >= 0 && card.indexOf("楼层记忆交由引擎管理") >= 0, "工作台顶部卡片：显示接管状态与开关");

msB.setDelegate(false);
let backThrew = 0;
try { msB.assertOwner("剧情摘要"); } catch (e) { backThrew += 1; }
ok(msB.delegated() === false && backThrew === 0, "关掉开关即改回手机自己管理（不需要重启）");

/* ⑥ v2.9.5：剪辑台总开关 / 候选窗口 / 镜像事件 / 反向打开 */
const d1 = makeEngine({ editor: true, editorEnabled: false });
const msD = new MemoryStudio(d1.engine);
d1.engine.ms = msD;
ok(msD.delegated() === false, "剪辑台总开关关着时不算接管（手机继续自己管，避免两头空）");
let dThrew = 0;
try {
  msD.assertOwner("剧情摘要");
} catch (e) {
  dThrew += 1;
}
ok(dThrew === 0, "总开关关着：手机生成楼层摘要不再被拦截");
const dMirror = msD.syncMirror({ force: true });
ok(!!dMirror && dMirror.closed === true && dMirror.counts === null, "镜像标记「剪辑台已关闭」，不显示过期数据");
ok(msD.setDelegate(true) === false, "开着归属开关但剪辑台关闭 → 仍是手机自管");
ok(msD.engineEditor().closed === true, "engineEditor 仍能报出剪辑台「装着但关着」");

const d2 = makeEngine({ editor: true, editorEnabled: true });
const msE = new MemoryStudio(d2.engine);
d2.engine.ms = msE;
msE.start();
ok(msE.delegated() === true, "总开关打开：恢复接管");
d2.engine.win.__emitEditor({
  available: true, apiVersion: 1, pluginVersion: "1.4.2", enabled: true,
  counts: { summaries: 12, active: 5, drafts: 2, ledger: 6, hidden: 1 },
  coverage: { from: 0, to: 35, step: 6, total: 6, covered: 5, missing: [[30, 35]], ratio: 0.83, extraMissing: [] },
  lastRecall: { at: Date.now(), floor: 17, chars: 400, budget: 3600, hits: [] },
});
ok(
  msE.data().ms.delegate.counts.active === 5 && msE.data().ms.delegate.coverage.ratio === 0.83 && msE.data().ms.delegate.engine === "1.4.2",
  "订阅 st-baibai-book:memory-editor：镜像事件一到就写进存档（不用等 10 秒节流）",
);
msE.stop();

const p1 = makeEngine({ editor: true, editorInParent: true });
const msP = new MemoryStudio(p1.engine);
p1.engine.ms = msP;
ok(msP.delegated() === true, "剪辑台在父窗口（iframe/卡内脚本）时也能探测到：与柏宝书桥用同一套候选窗口");

const msOpen = new MemoryStudio(d2.engine);
d2.engine.ms = msOpen;
const apiOpen = msOpen.engineEditor();
apiOpen.api.open();
ok(d2.engine.win.__editorApi.opened === 1, "剪辑台提供了 open()：手机工作台可以反向打开它");

/* ⑦ 静态检查 */
const patched = src;
ok(
  /version: "2\.9\.6"/.test(patched) && /小手机 v2\.9\.6/.test(patched),
  "版本号与头部注释 2.9.6",
);
ok(
  /delegate: \{ enabled: true, keepPhoneRecall: false/.test(patched) && /this\.assertOwner\(/.test(patched) && /msDelegateCard/.test(patched) && /keepPhoneRecall: false, engine: ""/.test(patched),
  "静态：默认值 / 拦截方法 / 归属卡片 / 镜像字段都已打包",
);
ok(/STBaiBaiBook\?\.memoryEditor/.test(patched), "静态：只读 window.STBaiBaiBook.memoryEditor，不写它的数据");

console.log(fails ? `\n✗ ${fails} 项失败` : "\n✓ 全部通过");
process.exitCode = fails ? 1 : 0;
