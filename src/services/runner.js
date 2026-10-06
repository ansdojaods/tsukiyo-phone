  // src/services/runner.js
  var TaskRunner = class {
    constructor(bridge) {
      this.bridge = bridge;
      this.active = null;
      this.events = new Emitter();
      this.seq = 0;
    }
    on(fn) {
      return this.events.on(fn);
    }
    get busy() {
      return !!this.active;
    }
    cancel(reason = "玩家停止", { backgroundOnly = false, module = "" } = {}) {
      if (!this.active) return;
      if (backgroundOnly && !this.active.background) return;
      if (module && this.active.module !== module) return;
      this.active.reason = reason;
      this.active.controller.abort(reason);
      this.events.emit({ type: "cancel", task: this.active });
    }
    async run(module, fn, { background = false, snapshot: snapshot2 = null } = {}) {
      if (this.active) {
        if (background) throw Error("已有任务进行中");
        if (this.active.background) this.cancel("手动操作优先");
        else throw Error("已有生成进行中，请先停止或等待");
      }
      const task = { token: ++this.seq, id: id("job"), module, background, snapshot: snapshot2 || this.bridge.capture(), controller: new AbortController(), started: Date.now(), reason: "" };
      this.active = task;
      this.events.emit({ type: "start", task });
      const timer = setInterval(() => {
        if (this.active !== task || !this.bridge.same(task.snapshot)) {
          task.reason = "已切换到另一个聊天";
          task.controller.abort(task.reason);
        }
      }, 800);
      const alive = () => this.active === task && !task.controller.signal.aborted && this.bridge.same(task.snapshot);
      try {
        const result = await fn({ signal: task.controller.signal, snapshot: task.snapshot, alive, guard: () => assert(alive(), task.reason || "任务已过期，结果未保存") });
        assert(alive(), task.reason || "任务已过期");
        this.events.emit({ type: "done", task });
        return result;
      } catch (e2) {
        this.events.emit({ type: task.controller.signal.aborted ? "stopped" : "error", task, error: e2 });
        throw e2;
      } finally {
        clearInterval(timer);
        if (this.active === task) this.active = null;
        this.events.emit({ type: "idle" });
      }
    }
    dispose() {
      this.cancel("手机卸载");
      this.events.clear();
    }
  };
  var BackgroundGate = class {
    constructor(win, { demo = false } = {}) {
      this.win = win;
      this.token = id("tab");
      this.lockName = demo ? "tsukiyo-phone-demo-background" : "tsukiyo-phone-background";
      this.leaseKey = (demo ? "tsukiyo-phone:demo:" : "tsukiyo-phone:v1:") + "background-lease";
      this.usageKey = (demo ? "tsukiyo-phone:demo:" : "tsukiyo-phone:v1:") + "background-usage";
    }
    usage(now = Date.now()) {
      try {
        return JSON.parse(this.win.localStorage.getItem(this.usageKey) || "[]").filter((x) => Number.isFinite(x.ts) && x.ts > now - 864e5);
      } catch {
        return [];
      }
    }
    counts() {
      const now = Date.now(), rows = this.usage(now);
      return { hour: rows.filter((x) => x.ts > now - 36e5).length, day: rows.length };
    }
    reserve(module, owner, limits) {
      const now = Date.now(), rows = this.usage(now);
      assert(rows.filter((x) => x.ts > now - 36e5).length < limits.maxHourly, "自动任务已达每小时上限");
      assert(rows.length < limits.maxDaily, "自动任务已达24小时上限");
      rows.push({ id: id("usage"), ts: now, module, owner });
      this.win.localStorage.setItem(this.usageKey, JSON.stringify(rows));
    }
    async run(fn) {
      if (this.win.navigator?.locks?.request) return this.win.navigator.locks.request(this.lockName, { ifAvailable: true }, async (lock) => lock ? fn(() => true) : { skipped: "another-tab" });
      let current;
      try {
        current = JSON.parse(this.win.localStorage.getItem(this.leaseKey) || "null");
      } catch {
      }
      if (current && current.until > Date.now() && current.token !== this.token) return { skipped: "another-tab" };
      const lease = { token: this.token, until: Date.now() + 135e3 };
      this.win.localStorage.setItem(this.leaseKey, JSON.stringify(lease));
      const owns = () => {
        try {
          return JSON.parse(this.win.localStorage.getItem(this.leaseKey) || "null")?.token === this.token;
        } catch {
          return false;
        }
      };
      await Promise.resolve();
      if (!owns()) return { skipped: "another-tab" };
      try {
        return await fn(owns);
      } finally {
        if (owns()) this.win.localStorage.removeItem(this.leaseKey);
      }
    }
  };

