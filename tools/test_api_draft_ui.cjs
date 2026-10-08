#!/usr/bin/env node
/**
 * v2.9.7 回归：API 方案编辑页的「测活」必须用表单里「现在」填的模型 / 地址 / 密钥，
 * 而不是已保存的旧值；草稿测活不得写入存档（不把未保存的改动悄悄存下来）。
 *
 * 真实 DOM（JSDOM）+ 假 fetch：
 *   ① 编辑页里把模型改成 new-model、填一个新密钥，直接点「测活」→ 请求的 model / Authorization 是草稿的；
 *   ② 存档里的方案仍是旧模型、旧密钥，revision 不变；
 *   ③ 留空密钥时沿用已保存的密钥；勾选「清除密钥」时不带密钥；
 *   ④ 列表里的「上次测活」不因草稿测试而写入。
 *
 *   node tools/test_api_draft_ui.cjs
 */
const fs = require("fs");
const path = require("path");
const A = require("node:assert/strict");
const { JSDOM } = require("jsdom");

let code = fs.readFileSync(require("./lib/dist.cjs").distFile(), "utf8").replace(/TsukiyoPhoneBundle\.start\([^)]*\);?\s*$/, "");
code = code.replace("return __toCommonJS(index_exports);", "__export(index_exports, { addContact: () => addContact, ensureThread: () => ensureThread });\n  return __toCommonJS(index_exports);");
const dom = new JSDOM("<html><body></body></html>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://apidraft.test/" });
const w = dom.window;
w.eval(code + ";window.B=TsukiyoPhoneBundle;");
const app = w.B.start({ mode: "demo", source: w });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label = "") {
  for (let i = 0; i < 300; i++) {
    if (fn()) return;
    await delay(10);
  }
  throw Error("UI timeout " + label + " :: " + app.ui.shadow.getElementById("notices").textContent);
}

const calls = [];
const pass = [];
const ok = (cond, msg) => { A.ok(cond, msg); pass.push(msg); };

(async () => {
  try {
    await until(() => app.engine.state === "ready", "ready");
    const e = app.engine, u = app.ui;
    e.scheduler.stop(); e.arc.stop(); e.memoryBook.stop(); e.bookStudio.stop(); e.soul.stop(); e.ms.stop();
    clearInterval(e.timer);
    e.bookStudio.schedule = () => {}; e.memoryBook.schedule = () => {};

    // 已保存的自定义方案：旧模型 + 旧密钥（直连，便于拦截 fetch）
    const saved = e.settings.saveProfile({ id: "draftcase", name: "草稿测试方案", type: "openai", transport: "direct", url: "https://api.example.test/v1", model: "old-model", temperature: 0.8, maxTokens: 1800, rememberKey: false, testPrompt: "" });
    e.settings.saveProfile({ id: "draftcase", name: "草稿测试方案", type: "openai", transport: "direct", url: "https://api.example.test/v1", model: "old-model", temperature: 0.8, maxTokens: 1800, rememberKey: false, testPrompt: "", key: "sk-saved-old" });
    A.equal(saved.id, "draftcase");

    // 切到非演示环境，并拦截网络：只记录请求，返回一个合法的 chat 响应
    e.bridge.mode = "card";
    e.bridge.win.fetch = async (url, opts) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body), auth: opts.headers?.Authorization || "" });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "OK" } }] }), text: async () => "OK" };
    };

    // 拦截对话框：测活弹窗直接确认（用语取默认），结果弹窗直接关闭
    const shown = [];
    u.dialog = async (title, content) => {
      shown.push({ title, content: String(content) });
      if (title.startsWith("测活 · ")) return { phrase: "请回复 OK。", withPrompt: false };
      return null;
    };

    const clickTest = async () => {
      u.go("apiEditor", "draftcase");
      await until(() => u.route.view === "apiEditor" && u.shadow.querySelector('form[data-form="api"]'), "editor");
      const btn = u.shadow.querySelector('[data-action="test-api"]');
      ok(!!btn, "编辑页存在「用上面的用语测活」按钮");
      btn.click();
      await until(() => shown.some((x) => x.title.startsWith("测活结果")), "result");
    };
    const setField = (name, value) => {
      const el = u.shadow.querySelector(`form[data-form="api"] [name="${name}"]`);
      A.ok(el, "表单字段存在：" + name);
      el.value = value;
    };
    const rev0 = e.settings.data.revision;

    // ① 改模型 + 新密钥，直接测活（不保存）
    await clickTest();
    // 上一步还没改表单，应当是“未改动”的基线请求
    const baseline = calls.at(-1);
    ok(baseline && baseline.body.model === "old-model", "未改动表单时测活使用已保存的模型");
    ok(baseline && baseline.auth === "Bearer sk-saved-old", "未改动表单时沿用已保存的密钥");
    shown.length = 0; calls.length = 0;

    await until(() => u.route.view === "apiEditor", "back");
    u.go("apiEditor", "draftcase");
    await until(() => u.shadow.querySelector('form[data-form="api"]'), "editor2");
    setField("model", "new-model");
    setField("key", "sk-typed-new");
    u.shadow.querySelector('[data-action="test-api"]').click();
    await until(() => shown.some((x) => x.title.startsWith("测活结果")), "result2");
    const hit = calls.at(-1);
    ok(hit && hit.body.model === "new-model", "① 测活请求的模型是表单里刚填的 new-model，而不是已保存的 old-model");
    ok(hit && hit.auth === "Bearer sk-typed-new", "① 测活请求的密钥是表单里刚输入的新密钥");
    ok(hit && hit.url === "https://api.example.test/v1/chat/completions", "① 请求地址来自草稿（此例未改地址，应与保存值一致）");
    const resultDialog = shown.find((x) => x.title.startsWith("测活结果"));
    ok(resultDialog && /未保存草稿/.test(resultDialog.content), "结果弹窗标明这是未保存草稿");

    // ② 存档没有被草稿测试改动
    const after = e.settings.data.profiles.find((p) => p.id === "draftcase");
    ok(after.model === "old-model", "② 存档里的模型仍是 old-model（草稿测试未写入存档）");
    ok(e.settings.key("draftcase") === "sk-saved-old", "② 存档里的密钥仍是旧密钥（新输入的密钥未被保存）");
    ok(e.settings.data.revision === rev0, "② 存档 revision 未变化（没有任何写入）");
    ok(after.lastTest === undefined && !(e.settings.data.ui.lastTest || {}).draftcase, "④ 草稿测试不写入「上次测活」记录");

    // ③ 留空密钥沿用已保存的；勾选清除则不带密钥
    shown.length = 0; calls.length = 0;
    u.go("apiEditor", "draftcase");
    await until(() => u.shadow.querySelector('form[data-form="api"]'), "editor3");
    setField("model", "another-model");
    setField("key", "");
    u.shadow.querySelector('[data-action="test-api"]').click();
    await until(() => shown.some((x) => x.title.startsWith("测活结果")), "result3");
    const keep = calls.at(-1);
    ok(keep && keep.body.model === "another-model" && keep.auth === "Bearer sk-saved-old", "③ 密钥留空时沿用已保存密钥，模型取表单值");

    shown.length = 0; calls.length = 0;
    u.go("apiEditor", "draftcase");
    await until(() => u.shadow.querySelector('form[data-form="api"]'), "editor4");
    const clear = u.shadow.querySelector('form[data-form="api"] [name="clearKey"]');
    if (clear) { clear.checked = true; }
    setField("model", "clear-model");
    u.shadow.querySelector('[data-action="test-api"]').click();
    await until(() => shown.some((x) => x.title.startsWith("测活结果")), "result4");
    const cleared = calls.at(-1);
    ok(cleared && cleared.body.model === "clear-model" && cleared.auth === "", "③ 勾选清除密钥时测活不带 Authorization");

    console.log(pass.map((x) => "PASS " + x).join("\n"));
    console.log("API_DRAFT_OK: " + pass.length + " checks");
    process.exit(0);
  } catch (err) {
    console.error("API_DRAFT_FAIL:", err && err.message);
    process.exit(1);
  }
})();
