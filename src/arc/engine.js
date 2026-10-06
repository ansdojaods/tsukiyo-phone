  // src/arc/engine.js
  function arcReserve(win, max) {
    const key = "tsukiyo-phone:v1:arc-usage", now = Date.now();
    let rows = [];
    try {
      rows = JSON.parse(win.localStorage.getItem(key) || "[]").filter((t) => Number.isFinite(t) && t > now - 36e5);
    } catch {
    }
    assert(rows.length < max, "剧情规划已达每小时自动调用上限（" + max + " 次）；手动操作仍可使用");
    rows.push(now);
    try {
      win.localStorage.setItem(key, JSON.stringify(rows));
    } catch {
    }
  }
  function arcOutlinePair(arc) {
    const o = arc.outline;
    return o.beats.length ? { 当前节点: arcBeatLabel(o.beats[o.cursor]) + "：" + arcClip(o.beats[o.cursor].scene, 150), 下个节点: o.beats[o.cursor + 1] ? arcBeatLabel(o.beats[o.cursor + 1]) + "：" + arcClip(o.beats[o.cursor + 1].scene, 120) : "（已是最后节点）" } : "（尚无大纲）";
  }
  var arcOpts = { requireAuto: false };
  Object.assign(PhoneActions.prototype, {
    arcOutline(options = {}) {
      return this.perform("planner", (s, snap) => {
        const arc = s.arc, payload = { ...arcBrief(s, snap, { messages: 6, chars: 2600 }), 已有事件线: arcActiveLines(arc).map((l) => ({ 名称: l.name, 阶段: l.stage, 现状: arcClip(l.desc, 100) })), 已有日程: arcAllEvents(arc).filter((e2) => !e2.done).slice(0, 10).map((e2) => e2.title), 旧大纲: arc.outline.beats.map(arcBeatLabel), 说明: arc.outline.beats.length ? "这是重新生成：请按最新正文重新判断走向；仍然成立的节点可以保留，不必与旧大纲相同。" : "这是首次生成大纲。" };
        return { system: ARC_OUTLINE_SYSTEM(), payload, parse: arcReadOutline, meta: {}, success: "剧情大纲（面）已生成" };
      }, (s, v, snap) => {
        arcApplyOutline(s.arc, v, snap);
        return v;
      }, { ...arcOpts, sigOf: (x) => JSON.stringify([x.arc.outline.beats.length, x.arc.outline.updatedAt]), ...options });
    },
    arcJudge(options = {}) {
      const free = options.free === true;
      return this.perform("planner", (s, snap) => {
        const o = s.arc.outline;
        assert(o.beats.length >= 2, "还没有大纲，请先生成");
        const payload = { 节点: o.beats.map((b, i) => ({ 编号: i + 1, 标题: arcBeatLabel(b), 阶段说明: arcClip(b.scene, 130) })), 当前编号: o.cursor + 1, 剧情时间: storyFor(s, snap), 最近正文: snap.history.slice(-(free ? 5 : 3)).map((m) => ({ 楼层: m.floor, 角色: m.role === "user" ? "玩家" : m.name || "叙述", 内容: m.text.slice(-(free ? 2400 : 1800)) })) };
        const system = free ? ARC_JUDGE_SYSTEM().replace("只能选择当前编号，或当前编号之后最多2个编号；不得回退。", "可以选择任何一个节点，包括之前的节点；证据不足时回答当前编号。") : ARC_JUDGE_SYSTEM();
        return { system, payload, parse: arcReadJudge, meta: { free }, success: free ? "大纲位置已重新定位" : "大纲进度已判定" };
      }, (s, v, snap, meta) => {
        if (meta.free) {
          const o = s.arc.outline, target = Math.min(Math.max(1, v.position), o.beats.length);
          if (target - 1 !== o.cursor) {
            o.history.push({ from: o.cursor, to: target - 1, floor: snap.floor, sig: "", quote: text(v.quote, 200), by: "manual", at: Date.now() });
            o.cursor = target - 1;
          }
          o.judge = { key: snap.narrativeKey, position: o.cursor + 1, verdict: "重新定位到第" + (o.cursor + 1) + "节点", at: Date.now(), note: text(v.reason, 120) };
          o.updatedAt = Date.now();
          return { advanced: false, verdict: o.judge.verdict };
        }
        return arcApplyJudge(s.arc, v, snap);
      }, { ...arcOpts, sigOf: (x) => JSON.stringify([x.arc.outline.beats.length, x.arc.outline.cursor]), ...options });
    },
    arcLines(options = {}) {
      return this.perform("planner", (s, snap) => {
        const arc = s.arc, active = arcActiveLines(arc).filter((l) => !l.pin), pinned = arc.lines.items.filter((l) => l.pin && !arcTerminal(l));
        const payload = { ...arcBrief(s, snap, { messages: 4, chars: 2200 }), 可推演线: active.map((l) => ({ 名称: l.name, 阶段: l.stage, 时间锚点: l.anchor, agency: l.agency, stall: l.stall, 现状: l.desc, 下一步: l.next })), 锁定线_只读: pinned.map((l) => ({ 名称: l.name, 现状: arcClip(l.desc, 100), 下一步: arcClip(l.next, 80) })), 大纲: arcOutlinePair(arc), 说明: active.length ? "自然推进：逐条以原名返回可推演线，可按证据新建。" : "首次生成：按证据给出 3–6 条当前真正活跃的事件线，不必凑数。" };
        return { system: ARC_LINES_SYSTEM(arc.lines.direction), payload, parse: arcReadLines, meta: {}, success: "事件线（线）已推进" };
      }, (s, v, snap) => {
        arcApplyLines(s.arc, v, snap);
        return v;
      }, { ...arcOpts, sigOf: (x) => x.arc.lines.items.map((l) => l.id).join("|"), ...options });
    },
    arcPoints(options = {}) {
      return this.perform("planner", (s, snap) => {
        const arc = s.arc, P = arc.points, pins = arcAllEvents(arc).filter((e2) => e2.pin && !e2.done).map((e2) => ({ 标题: e2.title, 日期: e2.date, 时间: e2.time }));
        const payload = { ...arcBrief(s, snap, { messages: 4, chars: 2e3 }), 大纲: arcOutlinePair(arc), 活跃事件线: arcActiveLines(arc).slice(0, 8).map((l) => ({ 名称: l.name, 现状: arcClip(l.desc, 100), 下一步: arcClip(l.next, 80) })), 上一版未发生的日程: arcAllEvents(arc).filter((e2) => !e2.done && !e2.pin).slice(0, 10).map((e2) => ({ 标题: e2.title, 日期: e2.date, 时间: e2.time })), 已发生或已过去: P.past.slice(-8).map((e2) => e2.title), 已锁定事件_必须逐字保留: pins };
        return { system: ARC_POINTS_SYSTEM(), payload, parse: arcReadPoints, meta: {}, success: "近期日程（点）已更新" };
      }, (s, v, snap) => {
        arcApplyPoints(s.arc, v, storyFor(s, snap));
        return v;
      }, { ...arcOpts, sigOf: (x) => x.arc.points.anchor + "|" + x.arc.points.days.length, ...options });
    }
  });
  var ArcAuto = class {
    constructor(engine) {
      this.eng = engine;
      this.events = new Emitter();
      this.timer = null;
      this.tick = null;
      this.retry = null;
      this.pending = false;
      this.running = false;
      this.again = false;
      this.stopped = false;
      this.status = { phase: "idle", step: "", note: "" };
    }
    on(fn) {
      return this.events.on(fn);
    }
    publish(status = {}) {
      this.status = { ...this.status, ...status };
      this.events.emit(this.status);
      this.eng.emit("status");
    }
    start() {
      this.stopped = false;
      clearInterval(this.tick);
      this.tick = setInterval(() => this.maintain(), 15e3);
      setTimeout(() => this.maintain(), 1500);
    }
    stop() {
      this.stopped = true;
      clearInterval(this.tick);
      clearTimeout(this.timer);
      clearTimeout(this.retry);
      this.events.clear();
    }
    reset() {
      this.pending = false;
      clearTimeout(this.timer);
      clearTimeout(this.retry);
    }
    userStop() {
      if (!this.running) return;
      this.userStopped = true;
      this.pending = false;
      this.again = false;
      clearTimeout(this.retry);
    }
    poke(reason) {
      if (this.stopped) return;
      this.pending = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.run({ reason }), reason === "end" ? 1200 : 2600);
    }
    retryLater(ms) {
      clearTimeout(this.retry);
      this.retry = setTimeout(() => {
        if (this.pending || this.again) this.run({ reason: "retry" });
      }, ms);
    }
    usable() {
      const eng = this.eng;
      return !this.stopped && !eng.disposed && eng.state === "ready" && !!eng.repo.data && !!eng.repo.snapshot && !centerNeedsReconcile(eng.repo.data, eng.repo.snapshot);
    }
    async maintain() {
      if (!this.usable() || this.eng.bridge.isBusy()) return;
      try {
        await this.localMaintenance();
      } catch {
      }
      if (this.pending && !this.running) this.run({ reason: "maintain" });
    }
    async localMaintenance() {
      const eng = this.eng, s = eng.repo.data;
      if (!s) return false;
      let snap;
      try {
        snap = eng.bridge.capture();
      } catch {
        return false;
      }
      const probe = clone(s), rb = arcRollbackOutline(probe.arc, snap), ro = centerPlannerApply(probe, snap, "arcPoints", eng.settings, d => arcRollover(d.arc, storyFor(d, snap).date), []);
      if (!rb && !ro.changed) return false;
      await eng.repo.mutate((d, cur) => {
        arcRollbackOutline(d.arc, cur);
        centerPlannerApply(d, cur, "arcPoints", eng.settings, phone => arcRollover(phone.arc, storyFor(phone, cur).date), []);
      }, { label: "剧情规划本地推进（日期/回退）" });
      return true;
    }
    async run(opts = {}) {
      if (this.stopped) return;
      if (this.running) {
        this.again = true;
        return;
      }
      const eng = this.eng;
      if (!this.usable()) return;
      const arc0 = eng.repo.data.arc;
      if (!opts.force && (!arc0.auto.enabled || arc0.auto.mode === "off")) {
        this.pending = false;
        return;
      }
      if (!eng.settings.isEnabled("planner")) {
        this.pending = false;
        this.publish({ note: "「剧情规划」模块已关闭，自动推进已暂停" });
        return;
      }
      if (eng.bridge.isBusy() || eng.runner.active) {
        this.retryLater(eng.bridge.isBusy() ? 4e3 : 6e3);
        return;
      }
      let snap;
      try {
        snap = eng.bridge.capture();
      } catch {
        return;
      }
      if (!opts.force && arc0.auto.last.key === snap.narrativeKey) {
        this.pending = false;
        return;
      }
      const everyN = arc0.auto.everyReplies || 1;
      if (!opts.force && everyN > 1 && arc0.auto.last.floor >= 0) {
        const chat = eng.bridge.context()?.chat || [];
        let n = 0;
        if (snap.floor < arc0.auto.last.floor) n = everyN;
        else for (let i = arc0.auto.last.floor + 1; i <= snap.floor; i++) { const m = chat[i]; if (m && !m.is_user && !m.is_system) n++; }
        if (n < everyN) {
          this.pending = false;
          try { await this.localMaintenance(); } catch {}
          this.publish({ note: "每 " + everyN + " 次回复推进一次 · 还差 " + (everyN - n) + " 次" });
          return;
        }
      }
      if (snap.character?.name?.includes("臭小鬼") && snap.stat?.系统?.作品 !== "臭小鬼" || snap.stat?.系统?.作品 === "臭小鬼" && !snap.stat.系统.已选开场) return;
      if (!opts.force && Date.now() < arc0.auto.nextAt) {
        this.pending = false;
        return;
      }
      this.running = true;
      this.pending = false;
      this.again = false;
      this.publish({ phase: "running", step: "", note: "" });
      let outcome = null;
      try {
        outcome = await eng.gate.run(async (owns) => this.pipeline(snap, opts, owns));
        if (outcome?.skipped) this.pending = false;
      } catch (err) {
        if (opts.manual) throw err;
        this.publish({ note: redactError(err, eng.settings.secrets()) });
      } finally {
        this.running = false;
        this.publish({ phase: "idle", step: "" });
        if (this.again || this.pending) this.retryLater(1500);
      }
      return outcome;
    }
    async runNow({ mode = "full" } = {}) {
      const eng = this.eng;
      if (this.running) {
        this.abortAuto = true;
        eng.runner.cancel("手动操作优先", { backgroundOnly: true });
        for (let i = 0; i < 40 && this.running; i++) await sleep(150);
      }
      this.abortAuto = false;
      return this.run({ force: true, manual: true, mode });
    }
    async pipeline(snap0, opts, owns) {
      const eng = this.eng, actions = eng.actions, manual = !!opts.manual;
      await this.localMaintenance();
      const cfg = eng.repo.data.arc.auto, mode = opts.mode || cfg.mode, steps = [];
      const alive = () => !this.stopped && !this.abortAuto && !eng.disposed && eng.state === "ready" && (manual || owns()) && !centerNeedsReconcile(eng.repo.data, eng.repo.snapshot);
      const step = async (name, label, fn) => {
        if (["outline", "judge"].includes(name) && (centerDirector(eng.repo.data, eng.repo.snapshot, eng.settings) || centerData(eng.repo.data).receipts.some(r=>r.status==="conflict"&&r.ref.kind==="beat"))) { steps.push({step:name,ok:true,note:"剧情中心：现场导演/冲突核对让行"}); return {advanced:false}; }
        if (!alive() || !manual && eng.bridge.isBusy()) throw Object.assign(Error("让行"), { yielded: true });
        this.publish({ phase: "running", step: label });
        if (!manual) arcReserve(eng.win, cfg.maxHourly);
        try {
          const r = await fn({ background: !manual, externalGuard: alive });
          steps.push({ step: name, ok: true, note: typeof r?.verdict === "string" ? r.verdict : "" });
          return r;
        } catch (err) {
          steps.push({ step: name, ok: false, note: redactError(err, eng.settings.secrets()) });
          throw err;
        }
      };
      let failed = null, advanced = false;
      try {
        const cur = () => eng.repo.data.arc, full = mode === "full";
        if (!cur().outline.beats.length) {
          if (mode !== "light" || manual) await step("outline", "面 · 生成大纲", (o) => actions.arcOutline(o));
        } else {
          const r = await step("judge", "面 · 判定进度", (o) => actions.arcJudge(o));
          advanced = !!r?.advanced;
        }
        if (mode !== "light") {
          const a = cur(), story = storyFor(eng.repo.data, eng.repo.snapshot || snap0);
          const wantLines = !a.lines.items.length || full || advanced || a.auto.runs - a.auto.lastLinesRun >= a.auto.everyLines;
          if (wantLines) await step("lines", "线 · 推进事件线", (o) => actions.arcLines(o));
          const b = cur(), wantPoints = full || advanced || arcPointsNeed(b, story) || b.auto.runs - b.auto.lastPointsRun >= b.auto.everyPoints;
          if (wantPoints) await step("points", "点 · 更新日程", (o) => actions.arcPoints(o));
        }
      } catch (err) {
        failed = err;
      }
      const stoppedByUser = this.userStopped;
      this.userStopped = false;
      const yielded = !!failed && (failed.yielded || /已停止|手动操作优先|主线开始生成|后台停止|手机卸载|让行|已切换|已有任务进行中|已有生成进行中/.test(String(failed.message || "")));
      if (yielded && !manual && !stoppedByUser) {
        if (eng.bridge.owner() === snap0.owner) this.pending = true;
        return { yielded: true, steps };
      }
      if (!eng.disposed && eng.state === "ready") await eng.repo.mutate((d) => {
        const A = d.arc.auto, now = Date.now();
        A.last = { key: snap0.narrativeKey, floor: snap0.floor, at: now };
        A.runs += 1;
        A.lastRun = { at: now, ok: !failed, steps: steps.slice(-8), error: failed ? stoppedByUser ? "已由你停止" : redactError(failed, eng.settings.secrets()) : "" };
        if (failed && !stoppedByUser && !yielded) {
          A.failures = Math.min(8, A.failures + 1);
          A.nextAt = manual ? 0 : now + Math.min(18e5, 6e4 * 2 ** A.failures);
        } else if (!failed) {
          A.failures = 0;
          A.nextAt = 0;
        }
      }, { label: "剧情规划推进记录" }).catch(() => {
      });
      if (failed && manual) throw failed;
      return { ok: !failed, steps };
    }
  };
  function arcStatusLine(ui) {
    const a = ui.data.arc.auto, r = a.lastRun;
    if (!r.at) return "尚未运行";
    const t = new Date(r.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${t} · ${r.ok ? "成功" : "失败"}${r.steps.length ? " · " + r.steps.map((x) => ({ outline: "面·生成", judge: "面·判定", lines: "线", points: "点" })[x.step] + (x.ok ? "" : "✗")).join(" ") : ""}`;
  }

