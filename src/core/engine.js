  // src/core/engine.js — PhoneEngine 组装类：把仓储 / 设置 / 通道 / 日程 / 各子模块串成一个引擎
  var PhoneEngine = class {
    constructor(bridge) {
      this.bridge = bridge;
      this.win = bridge.win;
      const demo = bridge.mode === "demo";
      this.events = new Emitter();
      this.repo = new PhoneRepository(bridge);
      this.settings = new SettingsStore(this.win, { demo });
      this.media = new MediaStore(this.win, { demo });
      this.runner = new TaskRunner(bridge);
      this.gate = new BackgroundGate(this.win, { demo });
      this.router = new ApiRouter(bridge, this.settings);
      this.actions = new PhoneActions({ repo: this.repo, bridge, settings: this.settings, router: this.router, runner: this.runner, notify: (message, kind, target) => this.events.emit({ type: "notice", message, kind, target }) });
      this.scheduler = new Scheduler({ bridge, repo: this.repo, runner: this.runner, gate: this.gate, actions: this.actions, settings: this.settings });
      this.arc = new ArcAuto(this);
      this.memoryBook = new MemoryBook(this);
      this.bookStudio = new BookStudio(this);
      this.soul = new SoulStudio(this);
      this.baibai = new BaiBaiLink(this);
      this.ms = new MemoryStudio(this);
      this.memApi = new MemoryApiLink(this);
      this.visual = new VisualArchive(this);
      this.studio = new StoryStudio(this);
      this.center = new StoryCenter(this);
      this.disposed = false;
      this.refreshing = false;
      this.state = "waiting";
      this.arcHash = "";
      this.lastCheap = "";
      this.warmedOwner = "";
      this.error = "";
      this.lastOwner = "";
      this.lastHash = "";
      this.prompt = "";
      this.promptHash = "";
      this.timer = null;
      this.debounce = null;
      this.legacyAttempts = /* @__PURE__ */ new Set();
      this.off = [];
      this.apiStamp = fingerprint([this.settings.data.profiles, this.settings.data.routes, this.settings.data.defaultProfile]);
      this.enabledFlags = { ...this.settings.data.enabled };
    }
    on(fn) {
      return this.events.on(fn);
    }
    emit(type = "change") {
      this.events.emit({ type });
    }
    async init() {
      this.off.push(this.repo.on((event) => {
        if (event.type === "unavailable") {
          this.emit();
          return;
        }
        this.state = "ready";
        this.error = "";
        this.lastOwner = event.snapshot.owner;
        this.updatePrompt();
        this.memoryBook.notePhoneChange();
        this.bookStudio.notePhoneChange();
        this.memoryBook.maybeAutoLink();
        this.emit();
      }));
      this.off.push(this.settings.on(() => {
        const stamp = fingerprint([this.settings.data.profiles, this.settings.data.routes, this.settings.data.defaultProfile]);
        if (stamp !== this.apiStamp) {
          this.runner.cancel("API方案/路由已经改变");
          this.apiStamp = stamp;
        }
        const flags = { ...this.settings.data.enabled };
        for (const [module, on] of Object.entries(flags)) if (on === false && this.enabledFlags?.[module] !== false) this.runner.cancel("「" + module + "」模块已关闭", { module });
        this.enabledFlags = flags;
        this.updatePrompt();
        this.emit();
      }));
      this.off.push(this.runner.on((event) => {
        if (event.type === "error" && this.repo.data) {
          const snap = this.repo.snapshot;
          if (snap && this.bridge.same(snap)) this.repo.mutate((s) => log(s, "warning", redactError(event.error, this.settings.secrets()), event.task.module), { snapshot: snap, label: "生成失败记录" }).catch(() => {
          });
        }
        this.emit();
      }));
      this.off.push(this.scheduler.on(() => this.emit("status")));
      this.off.push(this.bridge.listen((kind, args) => {
        if (kind === "worldbook") {
          this.memoryBook.poke("worldbook", args || []);
          this.bookStudio.poke("worldbook", args || []);
          return;
        }
        if (kind === "start") {
          this.runner.cancel("主线开始生成，后台任务让行", { backgroundOnly: true });
          this.emit("status");
          return;
        }
        if (kind === "end") {
          this.soul.onGenerationEnded();
          this.ms.onGenerationEnded();
          this.emit("status");
          return;
        }
        if (kind === "chat") {
          this.arc.reset();
          this.bridge.clearPrompt();
          this.promptHash = "";
          this.arcHash = "";
          this.lastCheap = "";
          this.soul.clearRoleplay();
        }
        if (kind === "narrative" || kind === "branch") this.arc.poke(kind);
        if (kind === "branch") this.repo.flushMirror();
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.refresh(), 400);
      }));
      await this.refresh();
      if (this.disposed) return this;
      this.timer = setInterval(async () => { await this.refresh(); if (!this.disposed) { await this.center.maintain().catch(err => { this.studio.status = redactError(err, this.settings.secrets()); }); this.visual.tick().catch(() => {}); } }, 2200);
      this.scheduler.start();
      this.arc.start();
      this.memoryBook.start();
      this.bookStudio.start();
      this.baibai.start();
      this.soul.start();
      this.ms.start();
      return this;
    }
    async refresh() {
      if (this.disposed || this.refreshing) return;
      this.refreshing = true;
      try {
        const owner = this.bridge.owner();
        if (owner !== this.lastOwner) {
          this.runner.cancel("已切换角色或聊天");
          this.arc.reset();
          this.bridge.clearPrompt();
          this.promptHash = "";
          this.arcHash = "";
          this.repo.clearView();
          this.lastHash = "";
          this.lastCheap = "";
          this.lastOwner = owner;
          this.studio.status = "";
          this.studio.lastRequest = null;
          this.visual.status = "";
          this.visual.lastAutoKey = "";
          this.soul.clearRoleplay();
        }
        if (this.bridge.isBusy()) {
          this.state = this.repo.data ? "ready" : "waiting";
          return;
        }
        if (owner && this.warmedOwner !== owner) {
          this.warmedOwner = owner;
          await this.repo.mirror.warm(owner);
        }
        const snap = this.bridge.capture();
        const cheap = fingerprint([snap.owner, snap.signature, snap.statSignature, this.repo.data?.revision ?? -1]);
        if (cheap === this.lastCheap && this.repo.data) return;
        const data = this.repo.choose(snap), hash = fingerprint([snap.owner, snap.signature, snap.statSignature, data]);
        this.lastCheap = cheap;
        if (hash !== this.lastHash) {
          this.repo.data = data;
          this.repo.snapshot = snap;
          this.state = "ready";
          this.error = "";
          this.lastHash = hash;
          const choice = this.repo.lastChoice;
          const existing = choice.source !== "seed" || this.bridge.candidates(snap).some((x) => x.envelope?.schema === 1);
          if (!existing) await this.repo.mutate(() => {
          }, { snapshot: snap, label: "首次初始化新手机" });
          else if (choice.source !== "floor") await this.repo.mutate(() => {
          }, { snapshot: snap, label: "把手机存档接回当前聊天" }).catch(() => {
          });
          this.updatePrompt();
          this.emit();
        }
      } catch (e2) {
        this.error = redactError(e2, this.settings.secrets());
        this.state = this.repo.data && this.bridge.owner() === this.lastOwner ? "ready" : "waiting";
        if (this.bridge.owner() !== this.lastOwner) {
          this.repo.clearView();
          this.bridge.clearPrompt();
        }
        this.emit("status");
      } finally {
        this.refreshing = false;
      }
    }
    updatePrompt() {
      if (!this.repo.data || !this.repo.snapshot) return;
      const value = compileInjection(centerProjectionPhone(this.repo.data, this.repo.snapshot, this.settings), this.repo.snapshot) + (this.settings.isEnabled("visual") ? avsProjection(this.repo.data, this.repo.snapshot) : "") + studioProjection(this.repo.data, this.repo.snapshot, this.settings), hash = fingerprint([this.repo.snapshot.owner, value]);
      if (hash !== this.promptHash || !this.bridge.injectionReady) {
        const ok = this.bridge.setPrompt(value);
        this.prompt = value;
        if (ok) this.promptHash = hash;
      }
      this.updateArcPrompts();
    }
    updateArcPrompts() {
      const s = this.repo.data, snap = this.repo.snapshot;
      if (!s || !snap) return;
      let blocks = {};
      try {
        blocks = centerArcPrompts(s, snap, this.settings);
      } catch (e2) {
        console.warn("[月夜来信] 剧情规划注入生成失败", e2?.message);
      }
      const hash = fingerprint([snap.owner, blocks]);
      if (hash === this.arcHash) return;
      let ok = true;
      for (const [name, key] of Object.entries(ARC_KEYS)) ok = this.bridge.setPrompt(blocks[name] || "", key, 4) && ok;
      if (ok) this.arcHash = hash;
    }
    async mutate(fn, label = "手工手机记录") {
      assert(this.state === "ready" && this.repo.data, "当前没有可写入的稳定聊天");
      return this.repo.mutate(fn, { label });
    }
    async setAuto(enabled) {
      this.runner.cancel("自动化规则改变");
      return this.mutate((s) => {
        s.settings.auto.enabled = enabled;
        s.settings.auto.consentAt = enabled ? Date.now() : 0;
        log(s, "info", enabled ? "玩家明确启用了后台自动任务；主动来信不占用每小时/24小时上限，也不受夜间免打扰限制" : "玩家关闭了后台自动任务");
      }, "切换后台自动化");
    }
    async setPlanningMode(mode) {
      assert(["manual", "auto"].includes(mode), "未知规划模式");
      return this.mutate((s) => {
        s.settings.planningMode = mode;
        if (mode === "auto" && !s.activePlan) {
          const p = s.plans.find((p2) => p2.status === "candidate");
          if (p) adoptPlan(s, p.id, "auto");
        }
      }, "切换方向选择模式");
    }
    async saveAuto(raw) {
      this.runner.cancel("自动化规则改变");
      return this.mutate((s) => {
        for (const key of ["proactive", "planning", "social", "memory", "proactiveUnlimited", "proactiveIgnoreQuiet"]) s.settings.auto[key] = raw[key] === true;
        for (const [key, lo, hi] of [["proactiveMinutes", 0, 1440], ["planningMinutes", 5, 1440], ["socialMinutes", 10, 1440], ["proactiveEvery", 0, 50], ["socialEvery", 1, 50], ["maxHourly", 1, 30], ["maxDaily", 1, 100], ["quietStart", 0, 23], ["quietEnd", 0, 23], ["proactiveUnreadCap", 0, 50], ["proactiveCooldown", 0, 30]]) if (raw[key] !== void 0 && raw[key] !== "") s.settings.auto[key] = Math.round(clamp(raw[key], lo, hi));
        s.settings.planningMode = "manual";
        log(s, "info", "后台规则已保存：主动来信" + (s.settings.auto.proactiveUnlimited ? "不占用每小时/24小时上限" : "仍占用调用上限") + (s.settings.auto.proactiveIgnoreQuiet ? "，且不受夜间免打扰限制" : "，夜间免打扰生效") + "；防重复话题 " + (s.settings.auto.proactiveCooldown ? "记录最近 " + s.settings.auto.proactiveCooldown + " 条" : "已关闭"));
      }, "保存后台规则");
    }
    legacyRuntime() {
      return this.win.__KUSOGAKI_V2_RUNTIME__ || null;
    }
    async settleCafe(recipe, confirmed) {
      const runtime = this.legacyRuntime();
      assert(runtime?.KG?.settleOrder && runtime?.write, "此卡未提供兼容的店务控制器；不会模拟修改真实变量");
      const proof = id("order");
      await runtime.write((s) => runtime.KG.settleOrder(s, recipe, proof, confirmed), "新手机 · 实际订单记账");
      await this.refresh();
      return proof;
    }
    async recordProject(name, note, confirmed) {
      const runtime = this.legacyRuntime();
      assert(runtime?.KG?.recordProject && runtime?.write, "此卡未提供兼容项目控制器");
      await runtime.write((s) => runtime.KG.recordProject(s, name, note, id("project"), confirmed), "新手机 · 实际项目记录");
      await this.refresh();
    }
    async addClue(title, source) {
      const runtime = this.legacyRuntime();
      assert(runtime?.KG?.addClue && runtime?.write, "此卡未提供兼容线索板控制器");
      await runtime.write((s) => runtime.KG.addClue(s, title, source, false), "新手机 · 待核实线索");
      await this.refresh();
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      clearInterval(this.timer);
      clearTimeout(this.debounce);
      this.scheduler.stop();
      this.arc.stop();
      this.memoryBook.stop();
      this.bookStudio.stop();
      this.baibai.stop();
      this.soul.dispose();
      this.ms.dispose();
      this.visual.dispose();
      this.studio.dispose();
      this.center.dispose();
      this.runner.dispose();
      this.router.dispose();
      for (const off of this.off) try {
        off();
      } catch {
      }
      this.bridge.dispose();
      this.repo.dispose?.();
      this.media.dispose();
      this.events.clear();
    }
  };

