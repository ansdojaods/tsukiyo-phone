  // src/core/utils.js
  var VERSION = package_default.version;
  var NS = "tsukiyo_phone_v1";
  var PROMPT_KEY = "tsukiyo-phone:context";
  var NS_CHAT = "tsukiyo_phone_v1_chat";
  var ARC_KEYS = { outline: "tsukiyo-phone:arc-outline", lines: "tsukiyo-phone:arc-lines", points: "tsukiyo-phone:arc-points" };
  var ARC_PROMPT_KEYS = Object.values(ARC_KEYS);
  var MODULES = Object.freeze({ director: "候选事件导演", parallel: "离场NPC侧写", world: "世界状态审核", visual: "AVS视觉档案", soul: "灵魂链接（NPC 档案与推演）", chat: "私聊与群聊", proactive: "角色主动来信", planner: "剧情规划", social: "朋友圈动态", memory: "记忆与进度核对（含记忆世界书）", diary: "日记 / 备忘 / 生活清单 / 节日" });
  var clone = (v) => JSON.parse(JSON.stringify(v));
  var isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  var text = (v, max = 2e3) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
  var escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var id = (prefix = "id") => prefix + "-" + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
  var clamp = (v, lo, hi, defaultValue = lo) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : defaultValue;
  function assert(condition, message) {
    if (!condition) throw Error(message);
  }
  function safeJson(value, depth = 0, budget = { n: 0 }) {
    if (++budget.n > 4e5 || depth > 40) throw Error("数据过大或嵌套过深");
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "string") {
      assert(value.length <= 16e6, "单段文本过长");
      return;
    }
    if (typeof value === "number") {
      assert(Number.isFinite(value), "数据包含无效数字");
      return;
    }
    assert(isObject(value) || Array.isArray(value), "只接受纯 JSON 数据");
    for (const key of Object.keys(value)) {
      assert(!["__proto__", "prototype", "constructor"].includes(key), "数据含危险属性");
      const d = Object.getOwnPropertyDescriptor(value, key);
      assert(d && Object.hasOwn(d, "value"), "不接受访问器");
      safeJson(d.value, depth + 1, budget);
    }
  }
  function fingerprint(value) {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    let a = 2166136261, b = 2246822519;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 3266489917);
    }
    return (a >>> 0).toString(16) + (b >>> 0).toString(16) + "-" + s.length;
  }
  function parseModelJson(raw, max = 4e4) {
    assert(typeof raw === "string" && raw.length <= max, "模型返回不是有效的有限文本");
    let s = raw.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fence) s = fence[1];
    let data;
    try {
      data = JSON.parse(s);
    } catch {
      throw Error("模型未返回所需 JSON，原记录与草稿未覆盖");
    }
    safeJson(data);
    return data;
  }
  function isoDay(value) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(value || ""), "日期格式应为 YYYY-MM-DD");
    const d = /* @__PURE__ */ new Date(value + "T12:00:00Z");
    assert(Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value, "日期不存在");
    return value;
  }
  function addDays(date, days) {
    const d = /* @__PURE__ */ new Date(isoDay(date) + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function dayLabel(date) {
    try {
      return "周" + "日一二三四五六"[(/* @__PURE__ */ new Date(isoDay(date) + "T12:00:00Z")).getUTCDay()];
    } catch {
      return "剧情时间";
    }
  }
  function niceTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "";
    }
  }
  function cleanNarrative(s) {
    return text(String(s || "").replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, "").replace(/<(?:think|analysis)>[\s\S]*?<\/(?:think|analysis)>/gi, "").replace(/<Kusogaki(?:Status|Start)\s*\/>/gi, "").replace(/```(?:html|javascript|js)[\s\S]*?```/gi, "").replace(/<!--[\s\S]*?-->/g, ""), 12e3);
  }
  var Emitter = class {
    constructor() {
      this.listeners = /* @__PURE__ */ new Set();
    }
    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    emit(value) {
      for (const fn of [...this.listeners]) try {
        fn(value);
      } catch (e2) {
        console.warn("[月夜来信] 界面订阅失败", e2?.message);
      }
    }
    clear() {
      this.listeners.clear();
    }
  };
  function redactError(error, secrets = []) {
    let s = String(error?.message || error || "操作失败");
    for (const key of secrets.filter(Boolean)) s = s.split(key).join("[密钥已隐藏]");
    return text(s.replace(/(Bearer\s+)[^\s"']+/gi, "$1[已隐藏]"), 300);
  }
  function limitAppend(array, value, max, label) {
    assert(array.length < max, `${label}已达 ${max} 条；请先导出并手动整理，不会自动删掉旧记录`);
    array.push(value);
    return value;
  }
  function safeImageData(value) {
    return typeof value === "string" && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length < 35e5;
  }
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("已停止", "AbortError"));
      }, { once: true });
    });
  }
  function moduleOffError(module) {
    const err = Error("「" + (MODULES[module] || module) + "」模块已关闭，没有调用 API。可在 设置 → API方案与模块分配 里重新打开。");
    err.code = "MODULE_OFF";
    err.module = module;
    return err;
  }

