  // src/services/scheduler.js
  function nextAutomatic(data, snapshot2, now = Date.now(), enabled = () => true) {
    const a = data.settings.auto;
    if (!a.enabled || !a.consentAt) return { reason: "后台未开启" };
    if (snapshot2.stat?.系统?.作品 === "臭小鬼" && !snapshot2.stat.系统.已选开场) return { reason: "先选择角色卡开场" };
    const world = storyFor(data, snapshot2), hour = Number(String(world.time).split(":")[0]);
    const quiet = world.time && a.quietStart !== a.quietEnd && (a.quietStart < a.quietEnd ? hour >= a.quietStart && hour < a.quietEnd : hour >= a.quietStart || hour < a.quietEnd);
    const replies = Number(snapshot2.aiCount) || 0;
    const readyN = (module, every) => enabled(module) && (data.automation.lastReply?.[module] === void 0 || replies < data.automation.lastReply[module] || replies - data.automation.lastReply[module] >= every) && now - (data.automation.last[module] || 0) >= 6e4 && now >= (data.automation.next[module] || 0);
    const ready = (module, minutes) => enabled(module) && now - (data.automation.last[module] || 0) >= minutes * 6e4 && now >= (data.automation.next[module] || 0);
    if (a.memory && data.activePlan && data.automation.lastNarrative !== snapshot2.signature && ready("memory", 2)) return { module: "memory", review: true };
    if (a.memory && ready("memory", 5)) {
      const t = data.threads.find((t2) => {
        const last = data.summaries.filter((s) => s.threadId === t2.id).at(-1);
        const i = last ? t2.messages.findIndex((m) => m.id === last.coveredId) : -1;
        return t2.messages.length - i - 1 >= 12;
      });
      if (t) return { module: "memory", threadId: t.id };
    }
    const candidates = data.plans.filter((p) => p.status === "candidate" && (!world.date || !p.baseDate || world.date <= addDays(p.baseDate, 6)));
    const everyN = a.proactiveEvery > 0 ? a.proactiveEvery : 1;
    const gapN = a.proactiveMinutes > 0 ? a.proactiveMinutes * 6e4 : 6e4;
    const unreadCap = Number.isInteger(a.proactiveUnreadCap) ? a.proactiveUnreadCap : 3;
    if (a.proactive && (a.proactiveIgnoreQuiet !== false || !quiet) && now - (data.automation.last.proactive || 0) >= gapN && readyN("proactive", everyN)) {
      const c = data.contacts.filter((c2) => contactAvailable(c2) && c2.proactive !== false).find((c2) => {
        const t = data.threads.find((t2) => t2.kind === "direct" && t2.members[0] === c2.id);
        const unread = t?.messages.filter((m) => m.role === "character" && !m.read).length || 0;
        return !t?.pending.length && (unreadCap === 0 || unread < unreadCap);
      });
      if (c) return { module: "proactive" };
    }
    if (!quiet && a.social && readyN("social", a.socialEvery || 5) && data.contacts.some(contactAvailable)) return { module: "social" };
    return { reason: quiet ? "剧情夜间免打扰：主动来信仍可到达；生活动态与规划按设置处理" : "后台待命 · 等待合适的时机" };
  }
  var Scheduler = class {
    constructor({ bridge, repo, runner, gate, actions, settings }) {
      Object.assign(this, { bridge, repo, runner, gate, actions, settings });
      this.events = new Emitter();
      this.timer = null;
      this.active = false;
      this.status = "后台未开启";
    }
    on(fn) {
      return this.events.on(fn);
    }
    setStatus(s) {
      this.status = s;
      this.events.emit(s);
    }
    start() {
      if (this.timer) return;
      this.timer = setInterval(() => this.tick().catch((e2) => this.setStatus(redactError(e2, this.settings.secrets()))), 3e4);
    }
    async tick() {
      if (this.active || this.runner.busy) return;
      if (!this.repo.data?.settings?.auto?.enabled) {
        this.setStatus("后台未开启");
        return;
      }
      if (this.bridge.isBusy() || this.bridge.isTyping()) {
        this.setStatus("正文生成/输入中，后台暂让行");
        return;
      }
      let snapshot2, data;
      try {
        snapshot2 = this.bridge.capture();
        data = this.repo.choose(snapshot2);
      } catch {
        this.setStatus("等待稳定的当前聊天");
        return;
      }
      try { snapshot2.aiCount = (this.bridge.context?.()?.chat || []).filter((m) => m && !m.is_user && !m.is_system).length; } catch { snapshot2.aiCount = 0; }
      const next = nextAutomatic(data, snapshot2, Date.now(), (m) => this.settings.isEnabled(m) && !(m === "planner" && this.settings.isEnabled("director") && studioDirectorOn(data, snapshot2)));
      if (!next.module) {
        this.setStatus(next.reason);
        return;
      }
      const limits = data.settings.auto, usage = this.gate.counts();
      const exempt = !!limits.proactiveUnlimited && next.module === "proactive";
      if (!exempt && (usage.hour >= limits.maxHourly || usage.day >= limits.maxDaily)) {
        this.setStatus("已达后台调用上限；主动来信不受此限制，手动操作仍可使用");
        return;
      }
      this.active = true;
      try {
        await this.gate.run(async (owns) => {
          assert(owns() && this.bridge.same(snapshot2), "执行权或场景已变化");
          this.gate.reserve(next.module, snapshot2.owner, exempt ? { ...limits, maxHourly: Infinity, maxDaily: Infinity } : limits);
          await this.repo.mutate((s) => {
            s.automation.attempts = s.automation.attempts.filter((x) => x.ts > Date.now() - 864e5);
            s.automation.attempts.push({ ts: Date.now(), module: next.module });
            if (s.automation.attempts.length > 1500) s.automation.attempts = s.automation.attempts.slice(-1500);
            s.automation.last[next.module] = Date.now();
            s.automation.lastReply = { ...s.automation.lastReply || {}, [next.module]: snapshot2.aiCount || 0 };
            log(s, "info", "后台开始一次自动任务；已计入调用预算", next.module);
          }, { snapshot: snapshot2, label: "后台任务预约" });
          this.setStatus("后台正在" + { planner: "规划未来方向", proactive: "等一封主动来信", social: "生成生活动态", memory: "整理有来源的记忆" }[next.module]);
          const options = { background: true, externalGuard: owns };
          if (next.module === "planner") await this.actions.plan(options);
          if (next.module === "proactive") await this.actions.proactive(null, options);
          if (next.module === "social") await this.actions.social(null, options);
          if (next.module === "memory") {
            if (next.review) await this.actions.reviewPlan(options);
            else await this.actions.memory(next.threadId, options);
          }
          this.setStatus("本次后台任务结束 · 不推进正文时间");
        });
      } catch (e2) {
        this.setStatus(redactError(e2, this.settings.secrets()));
        if (this.bridge.same(snapshot2) && !this.runner.busy) try {
          await this.repo.mutate((s) => {
            const n = Math.min(6, (s.automation.failures[next.module] || 0) + 1);
            s.automation.failures[next.module] = n;
            s.automation.next[next.module] = Date.now() + Math.min(60, 2 ** n) * 6e4;
            log(s, "warning", redactError(e2, this.settings.secrets()) + "；已退避，未修改已有交流", next.module);
          }, { snapshot: snapshot2, label: "后台失败与退避记录" });
        } catch {
        }
      } finally {
        this.active = false;
      }
    }
    stop() {
      clearInterval(this.timer);
      this.timer = null;
      this.runner.cancel("后台停止/手机卸载");
    }
  };

