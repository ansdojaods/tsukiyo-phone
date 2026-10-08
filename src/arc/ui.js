  // src/arc/ui.js
  var arcWhen = (ts) => ts ? new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  function arcAutoCard(ui) {
    const s = ui.data, arc = s.arc, a = arc.auto, st = ui.engine.arc.status, running = st.phase === "running", on = a.enabled && a.mode !== "off";
    const open = ui.arcAutoOpen ?? (!arcHas(arc) || !!a.lastRun.error);
    const line = running ? "正在 · " + (st.step || "推进中…") : "上次 · " + arcStatusLine(ui);
    const head = `<button class="arc-auto-head" data-action="arc-auto-fold" aria-expanded="${open}"><span class="arc-auto-title">${running ? '<i class="spin"></i>' : icon("spark", 14)}<b>自动推进</b>${tag(on ? ARC_MODES[a.mode] : "已关闭", on ? "" : "rose")}</span><small>${e(line)}</small><span class="arc-fold ${open ? "open" : ""}">${icon("arrow", 12)}</span></button>`;
    if (!open) return `<div class="card arc-auto folded">${head}</div>`;
    return `<div class="card arc-auto">${head}${a.lastRun.error ? hint("上次失败：" + a.lastRun.error + "（可手动推进；下一次新回复也会自动重试）", true) : ""}${switchRow("正文更新后自动推进", "按设定的回复间隔：本地推进日历 → 判定大纲 → 更新事件线 → 补足日程", "arc-auto-toggle", on)}<div class="every-row"><span>每隔</span>${[1, 2, 3, 5, 8].map((n) => `<button class="chip ${(a.everyReplies || 1) === n ? "active" : ""}" data-action="arc-every" data-id="${n}">${n}</button>`).join("")}<button class="chip ${[1, 2, 3, 5, 8].includes(a.everyReplies || 1) ? "" : "active"}" data-action="arc-every" data-id="custom">${[1, 2, 3, 5, 8].includes(a.everyReplies || 1) ? "自定义" : a.everyReplies}</button><span>次回复自动推进一次</span></div><div class="segmented arc-modes">${["light", "standard", "full"].map((k) => `<button class="${a.mode === k ? "active" : ""}" data-action="arc-mode" data-id="${k}">${ARC_MODES[k]}</button>`).join("")}</div><p class="tiny muted" style="margin:-4px 0 10px">${{ light: "轻量：本地推进日历并判定大纲节点，不自动新建。", standard: "标准：缺什么补什么；节点推进、日期变化或每隔几楼再更新线与点。", full: "完整：每次新回复都更新三层（调用最多）。", off: "" }[a.mode]}</p><div class="buttons">${button(icon("spark", 14) + (arcHas(arc) ? " 立即推进三层" : " 一键生成点线面"), "arc-run", "", "primary")}${running ? button("停止", "stop", "", "danger") : ""}</div></div>`;
  }
  function arcBeatHtml(b, i, cursor) {
    const state = i < cursor ? "past" : i === cursor ? "current" : i === cursor + 1 ? "next" : "";
    return `<div class="arc-beat ${state}"><span class="arc-dot"></span><div class="arc-beat-body"><small>${e(b.time || "阶段 " + (i + 1))} · ${e(b.type)}${b.line ? " · " + e(b.line) : ""} ${state === "current" ? tag("当前") : state === "next" ? tag("下一站", "gold") : state === "past" ? tag("已过") : ""}</small><h3>${e(b.title)}</h3><p>${e(b.scene)}</p>${b.subtext ? `<p class="arc-sub">${e(b.subtext)}</p>` : ""}<details class="details"><summary>依据与操作</summary>${b.think ? `<p>${e(b.think)}</p>` : ""}${b.result ? `<p class="tiny muted">结果预期：${e(b.result)}</p>` : ""}<div class="buttons">${state !== "current" ? button("设为当前", "arc-beat-goto", String(i)) : ""}${button("编辑", "arc-beat-edit", String(i))}${button("删除", "arc-beat-del", String(i), "danger")}</div></details></div></div>`;
  }
  function arcPlaneView(ui) {
    const o = ui.data.arc.outline;
    if (!o.beats.length) return empty("还没有剧情大纲", "“面”是数周到数月的阶段走向；生成后会随正文自动判定推进。", "plane") + button(icon("spark", 15) + " 生成大纲", "arc-outline-gen", "", "primary wide") + button("三层一起生成", "arc-run", "", "wide");
    const n = o.beats.length;
    return `<div class="card arc-progress"><div class="row-top"><b>当前 ${o.cursor + 1} / ${n}</b><small>${e(o.judge.verdict || "")}${o.judge.at ? " · " + arcWhen(o.judge.at) : ""}</small></div><div class="arc-bar"><i style="width:${Math.round((o.cursor + 1) / n * 100)}%"></i></div>${o.judge.note ? `<p class="tiny muted">${e(o.judge.note)}</p>` : ""}</div>${tpDeleteBar("arc_beats", n, "大纲节点")}<div class="arc-timeline">${o.beats.map((b, i) => arcBeatHtml(b, i, o.cursor)).join("")}</div><div class="buttons">${button("重新生成大纲", "arc-outline-gen")}${button("让AI重新定位", "arc-relocate")}${button(icon("plus", 13) + " 添加节点", "arc-beat-add")}${button("清空大纲", "arc-outline-clear", "", "danger")}</div>${hint("面只判定“故事走到了哪一步”，不会替你演出下一步。推进必须引用正文原句，找不到依据就不推进。")}`;
  }
  function arcLineHtml(l) {
    const idx = ARC_STAGES.indexOf(l.stage);
    return `<article class="card arc-line ${l.pin ? "pinned" : ""} ${arcTerminal(l) ? "ended" : ""}"><div class="row-top"><span>${tag(l.stage, arcTerminal(l) ? "" : "gold")} ${tag(l.agency === "player" ? "等待玩家" : "自行推进")}${l.stall ? " " + tag("停滞", "rose") : ""}${l.pin ? " " + tag("已锁定") : ""}</span><small>${e(l.anchor || "")}</small></div><h3 style="margin-top:7px">${e(l.name)}</h3><p class="muted">${e(l.desc)}</p>${l.next ? `<p class="tiny" style="margin-top:5px"><b>${l.stall ? "恢复条件" : "下一步"}</b> ${e(l.next)}</p>` : ""}<div class="arc-stages" aria-hidden="true">${ARC_STAGES.map((st, i) => `<i class="${i <= idx ? "on" : ""}" title="${st}"></i>`).join("")}</div><div class="buttons">${button(l.pin ? "解除锁定" : "锁定", "arc-line-pin", l.id)}${button("编辑", "arc-line-edit", l.id)}${!arcTerminal(l) ? button("收束", "arc-line-end", l.id) : ""}${button("删除", "arc-line-del", l.id, "danger")}</div></article>`;
  }
  function arcLineView(ui) {
    const arc = ui.data.arc, act = arcActiveLines(arc), done = arc.lines.items.filter(arcTerminal);
    return `<div class="segmented arc-dirs">${Object.entries(ARC_DIRECTIONS).map(([k, label]) => `<button class="${arc.lines.direction === k ? "active" : ""}" data-action="arc-dir" data-id="${k}">${label}</button>`).join("")}</div>${hint("倾向只在同样有依据的走向之间调整优先级，不改写既有事实。")}<div class="buttons">${button(icon("spark", 14) + (act.length ? " 推进事件线" : " 生成事件线"), "arc-lines-run", "", "primary")}${button(icon("plus", 13) + " 新增一条线", "arc-line-add")}</div>${arc.lines.items.length ? tpDeleteBar("arc_lines", arc.lines.items.length, "事件线") : ""}${act.length ? act.map(arcLineHtml).join("") : empty("还没有事件线", "“线”是同时推进的关系线、事务线、势力线；世界不会因为玩家没参与就停滞。", "line")}${done.length ? `<details class="details"><summary>已收束 / 淡出（${done.length}）</summary>${done.map(arcLineHtml).join("")}</details>` : ""}`;
  }
  function arcEventHtml(ev, { archived = false } = {}) {
    const kind = ev.type === "hidden" ? "gold" : ev.type === "bond" ? "rose" : "";
    return `<div class="card arc-pt ${ev.done ? "done" : ""}"><div class="row-top"><span>${tag(ARC_TYPES[ev.type] || "明线", kind)}${ev.pin ? " " + tag("锁定") : ""}${ev.done ? " " + tag("已发生") : archived && ev.missed ? " " + tag("未记录") : ""}</span><small>${e([ev.date, ev.time, ev.place].filter(Boolean).join(" · "))}</small></div><h3 style="margin-top:6px">${e(ev.title)}</h3>${ev.desc ? `<p class="muted tiny">${e(ev.desc)}</p>` : ""}${ev.thread ? `<p class="tiny" style="margin-top:4px"><b>线头</b> ${e(ev.thread)}</p>` : ""}${archived ? "" : `<div class="buttons">${button(ev.done ? "撤销“已发生”" : "已发生", "arc-pt-done", ev.id)}${button(ev.pin ? "解除锁定" : "锁定", "arc-pt-pin", ev.id)}${ev.date ? button("加入日历", "arc-pt-agenda", ev.id) : ""}${button("编辑", "arc-pt-edit", ev.id)}${button("删除", "arc-pt-del", ev.id, "danger")}</div>`}</div>`;
  }
  function arcPointView(ui) {
    const s = ui.data, P = s.arc.points, world = storyFor(s, ui.snapshot);
    return `${hint(world.date ? `Day 1 = 剧情当前日期 ${world.date} ${dayLabel(world.date)}；剧情日期推进时会自动顺延，过去的事项收入“已过去”。` : "主线还没有提供剧情日期：日程只按“第几天”排列，无法随日期自动顺延；可在日历页设置备用剧情日期。", !world.date)}${P.stale ? hint("日期已推进，日程需要补足；开启自动推进后会在下一次回复后更新，也可以现在手动刷新。") : ""}<div class="buttons">${button(icon("spark", 14) + (P.days.length ? " 刷新日程" : " 生成日程"), "arc-points-run", "", "primary")}${button(icon("plus", 13) + " 手动添加", "arc-pt-add")}</div>${(P.days.reduce((n, x) => n + x.events.length, 0) + P.future.length + P.past.length) ? tpDeleteBar("arc_points", P.days.reduce((n, x) => n + x.events.length, 0) + P.future.length + P.past.length, "日程点") : ""}${P.days.length ? P.days.map((d) => `<div class="arc-day"><div class="arc-day-head"><b>Day ${d.n}</b><span>${e(d.date ? d.date + " " + dayLabel(d.date) : "第 " + d.n + " 天")}</span>${d.weather ? `<i>${icon(/雨|雪|雾|阴/.test(d.weather) ? "cloud" : "sun", 13)} ${e(d.weather)}${d.temp ? " " + e(d.temp) : ""}</i>` : ""}</div>${d.events.length ? d.events.map((ev) => arcEventHtml(ev)).join("") : `<p class="tiny muted arc-day-empty">这一天还很宽敞。</p>`}</div>`).join("") : empty("还没有日程", "“点”是未来三天的具体安排与更远的候选事件。", "point")}${P.future.length ? section("更远的可能", P.future.map((ev) => arcEventHtml(ev)).join("")) : ""}${P.past.length ? `<details class="details"><summary>已过去 / 已发生（${P.past.length}）</summary>${[...P.past].reverse().slice(0, 30).map((ev) => arcEventHtml(ev, { archived: true })).join("")}</details>` : ""}`;
  }
  function arcPlanViewOriginal(ui) {
    const s = ui.data, arc = s.arc, tab = ui.arcTab || "plane";
    const body = tab === "line" ? arcLineView(ui) : tab === "point" ? arcPointView(ui) : arcPlaneView(ui);
    const inj = arc.auto.inject;
    return `<div class="pad arc"><div class="eyebrow">STORY PLANNER · 面 · 线 · 点</div><h2 class="arc-title">剧情规划</h2><p class="muted tiny" style="margin-bottom:12px">面定方向，线织事件，点落日程。规划只是隐藏参考，故事仍由你亲自经历。</p>${arcAutoCard(ui)}<div class="segmented arc-tabs"><button class="${tab === "plane" ? "active" : ""}" data-action="arc-tab" data-id="plane">${icon("plane", 14)} 面 · 大纲</button><button class="${tab === "line" ? "active" : ""}" data-action="arc-tab" data-id="line">${icon("line", 14)} 线 · 事件</button><button class="${tab === "point" ? "active" : ""}" data-action="arc-tab" data-id="point">${icon("point", 14)} 点 · 日程</button></div>${body}<div class="card arc-inject"><b>写入正文的隐藏参考</b><p class="tiny muted">关闭“正文记忆联动”时以下全部不注入。</p><div class="chips">${[["outline", "面"], ["lines", "线"], ["points", "点"]].map(([k, label]) => `<button class="chip ${inj[k] ? "active" : ""}" data-action="arc-inject" data-id="${k}">${label} ${inj[k] ? "已注入" : "不注入"}</button>`).join("")}</div></div></div>`;
  }
  function arcHomeTitle(s, active) {
    const sum = arcSummary(s);
    if (sum.beat) return { title: sum.beat.title, copy: `剧情规划 · 第 ${sum.index + 1}/${sum.total} 节点 · ${sum.lines} 条事件线 · 今日 ${sum.today} 个安排` };
    return active ? { title: active.title, copy: "当前方向已接入正文；等待你亲自经历。" } : { title: "下一页，还可以有新的故事。", copy: "面·线·点会随正文自动推进；点此查看或生成剧情规划。" };
  }
  function arcDayEvents(s, date) {
    return s.arc.points.days.filter((d) => d.date === date).flatMap((d) => d.events).filter((ev) => !ev.done);
  }
  function arcCalendarHtml(s, date) {
    const rows = arcDayEvents(s, date);
    return rows.length ? section("剧情规划 · 点（非正式约定）", rows.map((ev) => `<button class="card" style="display:block;width:100%;text-align:left" data-action="arc-open-points">${tag(ARC_TYPES[ev.type] || "明线", ev.type === "hidden" ? "gold" : ev.type === "bond" ? "rose" : "")}<small style="margin-left:6px">${e(ev.time || "时间未定")}${ev.place ? " · " + e(ev.place) : ""}</small><h3 style="margin-top:6px">${e(ev.title)}</h3><p class="muted tiny">${e(ev.desc)}</p></button>`).join("")) : "";
  }
  async function arcBeatDialog(ui, beat) {
    const r = await ui.dialog(beat ? "编辑大纲节点" : "添加大纲节点", field("推演时间（宏观，如：数周内）", "time", beat?.time || "", { max: 40 }) + field("标题", "title", beat?.title || "", { required: true, max: 40 }) + select("类型", "type", [["主线", "主线"], ["支线", "支线"], ["关系", "关系"], ["日常", "日常"], ["转折", "转折"]], beat?.type || "主线") + field("所属故事线", "line", beat?.line || "", { max: 40 }) + field("这一阶段发生什么", "scene", beat?.scene || "", { textarea: true, required: true, max: 500 }) + field("题记（可选）", "subtext", beat?.subtext || "", { max: 160 }) + field("成立原因（可选）", "think", beat?.think || "", { textarea: true, max: 260 }));
    return r ? cleanBeat({ ...beat, ...r, id: beat?.id }) : null;
  }
  async function arcLineDialog(ui, line) {
    const r = await ui.dialog(line ? "编辑事件线" : "新增事件线", field("名称", "name", line?.name || "", { required: true, max: 40 }) + select("阶段", "stage", ARC_STAGES.map((x) => [x, x]), line?.stage || "起线") + field("时间锚点", "anchor", line?.anchor || "", { max: 40 }) + select("谁在推动", "agency", [["world", "自行推进（世界/他人）"], ["player", "等待玩家选择或行动"]], line?.agency || "world") + checkbox("目前停滞（缺少条件）", "stall", !!line?.stall) + field("当前状态", "desc", line?.desc || "", { textarea: true, required: true, max: 400 }) + field("下一步 / 恢复条件", "next", line?.next || "", { textarea: true, max: 300 }));
    return r ? cleanLine({ ...line, ...r, stall: r.stall === true, id: line?.id }) : null;
  }
  async function arcEventDialog(ui, ev, dayIndex) {
    const s = ui.data, days = s.arc.points.days;
    const where = [["future", "更远的可能"], ...[0, 1, 2].map((i) => ["d" + i, "Day " + (i + 1) + (days[i]?.date ? " · " + days[i].date : "")])];
    const r = await ui.dialog(ev ? "编辑日程事件" : "添加日程事件", select("放在", "where", where, dayIndex >= 0 ? "d" + dayIndex : "future") + select("类别", "type", Object.entries(ARC_TYPES), ev?.type || "main") + field("标题", "title", ev?.title || "", { required: true, max: 80 }) + field("时间", "time", ev?.time || "", { max: 40 }) + field("地点", "place", ev?.place || "", { max: 80 }) + field("具体推进", "desc", ev?.desc || "", { textarea: true, max: 500 }) + field("线头动态（同一时段其他人的动作，可空）", "thread", ev?.thread || "", { textarea: true, max: 400 }));
    return r;
  }
  function arcFindEvent(arc, evId) {
    for (const d of arc.points.days) {
      const i2 = d.events.findIndex((x) => x.id === evId);
      if (i2 >= 0) return { list: d.events, i: i2, ev: d.events[i2], day: d };
    }
    const i = arc.points.future.findIndex((x) => x.id === evId);
    return i >= 0 ? { list: arc.points.future, i, ev: arc.points.future[i], day: null } : null;
  }
  async function handleArcAction(ui, action, value) {
    const engine = ui.engine, arcOf = (s) => s.arc;
    const rerender = () => {
      ui.lastContent = "";
      ui.render();
    };
    switch (action) {
      case "arc-tab":
        ui.arcTab = value;
        rerender();
        return;
      case "arc-auto-fold": {
        const a = ui.data.arc, cur = ui.arcAutoOpen ?? (!arcHas(a) || !!a.auto.lastRun.error);
        ui.arcAutoOpen = !cur;
        rerender();
        return;
      }
      case "arc-open-points":
        ui.arcTab = "point";
        ui.go("planner");
        return;
      case "arc-auto-toggle": {
        let on = false;
        await change(ui, (s) => {
          const a = arcOf(s).auto;
          a.enabled = !(a.enabled && a.mode !== "off");
          if (a.enabled && a.mode === "off") a.mode = "standard";
          on = a.enabled;
          log(s, "info", on ? "已开启剧情规划自动推进" : "已关闭剧情规划自动推进", "planner");
        }, "切换剧情规划自动推进");
        if (on) engine.arc.poke("toggle");
        return;
      }
      case "arc-every": {
        let n = Number(value);
        if (value === "custom") {
          const r = await ui.dialog("自动推进间隔", field("每隔几次正文回复推进一次（1—20）", "n", String(ui.data.arc.auto.everyReplies || 1), { required: true, max: 2 }));
          if (!r) return;
          n = Number(r.n);
        }
        assert(Number.isInteger(n) && n >= 1 && n <= 20, "请输入 1—20 的整数");
        await change(ui, (s) => { arcOf(s).auto.everyReplies = n; arcOf(s).auto.enabled = true; }, "调整自动推进间隔");
        ui.notify(n === 1 ? "每次正文回复后都会自动推进。" : "每 " + n + " 次正文回复自动推进一次。");
        return;
      }
      case "arc-mode":
        assert(["light", "standard", "full"].includes(value), "未知强度");
        await change(ui, (s) => {
          arcOf(s).auto.mode = value;
          arcOf(s).auto.enabled = true;
        }, "调整自动推进强度");
        return;
      case "arc-run":
        ui.notify("开始推进面 · 线 · 点…");
        await engine.arc.runNow({ mode: "full" });
        ui.notify("面·线·点已推进。");
        return;
      case "arc-outline-gen":
        if (ui.data.arc.outline.beats.length && !await ui.confirm("重新生成大纲", "会按最新正文重新写一份大纲并把游标放到新的位置；旧大纲不保留。事件线与日程不受影响。", "重新生成")) return;
        await engine.actions.arcOutline();
        ui.arcTab = "plane";
        ui.notify("大纲已生成。");
        return;
      case "arc-relocate": {
        const r = await engine.actions.arcJudge({ free: true });
        ui.notify(r?.verdict || "已重新定位");
        return;
      }
      case "arc-lines-run":
        await engine.actions.arcLines();
        ui.notify("事件线已推进。");
        return;
      case "arc-points-run":
        await engine.actions.arcPoints();
        ui.notify("日程已更新。");
        return;
      case "arc-outline-clear":
        if (await ui.confirm("清空剧情大纲", "只清除“面”，事件线和日程保留。之后可重新生成。", "清空")) await change(ui, (s) => {
          arcOf(s).outline = freshArc().outline;
        }, "清空大纲");
        return;
      case "arc-beat-goto":
        await change(ui, (s) => {
          const o = arcOf(s).outline, i = Number(value);
          assert(o.beats[i], "节点不存在");
          if (i !== o.cursor) o.history.push({ from: o.cursor, to: i, floor: -1, sig: "", quote: "", by: "manual", at: Date.now() });
          o.cursor = i;
          o.judge = { key: "", position: i + 1, verdict: "手动设为第" + (i + 1) + "节点", at: Date.now(), note: "" };
          o.updatedAt = Date.now();
        }, "手动设置大纲位置");
        return;
      case "arc-beat-edit":
      case "arc-beat-add": {
        const o = ui.data.arc.outline, beat = action === "arc-beat-edit" ? o.beats[Number(value)] : null;
        assert(action === "arc-beat-add" || beat, "节点不存在");
        const next = await arcBeatDialog(ui, beat);
        assert(!next || next.title && next.scene, "标题和内容不能为空");
        if (next) await change(ui, (s) => {
          const ol = arcOf(s).outline;
          if (beat) {
            const i = ol.beats.findIndex((b) => b.id === beat.id);
            assert(i >= 0, "节点已变化");
            ol.beats[i] = { ...ol.beats[i], ...next, id: beat.id };
          } else {
            assert(ol.beats.length < ARC_LIMIT.beats, "节点已达上限");
            ol.beats.push({ ...next, id: id("beat") });
            ol.source = ol.source || "manual";
          }
          ol.updatedAt = Date.now();
        }, beat ? "编辑大纲节点" : "添加大纲节点");
        return;
      }
      case "arc-beat-del":
        if (await ui.confirm("删除这个节点", "删除后大纲游标会自动校正。", "删除")) await change(ui, (s) => {
          const ol = arcOf(s).outline, i = Number(value);
          assert(ol.beats[i], "节点不存在");
          ol.beats.splice(i, 1);
          ol.cursor = Math.min(ol.cursor > i ? ol.cursor - 1 : ol.cursor, Math.max(0, ol.beats.length - 1));
          ol.history = [];
          ol.updatedAt = Date.now();
        }, "删除大纲节点");
        return;
      case "arc-dir":
        assert(ARC_DIRECTIONS[value], "未知倾向");
        await change(ui, (s) => {
          arcOf(s).lines.direction = value;
        }, "调整剧情倾向");
        return;
      case "arc-line-pin":
        await change(ui, (s) => {
          const l = arcOf(s).lines.items.find((x) => x.id === value);
          assert(l, "事件线不存在");
          l.pin = !l.pin;
        }, "锁定/解锁事件线");
        return;
      case "arc-line-end":
        await change(ui, (s) => {
          const l = arcOf(s).lines.items.find((x) => x.id === value);
          assert(l, "事件线不存在");
          l.stage = "收束";
          l.terminal = true;
          l.pin = false;
        }, "收束事件线");
        return;
      case "arc-line-del":
        if (await ui.confirm("删除事件线", "删除后 AI 可能在之后重新发现同一件事并新建。想让它安静下来请用“收束”。", "删除")) await change(ui, (s) => {
          arcOf(s).lines.items = arcOf(s).lines.items.filter((x) => x.id !== value);
        }, "删除事件线");
        return;
      case "arc-line-edit":
      case "arc-line-add": {
        const line = action === "arc-line-edit" ? ui.data.arc.lines.items.find((x) => x.id === value) : null;
        assert(action === "arc-line-add" || line, "事件线不存在");
        const next = await arcLineDialog(ui, line);
        if (next) await change(ui, (s) => {
          const L = arcOf(s).lines;
          if (line) {
            const i = L.items.findIndex((x) => x.id === line.id);
            assert(i >= 0, "事件线已变化");
            L.items[i] = { ...L.items[i], ...next, id: line.id, pin: L.items[i].pin };
          } else {
            assert(!L.items.some((x) => x.name === next.name), "已经有同名事件线");
            assert(L.items.length < ARC_LIMIT.lines, "事件线已达上限");
            L.items.push({ ...next, id: id("line"), born: -1, updated: -1, pin: true });
          }
          L.updatedAt = Date.now();
        }, line ? "编辑事件线" : "新增事件线");
        return;
      }
      case "arc-pt-done":
      case "arc-pt-pin":
        await change(ui, (s) => {
          const f = arcFindEvent(arcOf(s), value);
          assert(f, "事件不存在");
          if (action === "arc-pt-done") f.ev.done = !f.ev.done;
          else f.ev.pin = !f.ev.pin;
        }, action === "arc-pt-done" ? "标记日程已发生" : "锁定日程");
        return;
      case "arc-pt-del":
        await change(ui, (s) => {
          const f = arcFindEvent(arcOf(s), value);
          assert(f, "事件不存在");
          f.list.splice(f.i, 1);
        }, "删除日程事件");
        return;
      case "arc-pt-agenda": {
        const f = arcFindEvent(ui.data.arc, value);
        assert(f && f.ev.date, "这个事件没有具体日期");
        const ev = f.ev;
        await change(ui, (s) => limitAppend(s.agenda, { id: id("agenda"), title: text(ev.title, 160), date: ev.date, time: text(ev.time, 20), note: text([ev.place ? "地点：" + ev.place : "", ev.desc].filter(Boolean).join(" · "), 600), members: [], status: "proposed", source: "剧情规划" }, 300, "日程"), "把剧情日程加入日历");
        ui.notify("已加入日历，状态为“待商量”，不代表已经约好。");
        return;
      }
      case "arc-pt-edit":
      case "arc-pt-add": {
        const arc = ui.data.arc, f = action === "arc-pt-edit" ? arcFindEvent(arc, value) : null;
        assert(action === "arc-pt-add" || f, "事件不存在");
        const r = await arcEventDialog(ui, f?.ev, f?.day ? f.day.n - 1 : -1);
        if (!r) return;
        assert(text(r.title, 80), "标题不能为空");
        await change(ui, (s) => {
          const P = arcOf(s).points;
          let ev = null;
          if (f) {
            const g = arcFindEvent(arcOf(s), f.ev.id);
            assert(g, "事件已变化");
            g.list.splice(g.i, 1);
            ev = g.ev;
          }
          const dayIdx = r.where.startsWith("d") ? Number(r.where.slice(1)) : -1, day = dayIdx >= 0 ? P.days[dayIdx] : null;
          if (dayIdx >= 0) assert(day, "这一天还没有生成日程，请先“生成日程”，或选择“更远的可能”");
          const merged = cleanEvent({ ...ev || {}, id: ev?.id, type: r.type, title: r.title, time: r.time, place: r.place, desc: r.desc, thread: r.thread, pin: ev ? ev.pin : true, done: ev?.done, date: day ? day.date : "" });
          assert(merged, "标题不能为空");
          const list = day ? day.events : P.future;
          assert(list.length < (day ? ARC_LIMIT.perDay : ARC_LIMIT.future), day ? "这一天的事件已满" : "更远的可能已满");
          list.push(merged);
          P.updatedAt = Date.now();
        }, f ? "编辑日程事件" : "添加日程事件");
        return;
      }
      case "arc-inject":
        assert(["outline", "lines", "points"].includes(value), "未知项目");
        await change(ui, (s) => {
          arcOf(s).auto.inject[value] = !arcOf(s).auto.inject[value];
        }, "切换规划注入");
        return;
      case "diag-flush":
        await engine.repo.flushMirror();
        ui.notify("已把当前手机存档写入聊天级备份与本机备份。");
        return;
      case "diag-heal":
        await engine.repo.mutate(() => {
        }, { label: "手动把手机存档接回当前楼层" });
        ui.notify("已把手机存档写入当前楼层。");
        return;
      case "diag-reset-arc":
        if (await ui.confirm("清空剧情规划", "面、线、点全部清空（不影响消息、日历约定、记忆）。", "清空")) await change(ui, (s) => {
          const keep = arcOf(s).auto;
          s.arc = freshArc();
          s.arc.auto = keep;
        }, "清空剧情规划");
        return;
    }
    throw Error("未知的剧情规划操作：" + action);
  }
  function diagView(ui) {
    const s = ui.data, d = ui.engine.repo.diagnostics(), c = d.choice, srcName = { floor: "楼层变量", chat: "聊天级备份", mirror: "本机备份（IndexedDB）", seed: "全新（无存档）" }[c.source] || c.source;
    const arc = s?.arc;
    const row = (k, v) => `<div class="log-line"><b>${e(k)}</b><p>${e(v)}</p></div>`;
    return `<div class="pad">${hint("手机存档同时写在三处：当前楼层变量、聊天级备份、本机 IndexedDB。读取时取修订号最新的一份，编辑/隐藏/删除正文楼层都不会让它归零。")}<div class="card">${row("本次读取来源", srcName + (c.floor >= 0 ? "（第 " + c.floor + " 楼）" : ""))}${row("修订号", String(d.revision))}${row("当前楼层已写入", d.tailHasEnvelope ? "是" : "否（点下方按钮接回）")}${row("聊天级备份", d.chatStore ? "有" + (d.mirrorState.at ? " · " + arcWhen(d.mirrorState.at) : "") : "无")}${row("本机备份", d.mirror ? "有" : "无")}${d.lastRestore ? row("最近一次自动恢复", ({ chat: "聊天级备份", mirror: "本机备份" }[d.lastRestore.source] || d.lastRestore.source) + " · " + arcWhen(d.lastRestore.at)) : ""}${d.mirrorState.error ? row("备份错误", d.mirrorState.error) : ""}${d.warnings.length ? row("提示", d.warnings.join("；")) : ""}</div><div class="buttons">${button("立即备份到聊天与本机", "diag-flush", "", "primary")}${button("接回当前楼层", "diag-heal")}</div>${arc ? `<div class="card">${row("剧情规划", `面 ${arc.outline.beats.length} 节点 · 线 ${arcActiveLines(arc).length} 条 · 点 ${arc.points.days.reduce((n, x) => n + x.events.length, 0) + arc.points.future.length} 个`)}${row("自动推进", (arc.auto.enabled ? ARC_MODES[arc.auto.mode] : "已关闭") + " · 上次 " + arcStatusLine(ui))}${row("累计处理回复", String(arc.auto.runs) + " 次")}${arc.auto.lastRun.error ? row("最近错误", arc.auto.lastRun.error) : ""}</div><div class="buttons">${button("清空剧情规划", "diag-reset-arc", "", "danger")}</div>` : ""}</div>`;
  }

