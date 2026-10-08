  // src/core/settings.js
  var CONFIG = "tsukiyo-phone:v1:settings";
  var SECRETS = "tsukiyo-phone:v1:secrets";
  function defaultSettings() {
    return { version: 1, revision: 0, theme: "day", accent: "sage", defaultProfile: "tavern", profiles: [{ id: "tavern", name: "跟随酒馆", type: "tavern", transport: "helper", url: "", model: "", temperature: 0.8, maxTokens: 1800, rememberKey: false }], routes: Object.fromEntries(Object.keys(MODULES).map((k) => [k, "default"])), enabled: Object.fromEntries(Object.keys(MODULES).map((k) => [k, true])), ui: { scale: 1, sounds: false, testPrompt: "你好，请用一句话介绍你自己并说出你的模型名。", syncKeys: true }, prompt: { enabled: false, text: "" }, updatedAt: 0 };
  }
  function cleanEnabled(raw) {
    const out = {};
    if (raw && typeof raw === "object") {
      for (const k of Object.keys(MODULES)) if (typeof raw[k] === "boolean") out[k] = raw[k];
    }
    return out;
  }
  function validateProfile(p) {
    assert(p && typeof p.name === "string" && p.name.trim() && p.name.length <= 40, "请给方案起一个40字以内的名字");
    if (p.id) assert(/^[A-Za-z0-9_-]{1,100}$/.test(p.id) && !["__proto__", "prototype", "constructor", "default"].includes(p.id), "方案编号无效");
    assert(["tavern", "openai"].includes(p.type), "方案类型不支持");
    assert(["helper", "direct"].includes(p.transport), "连接方式无效");
    if (p.type !== "tavern") {
      let u;
      try {
        u = new URL(p.url);
      } catch {
        throw Error("请填写正确的 API 基础地址");
      }
      assert(["https:", "http:"].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash, "地址只能使用 HTTP(S)，不含账号、查询参数或锚点；密钥请单独填写");
      assert(text(p.model, 120), "请填写模型名称");
    }
    assert(Number.isFinite(p.temperature) && p.temperature >= 0 && p.temperature <= 2, "温度范围为0—2");
    assert(Number.isInteger(p.maxTokens) && p.maxTokens >= 128 && p.maxTokens <= 16e3, "最大输出范围为128—16000");
    return p;
  }
  var SettingsStore = class {
    constructor(win, { demo = false } = {}) {
      this.win = win;
      this.configKey = demo ? "tsukiyo-phone:demo:settings" : CONFIG;
      this.secretsKey = demo ? "tsukiyo-phone:demo:secrets" : SECRETS;
      this.secretMap = /* @__PURE__ */ new Map();
      this.events = new Emitter();
      this.data = defaultSettings();
      this.notice = "";
      try {
        const raw = JSON.parse(win.localStorage.getItem(this.configKey) || "null");
        if (raw) {
          safeJson(raw);
          if (raw.version === 1 && Array.isArray(raw.profiles) && raw.profiles.some((p) => p.id === "tavern")) {
            for (const p of raw.profiles) validateProfile(p);
            this.data = { ...this.data, ...raw, routes: { ...this.data.routes, ...raw.routes }, enabled: { ...this.data.enabled, ...cleanEnabled(raw.enabled) }, ui: { ...this.data.ui, ...raw.ui }, prompt: { ...this.data.prompt, ...raw.prompt } };
          }
        }
        const keys = JSON.parse(win.localStorage.getItem(this.secretsKey) || "{}");
        safeJson(keys);
        for (const p of this.data.profiles) if (p.rememberKey && typeof keys[p.id] === "string") this.secretMap.set(p.id, keys[p.id]);
        if (!demo) this.pullCloud();
      } catch {
        this.notice = "本地配置无法读取，已使用空白配置；未覆盖原存储";
      }
    }
    cloud() {
      try {
        const ctx = this.win.SillyTavern?.getContext?.() || this.win.parent?.SillyTavern?.getContext?.();
        return ctx?.extensionSettings ? ctx : null;
      } catch {
        return null;
      }
    }
    pullCloud(force = false) {
      const ctx = this.cloud(), box = ctx?.extensionSettings?.tsukiyo_phone;
      if (!box?.config || !Array.isArray(box.config.profiles) || !box.config.profiles.some((p) => p.id === "tavern")) return false;
      if (!force && (box.config.updatedAt || 0) <= (this.data.updatedAt || 0)) return false;
      try {
        for (const p of box.config.profiles) validateProfile(p);
        this.data = { ...defaultSettings(), ...box.config, routes: { ...defaultSettings().routes, ...box.config.routes }, enabled: { ...defaultSettings().enabled, ...cleanEnabled(box.config.enabled) }, ui: { ...defaultSettings().ui, ...box.config.ui }, prompt: { ...defaultSettings().prompt, ...box.config.prompt } };
        for (const [k, v] of Object.entries(box.secrets || {})) if (typeof v === "string" && v) this.secretMap.set(k, v);
        this.win.localStorage.setItem(this.configKey, JSON.stringify(this.data));
        const secrets = {};
        for (const p of this.data.profiles) if (p.rememberKey && this.secretMap.has(p.id)) secrets[p.id] = this.secretMap.get(p.id);
        this.win.localStorage.setItem(this.secretsKey, JSON.stringify(secrets));
        return true;
      } catch {
        return false;
      }
    }
    pushCloud(clean, secrets) {
      if (this.configKey !== CONFIG) return;
      const ctx = this.cloud();
      if (!ctx) return;
      try {
        ctx.extensionSettings.tsukiyo_phone = { config: clone(clean), secrets: clean.ui?.syncKeys === false ? {} : { ...secrets } };
        (ctx.saveSettingsDebounced || ctx.saveSettings)?.();
      } catch {
      }
    }
    on(fn) {
      return this.events.on(fn);
    }
    secrets() {
      return [...this.secretMap.values()];
    }
    key(profileId) {
      return this.secretMap.get(profileId) || "";
    }
    persist(next) {
      safeJson(next);
      const clean = clone(next);
      for (const p of clean.profiles) delete p.key;
      const secrets = {};
      for (const p of clean.profiles) if (p.rememberKey && this.secretMap.has(p.id)) secrets[p.id] = this.secretMap.get(p.id);
      clean.revision = this.data.revision + 1;
      clean.updatedAt = Date.now();
      try {
        this.win.localStorage.setItem(this.configKey, JSON.stringify(clean));
        this.win.localStorage.setItem(this.secretsKey, JSON.stringify(secrets));
      } catch {
        throw Error("浏览器拒绝保存手机配置；请检查存储权限/配额，未声称保存成功");
      }
      this.pushCloud(clean, secrets);
      this.data = clean;
      this.events.emit(clean);
      return clean;
    }
    saveProfile(raw) {
      const next = clone(this.data), profile = { id: raw.id || id("api"), name: text(raw.name, 40), type: raw.type || "openai", transport: raw.transport || "helper", url: text(raw.url, 500).replace(/\/+$/, ""), model: text(raw.model, 120), temperature: clamp(raw.temperature, 0, 2, 0.8), maxTokens: Math.round(clamp(raw.maxTokens, 128, 16e3, 1800)), rememberKey: raw.rememberKey === true, testPrompt: text(raw.testPrompt || "", 2e3) };
      assert(profile.id !== "tavern" || profile.type === "tavern", "保留方案不能改为独立接口");
      validateProfile(profile);
      const index = next.profiles.findIndex((p) => p.id === profile.id);
      if (index < 0) {
        assert(next.profiles.length < 20, "最多保存20个 API 方案");
        next.profiles.push(profile);
      } else next.profiles[index] = profile;
      if (raw.clearKey) this.secretMap.delete(profile.id);
      else if (text(raw.key, 5e3)) this.secretMap.set(profile.id, text(raw.key, 5e3));
      this.persist(next);
      return profile;
    }
    // 编辑页「测活」用：把表单当前填写的值套在已保存方案上，得到一份**不落盘**的草稿。
    // 校验与保存时相同；密钥优先取表单里新输入的，没有则沿用已保存的（清除勾选时为空）。
    draftProfile(raw, savedId) {
      const base = this.data.profiles.find((p) => p.id === savedId);
      assert(base, "方案不存在，请先保存");
      const r = raw && typeof raw === "object" ? raw : {};
      const draft = {
        ...clone(base),
        name: text(r.name, 40) || base.name,
        transport: r.transport || base.transport,
        url: text(r.url ?? base.url, 500).replace(/\/+$/, ""),
        model: text(r.model ?? base.model, 120),
        temperature: clamp(r.temperature, 0, 2, base.temperature),
        maxTokens: Math.round(clamp(r.maxTokens, 128, 16e3, base.maxTokens)),
        testPrompt: text(r.testPrompt ?? base.testPrompt ?? "", 2e3)
      };
      validateProfile(draft);
      const key = r.clearKey === true ? "" : text(r.key, 5e3) || this.key(base.id);
      return { ...draft, key };
    }
    duplicate(profileId) {
      const p = this.data.profiles.find((p2) => p2.id === profileId);
      assert(p && p.id !== "tavern", "请选择一个自定义方案");
      const key = this.key(p.id);
      return this.saveProfile({ ...clone(p), id: id("api"), name: p.name.slice(0, 34) + " 副本", key, rememberKey: false });
    }
    remove(profileId) {
      assert(profileId !== "tavern", "不能删除跟随酒馆方案");
      const next = clone(this.data);
      next.profiles = next.profiles.filter((p) => p.id !== profileId);
      if (next.defaultProfile === profileId) next.defaultProfile = "tavern";
      for (const k of Object.keys(next.routes)) if (next.routes[k] === profileId) next.routes[k] = "default";
      this.secretMap.delete(profileId);
      this.persist(next);
    }
    route(module) {
      assert(Object.hasOwn(MODULES, module), "未知生成模块");
      const target = this.data.routes[module];
      const profileId = target && target !== "default" ? target : this.data.defaultProfile;
      const p = this.data.profiles.find((p2) => p2.id === profileId);
      assert(p, "分配的 API 方案已不存在，请重新选择；不会偷偷切换服务商");
      return clone(p);
    }
    isEnabled(module) {
      return this.data.enabled?.[module] !== false;
    }
    setEnabled(module, on) {
      assert(Object.hasOwn(MODULES, module), "未知模块");
      const next = clone(this.data);
      next.enabled = { ...next.enabled, [module]: !!on };
      this.persist(next);
    }
    assign(module, profileId) {
      const next = clone(this.data);
      assert(Object.hasOwn(MODULES, module), "未知模块");
      assert(profileId === "default" || next.profiles.some((p) => p.id === profileId), "方案不存在");
      next.routes[module] = profileId;
      this.persist(next);
    }
    update(patch) {
      const next = { ...clone(this.data), ...patch };
      assert(next.profiles.some((p) => p.id === next.defaultProfile), "默认方案不存在");
      assert(["day", "night"].includes(next.theme), "主题不支持");
      this.persist(next);
    }
    export() {
      return { format: "tsukiyo-api-presets", version: 1, profiles: this.data.profiles.filter((p) => p.id !== "tavern").map((p) => ({ ...clone(p), key: this.key(p.id) })), defaultProfile: this.data.defaultProfile, routes: clone(this.data.routes), enabled: clone(this.data.enabled), prompt: clone(this.data.prompt || {}), notice: "含 API 密钥（明文），请勿公开分享此文件。" };
    }
    import(raw) {
      safeJson(raw);
      assert(raw.format === "tsukiyo-api-presets" && raw.version === 1 && Array.isArray(raw.profiles) && raw.profiles.length <= 19, "不是兼容的API方案文件");
      const next = clone(this.data);
      for (const p of raw.profiles) {
        assert(p.id && p.id !== "tavern", "导入方案不得覆盖保留方案");
        const q = { ...clone(p) };
        const k = typeof q.key === "string" ? q.key.slice(0, 5e3) : "";
        delete q.key;
        validateProfile(q);
        q.rememberKey = k ? true : !!q.rememberKey;
        if (k) this.secretMap.set(q.id, k);
        const i = next.profiles.findIndex((x) => x.id === p.id);
        if (i < 0) next.profiles.push(q);
        else next.profiles[i] = q;
      }
      assert(next.profiles.length <= 20, "合并后方案超过20个");
      const ids = new Set(next.profiles.map((p) => p.id));
      if (ids.has(raw.defaultProfile)) next.defaultProfile = raw.defaultProfile;
      for (const m of Object.keys(MODULES)) {
        const v = raw.routes?.[m];
        if (v === "default" || ids.has(v)) next.routes[m] = v;
      }
      next.enabled = { ...next.enabled, ...cleanEnabled(raw.enabled) };
      if (raw.prompt && typeof raw.prompt.text === "string") next.prompt = { enabled: !!raw.prompt.enabled, text: raw.prompt.text.slice(0, 2e4) };
      this.persist(next);
    }
  };

