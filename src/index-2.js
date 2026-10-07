  // src/index.js
  function attachCardSource(app, source, restart = null) {
    if (app.cardSources.has(source)) return;
    app.cardSources.add(source);
    const unregister = app.engine.bridge.registerSource(source);
    const entry = restart ? { source, restart } : null;
    if (entry) app.standby.add(entry);
    const onHide = () => {
      unregister();
      app.cardSources.delete(source);
      app.hideListeners.delete(source);
      if (entry) app.standby.delete(entry);
      if (app.native || app.disposed) return;
      if (app.home === source) {
        const carry = [...app.standby];
        app.dispose();
        const next = carry.shift();
        if (next) try {
          next.restart(carry);
        } catch (e2) {
          console.warn("[月夜来信] 手机实例迁移失败", e2?.message);
        }
      } else if (!app.cardSources.size) app.dispose();
    };
    source.addEventListener("pagehide", onHide, { once: true });
    app.hideListeners.set(source, () => source.removeEventListener("pagehide", onHide));
  }
  function planSnapshot(engine) {
    const s = engine.repo?.data;
    if (!s?.arc) return null;
    const arc = s.arc, o = arc.outline, cur = o.beats[o.cursor];
    const today = arc.points.days[0];
    return { 阶段: cur ? { 序号: o.cursor + 1, 总数: o.beats.length, 标题: cur.title, 时间: cur.time || "", 场景: cur.scene || "" } : null, 事件线: arcActiveLines(arc).slice(0, 6).map((l) => ({ 名称: l.name, 阶段: l.stage, 下一步: l.next || "" })), 今日日程: (today?.events || []).map((x) => ({ 时间: x.time || "", 事项: x.title || x.text || "", 完成: !!x.done })), 日期: today?.date || "" };
  }
  function mountPlanStrip(app, host) {
    const doc = host.document, engine = app.engine, ui = app.ui;
    let last = "";
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const draw = () => {
      if (app.disposed) return;
      try {
        const on = engine.settings.data.ui.planStrip !== false;
        const mes = [...doc.querySelectorAll('#chat .mes[is_user="false"]')].pop();
        const old = doc.getElementById("tsukiyo-plan-strip");
        const p = on ? planSnapshot(engine) : null;
        if (!p || !mes || !(p.阶段 || p.事件线.length || p.今日日程.length)) { old?.remove(); last = ""; return; }
        const html = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:13px">🧭 剧情规划</b>${p.阶段 ? `<span style="font-size:12px;opacity:.85">面 ${p.阶段.序号}/${p.阶段.总数} · ${esc(p.阶段.标题)}</span>` : ""}<span style="flex:1"></span><button data-tp="open" style="font-size:12px;padding:2px 8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">打开</button><button data-tp="run" style="font-size:12px;padding:2px 8px;border-radius:8px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">推进</button></div>${p.事件线.length ? `<div style="font-size:12px;margin-top:4px;opacity:.85">线 · ${p.事件线.slice(0, 3).map((l) => esc(l.名称) + "（" + esc(l.阶段) + "）").join("　")}</div>` : ""}${p.今日日程.length ? `<div style="font-size:12px;margin-top:3px;opacity:.85">点 · ${esc(p.日期)} ${p.今日日程.slice(0, 4).map((x) => (x.完成 ? "✓" : "○") + esc(x.时间 + " " + x.事项)).join("　")}</div>` : ""}`;
        if (old && old.parentElement?.closest(".mes") === mes && last === html) return;
        old?.remove();
        const box = doc.createElement("div");
        box.id = "tsukiyo-plan-strip";
        box.style.cssText = "margin:8px 0 2px;padding:7px 10px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.08);text-shadow:none;font-family:inherit";
        box.innerHTML = html;
        box.addEventListener("click", (ev) => {
          const b = ev.target.closest("[data-tp]");
          if (!b) return;
          if (b.dataset.tp === "open") ui.open("planner");
          else { ui.notify("开始推进面 · 线 · 点…"); engine.arc.runNow({ mode: "full" }).then(() => ui.notify("面·线·点已推进。")).catch((err) => ui.notify(err?.message || "推进失败", "error")); }
        });
        (mes.querySelector(".mes_text")?.parentElement || mes).append(box);
        last = html;
      } catch {
      }
    };
    const off = engine.on(() => host.setTimeout(draw, 50));
    const timer = host.setInterval(draw, 3e3);
    app.hideListeners.set("plan-strip", () => { off?.(); host.clearInterval(timer); doc.getElementById("tsukiyo-plan-strip")?.remove(); });
    app.plan = () => planSnapshot(engine);
    draw();
  }
  function start({ mode = "extension", source = window, carry = [] } = {}) {
    const host = rootWindow(source), key = mode === "demo" ? "__TSUKIYO_PHONE_DEMO__" : "__TSUKIYO_PHONE__";
    if (host[key] && !host[key].disposed) {
      const current = host[key];
      current.loadedVersions = [...new Set([...(current.loadedVersions || [current.version]), VERSION])];
      if (current.version !== VERSION) current.ui.notify("检测到不同手机版本同时加载，请停用旧脚本并刷新后再使用新功能", "error");
      if (mode === "extension") {
        current.native = true;
        current.engine.bridge.registerSource(source);
      }
      if (mode === "card") attachCardSource(current, source, (rest) => start({ mode: "card", source, carry: rest }));
      return current;
    }
    const bridge = mode === "demo" ? new DemoBridge(host) : new TavernBridge(host, source), engine = new PhoneEngine(bridge), ui = new PhoneUI(engine, { demo: mode === "demo" });
    const app = { version: VERSION, loadedVersions: [VERSION], engine, ui, native: mode === "extension", disposed: false, home: mode === "card" ? source : null, standby: /* @__PURE__ */ new Set(), cardSources: /* @__PURE__ */ new Set(), hideListeners: /* @__PURE__ */ new Map(), open: (view, id2) => ui.open(view, id2), close: () => ui.close(), dispose() {
      if (app.disposed) return;
      app.disposed = true;
      for (const off of app.hideListeners.values()) off();
      app.hideListeners.clear();
      app.cardSources.clear();
      ui.dispose();
      engine.dispose();
      if (host[key] === app) delete host[key];
    } };
    host[key] = app;
    try { if (mode !== "demo" && (!host.__JY5_PHONE__ || host.__JY5_PHONE__.__tsukiyo)) host.__JY5_PHONE__ = { __tsukiyo: true, open: () => ui.open(), close: () => ui.close() }; } catch {}
    ui.mount();
    if (mode !== "demo") mountPlanStrip(app, host);
    engine.init().catch((e2) => ui.notify(e2?.message || "手机初始化失败", "error"));
    if (mode === "card") {
      attachCardSource(app, source, (rest) => start({ mode: "card", source, carry: rest }));
      for (const c of carry) attachCardSource(app, c.source, c.restart);
    }
    const onHostHide = () => app.dispose();
    host.addEventListener("pagehide", onHostHide, { once: true });
    app.hideListeners.set(host, () => host.removeEventListener("pagehide", onHostHide));
    return app;
  }
  return __toCommonJS(index_exports);
})();

TsukiyoPhoneBundle.start({mode:'card',source:window});
