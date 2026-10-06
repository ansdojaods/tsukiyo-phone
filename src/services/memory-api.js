  // src/services/memory-api.js — v2.9 百宝月夜书公开 API v1 可选联动（只读镜像）
  // 只读它的公开资源（snapshot / history / query …），不触碰它的内部数据；拉回来的资料只是手机里的只读镜像。
  var MEMAPI_HTTP_DEFAULT = "/api/plugins/st-baibai-book/bbs-get";
  var MEMAPI_RESOURCES = ["snapshot", "history", "state", "protagonist", "vars", "items", "plans", "scenes", "npcs", "itemLog", "injectedHistory", "context"];
  function memApiFresh() {
    return {
      enabled: false,
      base: MEMAPI_HTTP_DEFAULT,
      transport: "command",
      timeoutMs: 4000,
      token: "",
      pull: { at: 0, ok: false, note: "", history: "", historyFloor: null, life: [], items: [], npcs: [], coverage: null, apiVersion: "", pluginVersion: "" },
      stats: { ok: 0, fail: 0 },
      lastError: ""
    };
  }
  function memApiData(s) {
    return s?.memApi || memApiFresh();
  }
  function memApiValidate(v) {
    if (v === void 0) return;
    assert(isObject(v), "记忆联动配置错误");
    const base = memApiFresh();
    v.pull = { ...base.pull, ...(v.pull || {}) };
    v.stats = { ...base.stats, ...(v.stats || {}) };
    v.transport = ["command", "http"].includes(v.transport) ? v.transport : "command";
    v.base = text(v.base, 300);
    v.token = typeof v.token === "string" ? v.token.slice(0, 300) : "";
    v.timeoutMs = clamp(Math.round(Number(v.timeoutMs) || 4000), 800, 20000);
    assert(Array.isArray(v.pull.life) && v.pull.life.length <= 200, "记忆联动资料过多");
    assert(Array.isArray(v.pull.items) && v.pull.items.length <= 200, "记忆联动资料过多");
    assert(Array.isArray(v.pull.npcs) && v.pull.npcs.length <= 200, "记忆联动资料过多");
    return v;
  }
  var MemoryApiLink = class {
    constructor(eng) {
      this.eng = eng;
    }
    data() {
      return memApiData(this.eng.repo.data);
    }
    cfg() {
      return { ...memApiFresh(), ...(this.data() || {}) };
    }
    on() {
      return !!this.cfg().enabled;
    }
    /** 有内置手机桥时，尊重它的读取开关（对应文档里的 canReadMemory）。 */
    readAllowed() {
      try {
        const api = baibaiApi();
        if (api && !baibaiReadEnabled()) return false;
      } catch {
      }
      return true;
    }
    base() {
      let base = text(this.cfg().base, 300) || MEMAPI_HTTP_DEFAULT;
      if (!/^https?:\/\//i.test(base)) base = "/" + base.replace(/^\/+/, "");
      return base.replace(/\/+$/, "");
    }
    headers() {
      const token = this.cfg().token;
      return token ? { "Content-Type": "application/json", Authorization: "Bearer " + token } : { "Content-Type": "application/json" };
    }
    async slash(line) {
      const c = this.eng.bridge.context();
      const api = typeof this.eng.bridge.api === "function" ? this.eng.bridge.api.bind(this.eng.bridge) : () => void 0;
      const fn = (typeof c?.executeSlashCommandsWithOptions === "function" && c.executeSlashCommandsWithOptions) || api("executeSlashCommandsWithOptions") || api("executeSlashCommand");
      assert(typeof fn === "function", "当前酒馆没有可用的指令接口；可以改用「HTTP 地址」方式，或直接在百宝月夜书的界面里复制资料");
      let out = null;
      try {
        out = await fn.call(c, line, { showOutput: false });
      } catch (e2) {
        assert(false, "指令执行失败：" + text(e2?.message || e2, 160));
      }
      return typeof out === "string" ? out : out?.output ?? out?.result ?? out;
    }
    async fetchJson(resource, params = {}) {
      const win = this.eng.win, cfg = this.cfg();
      const fn = win?.fetch || (typeof fetch === "function" ? fetch : null);
      assert(fn, "当前环境没有 fetch，请把联动方式改成「酒馆指令」");
      const query = Object.entries({ resource, format: "json", ...params }).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v))).join("&");
      const url = this.base() + (this.base().includes("?") ? "&" : "?") + query;
      const ctrl = typeof win?.AbortController === "function" ? new win.AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), clamp(cfg.timeoutMs, 800, 2e4)) : null;
      try {
        const res = await fn.call(win, url, { method: "GET", headers: this.headers(), signal: ctrl?.signal, credentials: "same-origin" });
        const body = await res.text();
        assert(res.ok, "HTTP " + res.status + " " + text(body, 160));
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          assert(false, "返回内容不是 JSON：" + text(body, 120));
        }
        const payload = isObject(parsed) && isObject(parsed.data) ? parsed.data : parsed;
        assert(isObject(payload) || Array.isArray(payload), "返回内容不是 JSON：可能地址不对，或插件没有对外开放这个入口（可以改用「酒馆指令」方式）");
        return payload;
      } finally {
        clearTimeout(timer);
      }
    }
    /**
     * 读一个公开资源。
     * command：走文档里的 `/bbs-get resource=… format=json`（默认，最稳）
     * http：GET {base}?resource=…&format=json（需要插件自己开放入口或你前面挂了反代）
     */
    async read(resource, params = {}) {
      assert(MEMAPI_RESOURCES.includes(resource) || resource === "floor", "不支持的资源：" + resource);
      if (this.cfg().transport === "command") {
        const args = Object.entries({ resource, ...params }).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([k, v]) => k + "=" + encodeURIComponent(String(v))).join(" ");
        return this.slash("/bbs-get " + args + " format=json");
      }
      return this.fetchJson(resource, params);
    }
    async test() {
      const out = await this.read("snapshot");
      const info = this.describe(out);
      this.eng.repo.mutate((d) => {
        const m = memApiData(d);
        m.stats.ok += 1;
        m.lastError = "";
        if (info.apiVersion) m.pull.apiVersion = info.apiVersion;
        if (info.pluginVersion) m.pull.pluginVersion = info.pluginVersion;
      }, { label: "记忆联动 · 连接测试通过", snapshot: this.eng.repo.snapshot });
      return info;
    }
    describe(raw) {
      const value = isObject(raw) && isObject(raw.data) ? raw.data : raw;
      if (!isObject(value)) return { apiVersion: "", pluginVersion: "", character: "", floor: null, coverage: null, npcs: 0, items: 0, life: 0 };
      return {
        apiVersion: text(value.apiVersion ?? value.api_version ?? "", 20),
        pluginVersion: text(value.pluginVersion ?? value.plugin_version ?? value.version ?? "", 20),
        character: text(value.protagonist?.name ?? value.state?.protagonist ?? "", 40),
        floor: Number.isInteger(value.meta?.floor) ? value.meta.floor : Number.isInteger(value.state?.floor) ? value.state.floor : null,
        coverage: isObject(value.coverage) ? value.coverage : null,
        npcs: Array.isArray(value.npcs) ? value.npcs.length : 0,
        items: Array.isArray(value.items) ? value.items.length : 0,
        life: Array.isArray(value.lifeDetails) ? value.lifeDetails.length : 0
      };
    }
    /** 拉一次资料，写进手机里的只读镜像（不调用模型，不改动剧情）。 */
    async pull() {
      const s = this.eng.repo.data, snap = this.eng.repo.snapshot;
      assert(this.on(), "先启用「记忆联动 · 公开 API」");
      assert(s && snap, "先打开一个聊天");
      assert(!this.eng.bridge.isBusy?.(), "正在生成，请稍后再拉取");
      assert(this.readAllowed(), "百宝月夜书的读取开关是关的（手机设置里的「柏宝书联动 → 读取」），联动读取会一并被禁止");
      const out = { ...memApiFresh().pull, at: Date.now() };
      const errors = [];
      const step = async (name, fn) => {
        try {
          return await fn();
        } catch (e2) {
          errors.push(name + "：" + redactError(e2, this.eng.settings.secrets()));
          return null;
        }
      };
      const history = await step("历史", async () => {
        const raw = await this.read("history", Number.isInteger(snap.floor) ? { before: snap.floor } : {});
        const value = isObject(raw) && isObject(raw.data) ? raw.data : raw;
        if (typeof value === "string") return { text: text(value, 8000), floor: null };
        if (!isObject(value)) return null;
        return { text: text(value.relativeText || value.text || "", 8000), floor: Number.isInteger(value.floor) ? value.floor : null, complete: value.complete, missing: Array.isArray(value.missingAiFloors) ? value.missingAiFloors : [] };
      });
      if (history) {
        out.history = history.text;
        out.historyFloor = history.floor ?? null;
        out.coverage = { complete: history.complete !== false, missingAiFloors: history.missing || [] };
      }
      const snapRaw = await step("快照", () => this.read("snapshot"));
      const info = this.describe(snapRaw);
      out.apiVersion = info.apiVersion;
      out.pluginVersion = info.pluginVersion;
      if (isObject(snapRaw)) {
        const value = isObject(snapRaw.data) ? snapRaw.data : snapRaw;
        out.npcs = (Array.isArray(value.npcs) ? value.npcs : []).slice(0, 200).map((n) => ({ name: text(n.name, 40), relation: text(n.relation ?? n.title ?? "", 60), affinity: text(n.affinityText ?? "", 60), note: text(n.affinityNote ?? "", 120), important: !!n.important }));
        out.items = (Array.isArray(value.items) ? value.items : []).slice(0, 200).map((x) => ({ name: text(x.name, 60), qty: Number(x.qty ?? x.quantity ?? 1), location: text(x.location, 60) }));
        const life = Array.isArray(value.lifeDetails) ? value.lifeDetails : [];
        out.life = life.slice(0, 200).map((x) => ({ subject: text(x.subject, 40), text: text(x.text, 300), topics: Array.isArray(x.topics) ? x.topics.map((t) => text(t, 20)).slice(0, 6) : [] }));
        if (isObject(value.coverage) && !out.coverage) out.coverage = value.coverage;
      }
      out.ok = !!(out.history || out.npcs.length || out.items.length || out.life.length);
      out.note = out.ok ? "" : errors.slice(0, 3).join("；") || "没有取到资料";
      await this.eng.repo.mutate((d) => {
        const m = memApiData(d);
        m.pull = out;
        if (out.ok) ((m.stats.ok += 1), (m.lastError = ""));
        else ((m.stats.fail += 1), (m.lastError = text(out.note, 200)));
      }, { snapshot: snap, label: "记忆联动 · 拉取百宝月夜书" });
      return out;
    }
    mirror() {
      return this.data()?.pull || null;
    }
    /** 给「记忆工作台」「缺口检查」用的缺口楼层（含百宝月夜书自己报告的缺失 AI 楼层）。 */
    missingFloors() {
      const m = this.mirror();
      if (!this.on() || !m?.ok || !isObject(m.coverage)) return [];
      return (Array.isArray(m.coverage.missingAiFloors) ? m.coverage.missingAiFloors : []).filter(Number.isInteger).slice(0, 200);
    }
    status() {
      const m = this.data(), cfg = this.cfg();
      const info = m?.pull || {};
      return {
        enabled: !!cfg.enabled, transport: cfg.transport === "command" ? "酒馆指令" : "HTTP 地址",
        base: cfg.transport === "http" ? this.base() : "/bbs-get",
        readAllowed: this.readAllowed(),
        ok: !!info.ok, at: info.at || 0, note: info.note || "",
        apiVersion: info.apiVersion || "", pluginVersion: info.pluginVersion || "",
        historyChars: (info.history || "").length, historyFloor: info.historyFloor ?? null,
        npcs: (info.npcs || []).length, items: (info.items || []).length, life: (info.life || []).length,
        missing: this.missingFloors().length, stats: { ...(m?.stats || {}) }, lastError: m?.lastError || ""
      };
    }
  };

