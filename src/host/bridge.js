  // src/host/bridge.js
  function rootWindow(win) {
    let root = win;
    try {
      while (root.parent && root.parent !== root) {
        const next = root.parent;
        void next.document;
        root = next;
      }
    } catch {
    }
    return root;
  }
  var TavernBridge = class {
    constructor(win, source = win) {
      this.win = rootWindow(win);
      this.sources = [source];
      this.mode = "tavern";
      this.disposed = false;
      this.ownRequests = 0;
      this.busy = false;
      this.off = [];
      this.injectionReady = false;
      this.lastError = "";
    }
    registerSource(source) {
      if (!this.sources.includes(source)) this.sources.unshift(source);
      return () => {
        this.sources = this.sources.filter((x) => x !== source);
      };
    }
    api(name) {
      const owners = [];
      for (const w of [...this.sources, this.win]) try {
        owners.push(w, w.TavernHelper, w.__KUSOGAKI_PHONE_API__);
      } catch {
      }
      for (const o of owners) try {
        const v = o?.[name];
        if (v !== void 0) return typeof v === "function" ? v.bind(o) : v;
      } catch {
      }
      return void 0;
    }
    context() {
      const st = this.api("SillyTavern");
      return st?.getContext?.() || null;
    }
    owner() {
      const c = this.context();
      if (!c) return "";
      const chat = c.getCurrentChatId?.() ?? c.chatId ?? c.chatMetadata?.file_name;
      const character = c.characters?.[c.characterId];
      if (chat == null || chat === "") return "";
      return JSON.stringify([String(c.groupId ?? ""), String(character?.avatar ?? c.characterId ?? ""), String(chat)]);
    }
    storageKind() {
      return this.api("getVariables") && this.api("updateVariablesWith") ? "helper" : "extra";
    }
    variables(index) {
      const fn = this.api("getVariables");
      if (!fn) return {};
      try {
        return fn({ type: "message", message_id: index }) || {};
      } catch {
        return {};
      }
    }
    legacyFor(owner, len) {
      const c = this.legacyCache;
      if (c && c.owner === owner && Date.now() - c.at < 6e4 && c.len <= len) return c.value;
      let value = null;
      for (let i = len - 1; i >= Math.max(0, len - 80); i--) {
        const v = this.variables(i);
        if (v.手机终端) {
          value = v.手机终端;
          break;
        }
      }
      this.legacyCache = { owner, at: Date.now(), len, value };
      return value;
    }
    capture() {
      assert(!this.disposed, "手机宿主连接已卸载");
      const ctx = this.context(), owner = this.owner();
      assert(owner && Array.isArray(ctx?.chat), "请先打开一个酒馆角色聊天");
      const raw = ctx.chat;
      assert(raw.length, "等待第一条角色消息");
      const cache = this.fpCache || (this.fpCache = /* @__PURE__ */ new WeakMap());
      const lineage = new Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        const m = raw[i], mes = m.mes ?? m.message ?? "", swipe = m.swipe_id ?? 0, u = !!m.is_user, sys = !!m.is_system, hit = cache.get(m);
        if (hit && hit.i === i && hit.mes === mes && hit.swipe === swipe && hit.u === u && hit.sys === sys) {
          lineage[i] = hit.fp;
          continue;
        }
        const fp = fingerprint([i, swipe, mes, u, sys]);
        cache.set(m, { i, mes, swipe, u, sys, fp });
        lineage[i] = fp;
      }
      let floor = -1;
      for (let i = raw.length - 1; i >= 0; i--) if (!raw[i].is_user && !raw[i].is_system) {
        floor = i;
        break;
      }
      assert(floor >= 0, "等待一条可保存手机的角色消息");
      const char = ctx.characters?.[ctx.characterId] || ctx.character || {};
      const character = { name: char.name || ctx.name2 || "", avatar: char.avatar || "", description: char.description || char.data?.description || "", personality: char.personality || char.data?.personality || "", scenario: char.scenario || char.data?.scenario || "" };
      let stat = {}, statFloor = -1;
      for (let i = raw.length - 1; i >= Math.max(0, raw.length - 60); i--) {
        const v = this.variables(i);
        if (v.stat_data && typeof v.stat_data === "object" && Object.keys(v.stat_data).length) {
          stat = v.stat_data;
          statFloor = i;
          break;
        }
      }
      const legacy = this.legacyFor(owner, raw.length);
      const pd = (v) => { const a = String(v ?? "").match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/); return a && +a[2] >= 1 && +a[2] <= 12 && +a[3] >= 1 && +a[3] <= 31 ? a[1] + "-" + a[2].padStart(2, "0") + "-" + a[3].padStart(2, "0") : ""; };
      const deep = (o, depth = 0) => { if (!o || typeof o !== "object" || depth > 3) return ""; for (const [k, v] of Object.entries(o)) if (/日期|时间|date|time/i.test(k) && typeof v !== "object") { const d = pd(v); if (d) return d; } for (const v of Object.values(o)) if (v && typeof v === "object") { const d = deep(v, depth + 1); if (d) return d; } return ""; };
      const un = (v) => Array.isArray(v) && v.length && typeof v[0] !== "object" ? v[0] : v;
      const pt = (v) => { const a = String(un(v) ?? "").match(/(?:^|[^\d])([01]?\d|2[0-3])\s*[:：时]\s*([0-5]\d)(?!\d)/); return a ? a[1].padStart(2, "0") + ":" + a[2] : ""; };
      const deepTime = (o, depth = 0) => { if (!o || typeof o !== "object" || depth > 3) return ""; for (const [k, v] of Object.entries(o)) if (/时刻|时间|time|clock/i.test(k) && typeof un(v) !== "object") { const t = pt(v); if (t) return t; } for (const v of Object.values(o)) if (v && typeof v === "object") { const t = deepTime(v, depth + 1); if (t) return t; } return ""; };
      const containers = [stat.世界, stat.时间, stat.环境, stat.场景, stat.scene, stat.world, stat.env, stat.世界状态, stat.当前].map(un).filter((o) => o && typeof o === "object" && !Array.isArray(o));
      const hasDate = (o) => pd(un(o.日期)) || pd(un(o.当前日期)) || pd(un(o.date)) || pd(un(o.时间)) || pd(un(o.当前时间));
      const w = containers.find(hasDate) || containers[0] || {};
      const date = hasDate(w) || deep(stat) || "";
      const time = pt(w.时刻) || pt(w.time) || pt(w.当前时刻) || pt(w.时间) || pt(w.当前时间) || deepTime(stat) || (PRESET?.story?.date && date === PRESET.story.date ? String(PRESET.story.time || "") : "");
      const place = text(un(w.地点) || un(w.当前地点) || un(w.location) || un(w.场景) || un(w.place) || "", 120);
      const story = { date, time, place, weather: text(un(w.天气) || un(w.weather) || "", 80), known: !!date };
      const present = baibaiPresentFallback((stat.NPC动态?.当前互动NPC || []).map((n) => n.名字).filter(Boolean), this.win);
      const history = [];
      for (let i = raw.length - 1; i >= 0 && history.length < 8; i--) {
        const m = raw[i];
        if (m.is_system || m.extra?.isSmallSys) continue;
        const t = cleanNarrative(m.mes ?? m.message ?? "");
        if (t) history.unshift({ floor: i, role: m.is_user ? "user" : "assistant", name: m.name || "", text: t, hidden: false });
      }
      const lastAi = history.filter((m) => m.role === "assistant").pop();
      const narrativeKey = lastAi ? lastAi.floor + ":" + fingerprint(lastAi.text) : "";
      return { owner, floor, tail: raw.length - 1, pending: floor !== raw.length - 1, lineage, signature: fingerprint(lineage), narrativeKey, statSignature: fingerprint(stat), stat: clone(stat), statFloor, legacy: legacy ? clone(legacy) : null, character, userName: ctx.name1 || "玩家", story, present, history, backend: this.storageKind() };
    }
    same(snap) {
      try {
        return !this.disposed && !!snap && this.owner() === snap.owner;
      } catch {
        return false;
      }
    }
    candidates(snap, { max = 3 } = {}) {
      const list = [], ctx = this.context(), chat = ctx?.chat || [];
      let found = 0;
      for (let i = Math.min(snap.tail, chat.length - 1), scanned = 0; i >= 0 && scanned < 240 && found < max; i--, scanned++) {
        let hit = false;
        for (const e2 of [chat[i]?.extra?.[NS], this.variables(i)[NS]]) if (e2) {
          list.push({ floor: i, envelope: clone(e2) });
          hit = true;
        }
        if (hit) found++;
      }
      return list;
    }
    readTarget(snap) {
      assert(this.same(snap), "已切换到另一个聊天");
      return clone(snap.backend === "helper" ? this.variables(snap.floor)[NS] || null : this.context().chat[snap.floor]?.extra?.[NS] || null);
    }
    readChatStore() {
      try {
        const row = this.context()?.chatMetadata?.[NS_CHAT];
        if (row) return clone(row);
        const fn = this.api("getVariables"), v = fn ? fn({ type: "chat" }) || {} : {};
        return v[NS_CHAT] ? clone(v[NS_CHAT]) : null;
      } catch {
        return null;
      }
    }
    async writeChatStore(payload) {
      assert(this.owner() === payload.owner, "已切换聊天，未写入聊天级备份");
      const ctx = this.context(), save = ctx?.saveMetadata || ctx?.saveMetadataDebounced;
      if (ctx?.chatMetadata && typeof save === "function") {
        ctx.chatMetadata[NS_CHAT] = clone(payload);
        await save.call(ctx);
        return true;
      }
      const upd = this.api("updateVariablesWith");
      if (upd) {
        await upd((vars) => {
          vars[NS_CHAT] = clone(payload);
          return vars;
        }, { type: "chat" });
        return true;
      }
      return false;
    }
    async clearChatStore() {
      const ctx = this.context();
      if (ctx?.chatMetadata?.[NS_CHAT]) {
        delete ctx.chatMetadata[NS_CHAT];
        await (ctx.saveMetadata || ctx.saveMetadataDebounced)?.call(ctx);
      }
      const upd = this.api("updateVariablesWith");
      if (upd) await upd((vars) => {
        delete vars[NS_CHAT];
        return vars;
      }, { type: "chat" });
    }
    async saveEnvelope(snap, envelope, expected) {
      assert(this.same(snap), "已切换到另一个聊天，这次修改没有写入新的聊天");
      if (snap.backend === "helper") {
        await this.api("updateVariablesWith")((vars) => {
          assert(this.same(snap), "保存时已切换聊天");
          assert(fingerprint(vars[NS] || null) === expected, "手机存档刚刚更新，请重试");
          vars[NS] = clone(envelope);
          return vars;
        }, { type: "message", message_id: snap.floor });
      } else {
        const ctx = this.context(), save = ctx.saveChat || this.api("saveChat");
        assert(typeof save === "function", "缺少酒馆保存聊天接口；不会用临时数据冒充存档");
        const m = ctx.chat[snap.floor];
        assert(fingerprint(m.extra?.[NS] || null) === expected, "手机存档刚刚更新，请重试");
        const before = m.extra?.[NS], written = clone(envelope);
        m.extra = m.extra || {};
        m.extra[NS] = written;
        try {
          await save.call(ctx);
        } catch (e2) {
          if (m.extra?.[NS] === written) {
            if (before === void 0) delete m.extra[NS];
            else m.extra[NS] = before;
          }
          throw Error("酒馆保存未确认；已尝试恢复本地视图，磁盘状态仍需核对，请保留备份");
        }
      }
      assert(this.same(snap), "提交后已切换聊天，无法确认保存结果");
      assert(fingerprint(this.readTarget(snap)) === fingerprint(envelope), "回读不一致，不能确认保存成功");
      return true;
    }
    setPrompt(value, key = PROMPT_KEY, depth = 3) {
      const c = this.context(), fn = c?.setExtensionPrompt || this.api("setExtensionPrompt"), main = key === PROMPT_KEY;
      if (typeof fn !== "function") {
        if (main) {
          this.injectionReady = false;
          this.lastError = "未发现正文提示注入接口";
        }
        return false;
      }
      try {
        fn.call(c, key, value, c?.constants?.promptTypes?.IN_CHAT ?? 1, depth, false, c?.constants?.promptRoles?.SYSTEM ?? 0);
        if (main) {
          this.injectionReady = true;
          this.lastError = "";
        }
        return true;
      } catch (e2) {
        if (main) {
          this.injectionReady = false;
          this.lastError = text(e2.message, 160);
        }
        return false;
      }
    }
    clearPrompt() {
      this.setPrompt("");
      for (const key of ARC_PROMPT_KEYS) this.setPrompt("", key, 4);
    }
    isBusy() {
      const c = this.context();
      if (this.busy || c?.isGenerating === true || c?.streamingProcessor?.isFinished === false && !c.streamingProcessor.isStopped && c.streamingProcessor.abortController?.signal?.aborted !== true) return true;
      const stop = this.win.document.getElementById("mes_stop");
      return !!(stop && stop.getClientRects().length && this.win.getComputedStyle(stop).display !== "none");
    }
    isTyping() {
      const el = this.win.document.activeElement;
      return el?.id === "send_textarea" && !!el.value?.trim();
    }
    listen(fn) {
      const c = this.context(), helperEvents = this.api("tavern_events") || {}, types = c?.eventTypes || helperEvents;
      const map = { CHAT_CHANGED: "chat", MESSAGE_RECEIVED: "narrative", MESSAGE_SWIPED: "branch", MESSAGE_DELETED: "branch", MESSAGE_EDITED: "branch", GENERATION_STARTED: "start", GENERATION_ENDED: "end", GENERATION_STOPPED: "end", WORLDINFO_UPDATED: "worldbook" };
      for (const [key, kind] of Object.entries(map)) {
        const event = types[key] || helperEvents[key];
        if (!event) continue;
        const cb = (...args) => {
          const visibleMain = ["normal", "regenerate", "swipe", "continue", "impersonate"].includes(args[0]);
          const ownQuiet = this.ownRequests > 0 && !visibleMain;
          if (kind === "start" && !ownQuiet) this.busy = true;
          if (kind === "end") this.busy = false;
          if (ownQuiet && (kind === "start" || kind === "end")) return;
          fn(kind, args);
        };
        if (c?.eventSource?.on) {
          c.eventSource.on(event, cb);
          this.off.push(() => c.eventSource.removeListener?.(event, cb));
        } else if (this.api("eventOn")) {
          const handle = this.api("eventOn")(event, cb);
          this.off.push(() => handle?.stop?.() || this.api("eventOff")?.(event, cb));
        }
      }
      return () => {
        for (const off of this.off.splice(0)) try {
          off();
        } catch {
        }
      };
    }
    fill(value) {
      const input = this.win.document.querySelector("#send_textarea");
      assert(input, "未找到正文输入框");
      if (input.value.trim() && !this.win.confirm("正文输入框已有草稿，要替换吗？")) return false;
      input.value = text(value, 4e3);
      input.dispatchEvent(new this.win.Event("input", { bubbles: true }));
      input.focus();
      return true;
    }
    async personaReferences(name) {
      const snap = this.capture(), namesApi = this.api("getCharWorldbookNames"), read = this.api("getWorldbook");
      assert(namesApi && read, "需要酒馆助手的世界书读取接口；可先使用手工补充");
      const bindings = await namesApi("current");
      assert(this.same(snap), "读取期间聊天已变化");
      const books = [bindings?.primary, ...bindings?.additional || []].filter(Boolean);
      const result = [];
      for (const book of [...new Set(books)].slice(0, 10)) {
        const rows = await read(book);
        assert(this.same(snap), "读取期间聊天已变化");
        for (const row of rows || []) {
          const label = String(row.name || row.comment || "");
          if (row.extra?.primePrivate && row.extra.primeOwner !== snap.owner) continue;
          if (/过往|记忆|衣柜|成人|NSFW/i.test(label)) continue;
          const keys = row.strategy?.keys || row.keys || [];
          const matches = label === name || label === name + "_通用人设" || label.includes(name) && /人设|性格|解读|人物设定|角色/.test(label) || keys.some((k) => k === name) && /人设|性格|解读/.test(label);
          if (!matches) continue;
          if (row.enabled === false && label !== name + "_通用人设") continue;
          const content = String(row.content || "");
          assert(content.length <= 16e3, "匹配的人设条目过长，请在原卡中分段后再读");
          result.push({ id: fingerprint([book, row.uid ?? row.id, content]), book, name: label, content });
          if (result.length >= 5) break;
        }
        if (result.length >= 5) break;
      }
      return { snapshot: snap, rows: result };
    }
    // ---- 世界书（酒馆助手接口）：联系人导入、记忆世界书同步都走这里
    wbSupported() {
      return !!(this.api("getWorldbook") && this.api("getWorldbookNames"));
    }
    wbWritable() {
      return !!(this.api("updateWorldbookWith") && this.api("createWorldbook"));
    }
    async wbNames() {
      const fn = this.api("getWorldbookNames");
      assert(fn, "需要酒馆助手的世界书接口（getWorldbookNames）");
      return [...await fn() || []].map(String);
    }
    async wbRead(name) {
      const fn = this.api("getWorldbook");
      assert(fn, "需要酒馆助手的世界书接口（getWorldbook）");
      return [...await fn(name) || []];
    }
    /** 世界书写入串行队列：记忆世界书、世界书工坊、柏宝书回写等同时改书时依次执行，避免互相覆盖。 */
    enqueue(task) {
      const run = (this.wbQueue || Promise.resolve()).then(task, task);
      this.wbQueue = run.then(() => {
      }, () => {
      });
      return run;
    }
    wbCreate(name, entries = []) {
      return this.enqueue(async () => {
        const fn = this.api("createWorldbook");
        assert(fn, "需要酒馆助手的世界书接口（createWorldbook）");
        return await fn(name, entries) !== false;
      });
    }
    wbUpdate(name, updater) {
      return this.enqueue(async () => {
        const fn = this.api("updateWorldbookWith");
        assert(fn, "需要酒馆助手的世界书接口（updateWorldbookWith）");
        return [...await fn(name, updater, { render: "debounced" }) || []];
      });
    }
    async wbBindings() {
      const chars = this.api("getCharWorldbookNames"), chat = this.api("getChatWorldbookName"), global = this.api("getGlobalWorldbookNames");
      const c = chars ? await chars("current") : null;
      return { primary: c?.primary || null, additional: [...c?.additional || []], chat: chat ? await chat("current") || null : null, global: global ? [...await global() || []] : [] };
    }
    /** 绑定记忆世界书：card = 追加到当前角色卡的附加世界书（不动原有绑定）；chat = 只对当前聊天生效（聊天已绑了别的书就拒绝，绝不覆盖）。 */
    async wbBind(name, scope = "card") {
      if (scope === "chat") {
        const get2 = this.api("getChatWorldbookName"), set2 = this.api("rebindChatWorldbook");
        assert(get2 && set2, "需要酒馆助手的聊天世界书接口（rebindChatWorldbook）");
        const cur2 = await get2("current");
        if (cur2 === name) return false;
        assert(!cur2, "当前聊天已经绑定了世界书「" + cur2 + "」，为了不覆盖它，请改用“整张角色卡共用”或先在酒馆里解除。");
        await set2("current", name);
        return true;
      }
      const get = this.api("getCharWorldbookNames"), set = this.api("rebindCharWorldbooks");
      assert(get && set, "需要酒馆助手的世界书接口（rebindCharWorldbooks）");
      const cur = await get("current"), additional = [...cur?.additional || []];
      if ([cur?.primary, ...additional].includes(name)) return false;
      await set("current", { primary: cur?.primary ?? null, additional: [...additional, name] });
      return true;
    }
    async wbUnbind(name, scope = "card") {
      if (scope === "chat") {
        const get2 = this.api("getChatWorldbookName"), set2 = this.api("rebindChatWorldbook");
        if (get2 && set2 && await get2("current") === name) {
          await set2("current", "");
          return true;
        }
        return false;
      }
      const get = this.api("getCharWorldbookNames"), set = this.api("rebindCharWorldbooks");
      if (!get || !set) return false;
      const cur = await get("current"), additional = [...cur?.additional || []];
      if (!additional.includes(name)) return false;
      await set("current", { primary: cur?.primary ?? null, additional: additional.filter((x) => x !== name) });
      return true;
    }
    async withOwnRequest(fn) {
      this.ownRequests++;
      try {
        return await fn();
      } finally {
        this.ownRequests = Math.max(0, this.ownRequests - 1);
      }
    }
    dispose() {
      if (this.disposed) return;
      for (const off of this.off.splice(0)) try {
        off();
      } catch {
      }
      this.clearPrompt();
      this.disposed = true;
      this.sources = [];
    }
  };

