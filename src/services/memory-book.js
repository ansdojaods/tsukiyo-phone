  // src/services/memory-book.js
  var BAD_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;
  function defaultBookName(snap, scope = "card") {
    const card = String(snap?.character?.name || "当前角色卡").replace(BAD_NAME, "_").trim().slice(0, 60) || "当前角色卡";
    let suffix = "";
    if (scope === "chat") {
      let chat = "";
      try {
        chat = String(JSON.parse(snap.owner)[2] || "");
      } catch {
      }
      suffix = "·" + (chat.replace(BAD_NAME, "_").replace(/\s+/g, "").slice(-18) || "本聊天");
    }
    return card + "-小手机记忆" + suffix;
  }
  var cleanBookName = (v) => String(v ?? "").replace(BAD_NAME, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  var MemoryBook = class {
    constructor(engine) {
      this.eng = engine;
      this.events = new Emitter();
      this.timer = null;
      this.tick = null;
      this.running = false;
      this.again = false;
      this.stopped = false;
      this.lastBookSig = "";
      this.lastHash = "";
      this.phase = "idle";
      this.note = "";
      this.confirmNeeded = null;
      this.tried = "";
      this.storeKey = (engine.bridge.mode === "demo" ? "tsukiyo-phone:demo:" : "tsukiyo-phone:v1:") + "memory-book";
    }
    on(fn) {
      return this.events.on(fn);
    }
    get bridge() {
      return this.eng.bridge;
    }
    get cfg() {
      return this.eng.repo.data?.memoryBook || null;
    }
    publish(patch = {}) {
      Object.assign(this, patch);
      this.events.emit({ type: "status" });
      this.eng.emit("status");
    }
    supported() {
      return !!(this.bridge.wbSupported?.() && this.bridge.wbWritable?.());
    }
    /** 给界面用的状态摘要 */
    info() {
      const cfg = this.cfg, s = this.eng.repo.data;
      return {
        supported: this.supported(),
        linked: !!cfg?.linked,
        name: cfg?.name || "",
        scope: cfg?.scope || "card",
        bound: !!cfg?.bound,
        autoSync: cfg?.autoSync !== false,
        lastSyncAt: cfg?.lastSyncAt || 0,
        lastError: cfg?.lastError || "",
        linkedCount: s ? s.memories.filter((m) => m.wb).length : 0,
        total: s ? s.memories.length : 0,
        phase: this.phase,
        note: this.note,
        confirm: this.confirmNeeded
      };
    }
    start() {
      this.stopped = false;
      clearInterval(this.tick);
      this.tick = setInterval(() => {
        if (this.cfg?.linked && this.cfg.autoSync !== false) this.schedule(200);
      }, 45e3);
    }
    stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      clearInterval(this.tick);
      this.timer = this.tick = null;
    }
    schedule(delay = 1200) {
      if (this.stopped) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (this.cfg?.linked && this.cfg.autoSync !== false) this.sync({ reason: "auto" }).catch(() => {
        });
      }, delay);
    }
    cardKey(snap) {
      return String(snap?.character?.avatar || snap?.character?.name || "");
    }
    saved() {
      try {
        return JSON.parse(this.eng.win.localStorage.getItem(this.storeKey) || "{}") || {};
      } catch {
        return {};
      }
    }
    remember(snap, value) {
      const key = this.cardKey(snap);
      if (!key) return;
      const all = this.saved();
      if (value) all[key] = value;
      else delete all[key];
      try {
        this.eng.win.localStorage.setItem(this.storeKey, JSON.stringify(all));
      } catch {
      }
    }
    /** 整张角色卡共用的记忆世界书：这张卡以后新开的聊天，手机会自动连上同一本（可在记忆页停止同步来取消）。 */
    maybeAutoLink() {
      const s = this.eng.repo.data, owner = this.eng.repo.snapshot?.owner;
      if (!s || !owner || this.tried === owner || s.memoryBook.linked || !this.supported()) return;
      this.tried = owner;
      let snap;
      try {
        snap = this.bridge.capture();
      } catch {
        return;
      }
      const saved = this.saved()[this.cardKey(snap)];
      if (!saved || saved.scope !== "card") return;
      this.link({ name: saved.name, scope: "card", acceptExisting: true, importUids: saved.importUids ?? null }).catch(() => {
      });
    }
    /** 引擎在手机数据变化 / 世界书事件时调用：只有真正相关的变化才会触发同步 */
    notePhoneChange() {
      const s = this.eng.repo.data, cfg = s?.memoryBook;
      if (!cfg?.linked || cfg.autoSync === false) return;
      const h = fingerprint([cfg.name, cfg.pendingDelete.length, s.memories.map((m) => [m.id, memorySig(m), !!m.wb])]);
      if (h === this.lastHash) return;
      this.lastHash = h;
      this.schedule(1200);
    }
    bookSig(rows) {
      return fingerprint(rows.map((r) => [r.uid ?? r.id, r.name, r.content, r.enabled, r.strategy?.keys, r.extra?.tsukiyo?.id]));
    }
    /** 酒馆说世界书变了：先看内容是不是真的和我们上次写完/读到的不一样（自己写的回声直接忽略），不一样才同步。 */
    poke(kind, args = []) {
      const cfg = this.cfg;
      if (!cfg?.linked || cfg.autoSync === false) return;
      const book = typeof args[0] === "string" ? args[0] : "";
      if (book && book !== cfg.name) return;
      if (kind !== "worldbook") return this.schedule(1200);
      this.bridge.wbRead(cfg.name).then((rows) => {
        if (this.bookSig(rows) !== this.lastBookSig) this.schedule(500);
      }, () => this.schedule(500));
    }
    async _mutate(fn, label, origin = null) {
      const snap = origin || this.bridge.capture();
      reviewAssert(this.eng, snap);
      return this.eng.repo.mutate(fn, { label, snapshot: snap });
    }
    /** 创建（或连接已有）世界书，并绑定到角色卡/聊天，然后做第一次同步。 */
    async link({ name = "", scope = "card", acceptExisting = false, importUids = null } = {}) {
      assert(this.supported(), "需要酒馆助手的世界书接口（getWorldbook / createWorldbook / updateWorldbookWith）；请确认已启用酒馆助手");
      const snap = this.bridge.capture();
      const book = cleanBookName(name) || defaultBookName(snap, scope);
      this.publish({ phase: "linking", note: "正在创建 / 连接世界书…" });
      try {
        const names3 = await this.bridge.wbNames();
        reviewAssert(this.eng, snap);
        if (names3.includes(book)) {
          const rows = await this.bridge.wbRead(book);
          reviewAssert(this.eng, snap);
          if (rows.length && !acceptExisting) {
            const err = Error("世界书「" + book + "」已经存在，里面有 " + rows.length + " 个条目。");
            err.code = "BOOK_EXISTS";
            err.count = rows.length;
            err.book = book;
            throw err;
          }
        } else assert(await this.bridge.wbCreate(book, []) || (await this.bridge.wbNames()).includes(book), "创建世界书失败");
        reviewAssert(this.eng, snap);
        let bindError = "";
        const bound = await this.bridge.wbBind(book, scope).then(() => true, (e2) => {
          bindError = redactError(e2, []);
          return false;
        });
        await this._mutate((s) => {
          if (importUids !== null) { s.memoryBook.selectionBook = book; s.memoryBook.importUids = [...new Set(importUids)]; }
          else if (s.memoryBook.selectionBook !== book) { delete s.memoryBook.selectionBook; delete s.memoryBook.importUids; }
          Object.assign(s.memoryBook, { name: book, scope, linked: true, bound, autoSync: true, lastError: bound ? "" : "世界书已创建，但没能绑定：" + bindError, pendingDelete: [] });
          log(s, "ok", "记忆世界书已连接：" + book, "memory");
        }, "连接记忆世界书", snap);
        this.lastHash = "";
        this.remember(snap, scope === "card" ? { name: book, scope, importUids: this.cfg.selectionBook === book ? this.cfg.importUids : null } : null);
        return await this.sync({ reason: "link", force: true });
      } finally {
        this.publish({ phase: "idle" });
      }
    }
    async unlink({ unbind = false } = {}) {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接记忆世界书");
      if (unbind) await this.bridge.wbUnbind(cfg.name, cfg.scope).catch(() => false);
      await this._mutate((s) => {
        s.memoryBook.linked = false;
        s.memoryBook.bound = s.memoryBook.bound && !unbind;
        s.memoryBook.pendingDelete = [];
        log(s, "info", "已停止同步记忆世界书（世界书本身保留）", "memory");
      }, "停止同步记忆世界书");
      this.confirmNeeded = null;
      try {
        this.remember(this.bridge.capture(), null);
      } catch {
      }
      this.publish({});
    }
    async rebind() {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接记忆世界书");
      await this.bridge.wbBind(cfg.name, cfg.scope);
      await this._mutate((s) => {
        s.memoryBook.bound = true;
        s.memoryBook.lastError = "";
      }, "重新绑定记忆世界书");
      this.publish({});
    }
    async setAutoSync(on) {
      await this._mutate((s) => {
        s.memoryBook.autoSync = !!on;
      }, "记忆世界书自动同步开关");
      if (on) this.schedule(300);
    }
    /** 世界书被清空/删除后：以手机为准重建（清掉所有链接后重新创建条目） */
    async rebuildFromPhone() {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接记忆世界书");
      await this._mutate((s) => {
        for (const m of s.memories) delete m.wb;
        s.memoryBook.pendingDelete = [];
        s.memoryBook.lastError = "";
      }, "以手机记忆重建世界书");
      this.confirmNeeded = null;
      this.lastHash = "";
      return this.sync({ reason: "rebuild", force: true });
    }
    /** 冲突时被世界书版本覆盖的手机旧内容，可以恢复（下一轮同步会把它写回世界书）。 */
    async restorePrev(memoryId) {
      await this._mutate((s) => {
        const m = s.memories.find((x) => x.id === memoryId);
        assert(m?.prev, "没有可恢复的旧内容");
        const prev = m.prev;
        delete m.prev;
        m.title = prev.title;
        m.text = prev.text;
        m.keys = prev.keys || [];
      }, "恢复被覆盖的记忆");
    }
    async sync({ reason = "auto", force = false, acceptMassDelete = false } = {}) {
      if (this.stopped || !this.cfg?.linked) return null;
      if (this.running) {
        this.again = true;
        return null;
      }
      if (!force && this.bridge.isBusy?.()) {
        this.schedule(4e3);
        return null;
      }
      const runSnap = this.bridge.capture();
      this.running = true;
      this.publish({ phase: "syncing" });
      let result = null, agg = null, firstPlan = null;
      try {
        for (let round = 0; round < 3; round++) {
          reviewAssert(this.eng, runSnap);
          const cfg = this.cfg, book = cfg.name, data = this.eng.repo.data;
          const snap = this.bridge.capture();
          const inputSig = fingerprint([data.memoryBook, data.memories]);
          const guard = () => { reviewAssert(this.eng, runSnap); assert(inputSig === fingerprint([this.eng.repo.data.memoryBook, this.eng.repo.data.memories]), "记忆或同步配置已变化，请重新同步"); return true; };
          const names3 = await this.bridge.wbNames();
          if (!names3.includes(book)) {
            const err = Error("世界书「" + book + "」不存在（可能在酒馆里被删除了）");
            err.code = "BOOK_MISSING";
            throw err;
          }
          const entries = await this.bridge.wbRead(book);
          guard();
          const handledRemoved = new Set(cfg.pendingDelete.map((r) => r.id));
          const opts = () => ({ removed: cfg.pendingDelete, allowedImportUids: cfg.selectionBook === book ? cfg.importUids : null, newId: () => id("memory") });
          let plan = planMemorySync(data.memories.filter(notBaibai), entries, opts());
          const needsWrite = plan.create.length || plan.update.length || plan.stamp.length || plan.deleteWB.length || plan.import.some((e2) => !e2.tid);
          let finalEntries = entries;
          if (needsWrite) {
            const byId = new Map(data.memories.map((m) => [m.id, m]));
            finalEntries = await this.bridge.wbUpdate(book, (fresh) => {
              guard();
              plan = planMemorySync(data.memories.filter(notBaibai), fresh, opts());
              return applyPlanToEntries(fresh, plan, byId);
            });
          }
          if (plan.guard && !acceptMassDelete) {
            this.confirmNeeded = { kind: "mass-delete", count: plan.deleteLocal.length };
            plan.deleteLocal = [];
            plan.guard = "held";
          } else if (plan.guard && acceptMassDelete) plan.guard = "";
          let stats = null, bound = cfg.bound;
          try {
            const b = await this.bridge.wbBindings();
            bound = [b.primary, ...b.additional, b.chat, ...b.global].includes(book);
          } catch {
          }
          await this.eng.repo.mutate((s) => {
            stats = applyPlanToMemories(s, plan, finalEntries, { book, newId: () => id("memory") });
            const mb = s.memoryBook;
            mb.lastSyncAt = Date.now();
            mb.bound = bound;
            mb.lastError = plan.guard === "held" ? "世界书里的记忆被大量删除/清空，已暂停删除手机里的记忆（保险丝）" : bound ? "" : "世界书没有绑定到当前角色卡/聊天：记忆不会进入正文，请点“重新绑定”";
            mb.pendingDelete = mb.pendingDelete.filter((r) => !handledRemoved.has(r.id));
            if (plan.skipped.length) log(s, "info", "有 " + plan.skipped.length + " 个世界书条目超过 8000 字，没有导入手机（世界书里保持原样）", "memory");
            if (stats.conflicts) log(s, "warning", "有 " + stats.conflicts + " 条记忆两边都改过，已采用世界书版本（手机旧内容可在记忆页恢复）", "memory");
          }, { label: "记忆世界书同步", snapshot: snap, guard });
          this.lastBookSig = this.bookSig(finalEntries);
          this.lastHash = fingerprint([this.cfg.name, this.cfg.pendingDelete.length, this.eng.repo.data.memories.map((m) => [m.id, memorySig(m), !!m.wb])]);
          firstPlan = firstPlan || { create: plan.create.length, update: plan.update.length, pull: plan.pull.length, import: plan.import.length, deleteLocal: plan.deleteLocal.length, deleteWB: plan.deleteWB.length, guard: plan.guard };
          agg = agg ? Object.fromEntries(Object.keys(stats).map((k) => [k, agg[k] + stats[k]])) : stats;
          result = { reason, plan: firstPlan, stats: agg };
          const dirty = stats.created + stats.updated + stats.pulled + stats.imported + stats.deleted + stats.deletedWB;
          if (!dirty || plan.guard === "held") break;
        }
        this.publish({ note: "" });
        return result;
      } catch (err) {
        const message = err?.code === "BOOK_MISSING" ? err.message + "。可以点“以手机记忆重建世界书”，或在设置里停止同步。" : redactError(err, this.eng.settings.secrets());
        try {
          reviewAssert(this.eng, runSnap);
          await this.eng.repo.mutate((s) => {
            s.memoryBook.lastError = message;
          }, { label: "记忆世界书同步失败记录", snapshot: this.bridge.capture() });
        } catch {
        }
        this.publish({ note: message });
        throw err;
      } finally {
        this.running = false;
        this.publish({ phase: "idle" });
        if (this.again) {
          this.again = false;
          this.schedule(800);
        }
      }
    }
    /** 玩家确认了“世界书被清空/大量删除，手机也照着删”。 */
    async acceptMassDelete() {
      this.confirmNeeded = null;
      return this.sync({ reason: "confirm", force: true, acceptMassDelete: true });
    }
    /** 手机里删除一条记忆：在同一次写入里登记“待从世界书删除”，并立即同步。 */
    removeLinked(s, memoryId) {
      const m = s.memories.find((x) => x.id === memoryId);
      assert(m, "记忆不存在");
      if (m.wb && s.memoryBook.linked) s.memoryBook.pendingDelete.push({ id: m.id, uid: m.wb.uid });
      s.memories = s.memories.filter((x) => x.id !== memoryId);
    }
  };

