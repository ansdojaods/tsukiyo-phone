#!/usr/bin/env node
/**
 * v2.9.6 私信输入法专项（真实 DOM / 假宿主）：
 * 「发私信时莫名其妙被打断输入法」的三类来源，逐条钉死：
 *   ① 重绘整块换掉 <textarea>（焦点、光标、输入法组合一起没）；
 *   ② 点「发送 / 仅暂存」抢走焦点（手机键盘闪一下又收）；
 *   ③ 输入法拼字（组合）中被当成「按了回车」或「点了发送」。
 *
 *   node tools/test_composer_ui.cjs
 */
const fs = require("fs");
const path = require("path");
const A = require("node:assert/strict");
const { JSDOM } = require("jsdom");

let code = fs.readFileSync(path.join(__dirname, "..", "dist", "tsukiyo-phone-v2.9.6.js"), "utf8").replace(/TsukiyoPhoneBundle\.start\([^)]*\);?\s*$/, "");
code = code.replace(
  "return __toCommonJS(index_exports);",
  "__export(index_exports, { addContact: () => addContact, ensureThread: () => ensureThread });\n  return __toCommonJS(index_exports);",
);
const dom = new JSDOM("<html><body></body></html>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://composer.test/" });
const w = dom.window;
w.eval(code + ";window.B=TsukiyoPhoneBundle;");
const app = w.B.start({ mode: "demo", source: w });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label = "") {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await delay(10);
  }
  throw Error("UI timeout " + label + " :: " + app.ui.shadow.getElementById("notices").textContent);
}

(async () => {
  try {
    await until(() => app.engine.state === "ready", "ready");
    const e = app.engine, u = app.ui;
    e.scheduler.stop(); e.arc.stop(); e.memoryBook.stop(); e.bookStudio.stop(); e.soul.stop(); e.ms.stop();
    clearInterval(e.timer);
    e.bookStudio.schedule = () => {}; e.memoryBook.schedule = () => {};

    // 造一个可用联系人与私聊
    let thread = null;
    await e.mutate((s) => {
      const c = w.B.addContact(s, { name: "阿壹", age: 20, bio: "测试用联系人", recognized: true, reachable: true, proactive: false });
      thread = w.B.ensureThread(s, [c.id]).id;
    });
    u.open("chat", thread);
    await until(() => u.route.view === "chat" && u.shadow.getElementById("phone-composer"), "composer");

    const area = () => u.shadow.getElementById("composer-area");
    const box = () => u.shadow.getElementById("phone-composer");
    const strip = () => area().querySelector('[data-slot="pending"]');
    const type = (value) => {
      box().value = value;
      box().dispatchEvent(new w.Event("input", { bubbles: true }));
    };
    const key = (k, init = {}) => {
      const ev = new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
      box().dispatchEvent(ev);
      return ev;
    };

    // ① 重绘不换节点：后台状态变化（scheduler/生成/存档）都会 render()
    box().focus();
    type("今天风有点大");
    const node0 = box();
    A.equal(u.shadow.activeElement, node0, "输入框应持有焦点");
    u.render();
    e.emit("status");
    await delay(30);
    A.equal(box(), node0, "重绘后输入框仍是同一个节点（没有被打断）");
    A.equal(box().value, "今天风有点大", "重绘不丢草稿");
    A.equal(u.shadow.activeElement, node0, "重绘后焦点仍在输入框");
    console.log("UI_PASS 重绘只更新待发条，输入框节点、草稿与焦点都保住");

    // ② 草稿里的 < & 原样保留，且不会以 HTML 形式落进 DOM
    type('a < b & "c" <b>加粗</b>');
    u.render();
    A.equal(box().value, 'a < b & "c" <b>加粗</b>', "尖括号与 & 原样保留");
    A.ok(!area().innerHTML.includes("<b>加粗</b>"), "草稿不会被当成标签解析");
    A.equal(area().querySelectorAll("textarea").length, 1, "输入框没有被草稿里的标签撑成多个");
    console.log("UI_PASS 草稿走 .value 写入，< & 不会被 HTML 吃掉");

    // ③ 仅暂存：待发条出现，但输入框节点不换、焦点不丢
    type("今晚老地方见");
    const node1 = box();
    const before = u.data.threads.find((t) => t.id === thread).pending.length;
    u.act("queue", thread);
    await until(() => u.data.threads.find((t) => t.id === thread).pending.length === before + 1, "queued");
    await until(() => !strip().hidden, "strip shown");
    A.equal(box(), node1, "待发条出现时输入框节点没有被重建");
    A.equal(box().value, "", "暂存后输入框清空");
    A.equal(u.shadow.activeElement, node1, "暂存后光标还在输入框里");
    A.ok(strip().textContent.includes("1 条待发"), "待发条文案已就地更新");
    console.log("UI_PASS 待发条就地更新，发送/暂存后输入框与焦点不被打断");

    // ④ 组合（输入法拼字）中：重绘不动输入框、Enter 不发送
    const node2 = box();
    node2.dispatchEvent(new w.Event("compositionstart", { bubbles: true }));
    A.equal(u.composing, true, "已记录组合状态");
    type("hao");
    u.render();
    e.emit("status");
    await delay(20);
    A.equal(box(), node2, "组合中不重建输入框");
    A.equal(box().value, "hao", "组合中不丢拼字");
    const pendingBefore = u.data.threads.find((t) => t.id === thread).pending.length;
    const enter = key("Enter", { isComposing: true });
    A.equal(enter.defaultPrevented, false, "组合中的 Enter 不拦截（交给输入法选字）");
    await delay(30);
    A.equal(u.data.threads.find((t) => t.id === thread).pending.length, pendingBefore, "组合中的 Enter 没有发出去");
    u.act("send", thread);
    await delay(30);
    A.equal(u.data.threads.find((t) => t.id === thread).pending.length, pendingBefore, "组合中点发送也不会发半截字");
    A.ok(u.shadow.getElementById("notices").textContent.includes("输入法"), "组合中点发送会提示先选字");
    console.log("UI_PASS 输入法组合中：重绘不打断、Enter 与发送都不抢字");

    // ⑤ 组合结束后：Enter 正常走发送路径，且草稿清空、光标留在输入框
    node2.dispatchEvent(new w.Event("compositionend", { bubbles: true }));
    A.equal(u.composing, false, "组合结束");
    let sent = 0;
    e.actions.reply = async () => { sent += 1; };   // 只验 UI 路径，不惊动模型
    const enter2 = key("Enter");
    A.equal(enter2.defaultPrevented, true, "组合结束后 Enter 走发送路径");
    await until(() => u.data.threads.find((t) => t.id === thread).pending.length === pendingBefore + 1, "sent to pending");
    await delay(30);
    A.equal(box().value, "", "发送后输入框清空");
    A.equal(u.shadow.activeElement, box(), "发送后光标仍在输入框（可接着写下一句）");
    key("Enter");
    await until(() => sent >= 1 || u.data.threads.find((t) => t.id === thread).pending.length > pendingBefore, "reply called");
    console.log("UI_PASS 组合结束后 Enter 正常发送，发完光标还在输入框");

    // ⑥ 发送按钮不抢焦点（pointerdown 默认被阻止）
    const node3 = box();
    node3.focus();
    const down = new w.Event("pointerdown", { bubbles: true, cancelable: true });
    u.shadow.querySelector('[data-action="send"]').dispatchEvent(down);
    A.equal(down.defaultPrevented, true, "发送按钮的 pointerdown 不移动焦点");
    A.equal(u.shadow.activeElement, node3, "焦点仍在输入框");
    console.log("UI_PASS 点发送按钮不抢焦点：手机键盘不会闪一下再收起来");

    // ⑦ 换会话才会重建输入框，且重建后读回的是那个会话的草稿
    await e.mutate((s) => {
      const c2 = w.B.addContact(s, { name: "阿贰", age: 22, bio: "", recognized: true, reachable: true, proactive: false });
      w.B.ensureThread(s, [c2.id]).draft = "第二位的草稿";
    });
    const other = u.data.threads.find((t) => t.title === "阿贰");
    u.go("chat", other.id);
    await until(() => box() && box().dataset.thread === other.id, "switch thread");
    A.notEqual(box(), node3, "换会话时输入框才重建");
    A.equal(box().value, "第二位的草稿", "重建后读回该会话的草稿");
    u.go("chat", thread);
    await until(() => box() && box().dataset.thread === thread, "switch back");
    console.log("UI_PASS 只有换会话才重建输入框，草稿按会话读回");

    // ⑧ 手机/平板回车只换行；电脑（宽屏）回车发送、Shift+回车换行
    u.mode = "phone";   // demo 下 fit() 不跑，直接指定紧凑布局
    u.render();
    A.ok(box().title.includes("回车换行"), "窄屏提示：回车换行 · 点右侧按钮发送");
    await until(() => box() && box().dataset.thread === thread, "back to thread");
    const p0 = u.data.threads.find((t) => t.id === thread).pending.length;
    box().focus();
    type("半句话");
    const narrow = key("Enter");
    A.equal(narrow.defaultPrevented, false, "窄屏回车不拦截（交给输入法换行）");
    await delay(40);
    A.equal(u.data.threads.find((t) => t.id === thread).pending.length, p0, "窄屏回车没有把半句话发出去");
    u.mode = "wide";
    u.render();
    A.ok(box().title.includes("回车发送"), "宽屏提示：回车发送 · Shift+回车换行");
    console.log("UI_PASS 手机端回车换行（不误发），电脑回车发送");

    console.log("COMPOSER_UI_OK: 输入框不再被重绘打断，组合与焦点语义已固定");
  } finally {
    app.dispose();
    dom.window.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
