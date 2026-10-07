  // src/ui/renderer.js
  var apps = [["studio", "剧情中心", "compass", "sand"], ["visual", "视觉档案", "image", "blue"], ["messages", "消息", "chat", "green"], ["feed", "朋友圈", "feed", "rose"], ["agenda", "日历", "calendar", "blue"], ["contacts", "通讯录", "people", ""], ["diary", "日记", "book", "sand"], ["notes", "备忘", "note", "rose"], ["memories", "记忆", "memory", ""], ["life", "生活清单", "coffee", "green"], ["places", "地点", "place", "blue"], ["album", "相册", "image", ""], ["book", "世界书", "book", "sand"], ["soul", "灵魂链接", "heart", "rose"], ["settings", "设置", "settings", ""]];
  var names2 = { home: "月夜来信", messages: "消息", chat: "对话", contacts: "通讯录", contact: "人物与过往", feed: "朋友的日常", planner: "剧情规划", diag: "存档与规划状态", plan: "方向详情", agenda: "日历与约定", memories: "共同的记忆", life: "慢慢生活", notes: "随手记", diary: "日记", bag: "随身物品", album: "相册", places: "生活地图", settings: "设置", api: "API方案与模块", apiEditor: "编辑API方案", automation: "后台与主动来信", ms: "记忆工作台", soul: "灵魂链接", soulChar: "灵魂链接 · 角色档案", book: "世界书工坊", backup: "备份与恢复", logs: "运行记录", outbox: "待发箱" };
  function arcPlanView(ui) { return centerView(ui); }
  var views = { studio: centerView, visual: visualView, visualRules: visualRulesView, messages: messagesView, chat: chatView, contacts: contactsView, contact: contactView, feed: feedView, planner: arcPlanView, diag: diagView, plan: planDetailView, agenda: agendaView, memories: memoryView, book: bookView, life: lifeView, notes: notesView, diary: diaryView, bag: bagView, album: albumView, places: placesView, settings: settingsView, api: apiView, apiEditor: apiEditorView, automation: automationView, ms: msView, soul: soulView, soulChar: soulCharView, backup: backupView, logs: logsView, outbox: outboxView };
  var PhoneUI = class {
    constructor(engine, { demo = false } = {}) {
      this.engine = engine;
      this.win = engine.win;
      this.doc = this.win.document;
      this.demo = demo;
      this.opened = demo;
      this.route = { view: "home", id: "" };
      this.history = [];
      this.localDrafts = /* @__PURE__ */ new Map();
      this.disposed = false;
      this.modalResolve = null;
      this.inputTimer = null;
      this.timer = null;
      this.composing = false;
      this.composerThread = "";
      this.lastOwner = "";
      this.lastContent = "";
      this.currentScroll = 0;
    }
    get data() {
      return this.engine.repo.data;
    }
    get snapshot() {
      return this.engine.repo.snapshot || { story: {}, present: [], stat: {}, character: {} };
    }
    mount() {
      this.root = this.doc.createElement("div");
      this.root.id = "tsukiyo-phone-root";
      if (this.demo) this.root.dataset.demo = "";
      (this.demo ? this.doc.getElementById("phone-demo-slot") || this.doc.body : this.doc.documentElement || this.doc.body).append(this.root);
      for (const [k, v] of [["text-shadow", "none"], ["position", "fixed"], ["z-index", "2147483000"], ["display", "block"], ["visibility", "visible"], ["opacity", "1"], ["transform", "none"], ["pointer-events", "auto"], ["margin", "0"]]) this.root.style.setProperty(k, v, "important");
      this.shadow = this.root.attachShadow({ mode: "open" });
      this.shadow.innerHTML = `<style>${style_default}</style><button class="launcher" id="launcher" aria-label="打开月夜来信">${icon("moon", 22)}<span>月夜来信</span><span id="launcher-count"></span></button><div class="window" role="region" aria-label="月夜来信小手机"><div class="screen"><div class="statusbar" id="drag-handle"><span class="time" id="status-time">--:--</span><span class="island"></span><span class="status-icons">${icon("wifi", 14)}${icon("battery", 16)}<button class="minimize" id="minimize" aria-label="收起手机">${icon("close", 13)}</button></span></div><div id="topbar" class="topbar"></div><div id="busy"></div><main id="main" class="main"></main><div id="composer-area"></div><nav class="dock" id="dock" aria-label="手机导航"></nav><div class="offnote" id="connection-note"></div><div class="home-indicator"></div></div><div class="notice-dock" id="notices"></div><div id="modals"></div></div>`;
      if (this.demo) this.shadow.getElementById("launcher").addEventListener("click", () => this.open());
      this.shadow.getElementById("minimize").addEventListener("click", () => this.close());
      this.shadow.addEventListener("click", (event) => {
        const target = event.target.closest?.("[data-action]");
        if (!target) return;
        event.preventDefault();
        if (Date.now() - (this.openedAt || 0) < 450) return;
        this.act(target.dataset.action, target.dataset.id || "", target);
      });
      this.shadow.addEventListener("submit", (event) => {
        const form = event.target.closest("form[data-form]");
        if (!form) return;
        event.preventDefault();
        const values = this.formValues(form);
        if (form.dataset.form === "modal") {
          this.finishModal(values);
          return;
        }
        this.perform(() => handleForm(this, form.dataset.form, values, form));
      });
      this.shadow.addEventListener("input", (event) => {
        if (event.target.dataset?.filter) {
          const q = event.target.value.trim().toLowerCase(), scope = event.target.closest(".modal") || this.shadow;
          for (const row of scope.querySelectorAll(".filter-row")) row.hidden = !!q && !String(row.dataset.text || "").toLowerCase().includes(q);
          return;
        }
        if (event.target.id === "phone-composer") {
          const t = this.data?.threads.find((t2) => t2.id === event.target.dataset.thread);
          if (!t) return;
          const value = event.target.value;
          this.localDrafts.set(this.snapshot.owner + "|" + t.id, value);
          clearTimeout(this.inputTimer);
          let snap;
          try {
            snap = this.engine.bridge.capture();
            if (snap.owner !== this.snapshot.owner) return;
          } catch {
            return;
          }
          this.inputTimer = setTimeout(() => {
            this.engine.repo.mutate((s) => {
              const row = s.threads.find((x) => x.id === t.id);
              if (row) row.draft = value;
            }, { snapshot: snap, label: "保存未发送草稿" }).catch(() => {
            });
          }, 800);
        }
      });
      // 【2.9.6】私信输入法保护（手机端「写着写着输入法被打断」的三条来源一起堵）：
      //  ① 组合中（拼音/候选字）不重绘输入框、不把 Enter 当发送 —— 见 renderComposer / watchComposition；
      //  ② 点「发送」「仅暂存」不再把焦点从输入框抢走：手机键盘不会闪一下又收起来，候选框也不会断；
      //  ③ 发送后输入框节点不换、光标留在原位，可以接着写下一句。
      this.shadow.addEventListener("keydown", (event) => {
        if (event.target.id !== "phone-composer" || event.key !== "Enter" || event.shiftKey) return;
        // 输入法确认候选字时（组合中）不发送：isComposing 是新标准，keyCode 229 兼容旧实现
        if (event.isComposing || event.keyCode === 229 || this.composing) return;
        // 【2.9.6】回车发送只在宽屏（电脑）生效；手机/平板上回车交给输入法换行，发送点右侧按钮
        // —— 手机键盘上的回车本来就常被输入法用来「上屏 / 换行」，不再让它承担发送职责。
        if (this.composerCompact()) return;
        event.preventDefault();
        this.act("send", event.target.dataset.thread);
      });
      this.shadow.addEventListener("pointerdown", (event) => {
        const hit = event.target.closest?.('[data-action="send"],[data-action="queue"]');
        if (!hit) return;
        // 阻止默认 = 不移动焦点：触屏上键盘/输入法保持在前台，桌面端也不会丢掉选区
        event.preventDefault();
      });
      this.shadow.addEventListener("change", (event) => {
        const node = event.target;
        if (node.dataset.route) this.perform(() => this.engine.settings.assign(node.dataset.route, node.value));
        if (node.dataset.config) this.perform(() => this.engine.settings.update({ [node.dataset.config]: node.value }));
      });
      this.keyHandler = (event) => {
        if (event.key !== "Escape" || !this.opened || this.doc.activeElement !== this.root) return;
        if (this.modalResolve) this.finishModal(null);
        else this.close();
      };
      this.win.addEventListener("keydown", this.keyHandler);
      this.off = this.engine.on((event) => {
        if (event.type === "notice") {
          this.notify(event.message, event.kind, event.target);
          return;
        }
        const owner = this.engine.bridge.owner();
        if (owner !== this.lastOwner) {
          this.lastOwner = owner;
          this.route = { view: "home", id: "" };
          this.history = [];
          this.localDrafts.clear();
          this.finishModal(null);
          this.lastContent = "";
        }
        this.render();
      });
      this.installDrag();
      this.alias = this.doc.createElement("button");
      this.alias.id = this.doc.getElementById("kusogaki-phone-launcher-root") ? "tsukiyo-phone-open-alias" : "kusogaki-phone-launcher-root";
      this.alias.hidden = true;
      this.alias.setAttribute("data-tsukiyo-owned", "true");
      this.alias.addEventListener("click", () => this.open());
      this.doc.body.append(this.alias);
      this.render();
      return this;
    }
    layoutStore() {
      try {
        return JSON.parse(this.win.localStorage.getItem("tsukiyo-phone:v1:layout") || "{}") || {};
      } catch {
        return {};
      }
    }
    saveLayout() {
      try {
        this.win.localStorage.setItem("tsukiyo-phone:v1:layout", JSON.stringify(this.layout));
      } catch {
      }
    }
    viewport() {
      const vv = this.win.visualViewport;
      return { x: Math.round(vv?.offsetLeft || 0), y: Math.round(vv?.offsetTop || 0), w: Math.round(vv?.width || this.win.innerWidth || 1024), h: Math.round(vv?.height || this.win.innerHeight || 768) };
    }
    pickMode(vp) {
      const coarse = !!this.win.matchMedia?.("(pointer: coarse)").matches;
      if (vp.w <= 560 || vp.h <= 480) return "phone";
      if (vp.w <= 900 || vp.h > vp.w && vp.w <= 1100 || coarse && vp.w <= 1100 && vp.h > vp.w * 0.9) return "tablet";
      return "wide";
    }
    launcherSize() {
      const btn = this.shadow.getElementById("launcher"), w = btn.offsetWidth, h = btn.offsetHeight;
      if (w > 0 && h > 0) this.lastLauncherSize = { w, h };
      return this.lastLauncherSize || { w: 52, h: 52 };
    }
    launcherPlace(mode, vp) {
      const { w, h } = this.launcherSize(), key = mode === "wide" ? "wide" : "compact", m = key === "wide" ? 10 : 8;
      const minX = vp.x + m, maxX = Math.max(minX, vp.x + vp.w - w - m), minY = vp.y + m, maxY = Math.max(minY, vp.y + vp.h - h - m), saved = this.layout[key];
      const f = (v) => Math.min(1, Math.max(0, Number(v)));
      let x, y;
      if (saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy)) {
        x = minX + f(saved.fx) * (maxX - minX);
        y = minY + f(saved.fy) * (maxY - minY);
      } else if (key === "compact") {
        x = maxX;
        y = minY + 0.7 * (maxY - minY);
      } else {
        x = vp.x + vp.w - w - 22;
        y = vp.y + vp.h - h - 20;
      }
      return { x: Math.round(Math.min(maxX, Math.max(minX, x))), y: Math.round(Math.min(maxY, Math.max(minY, y))), w, h, minX, maxX, minY, maxY, key };
    }
    windowPlace(vp) {
      const el = this.shadow.querySelector(".window"), r = el.getBoundingClientRect();
      const w = r.width || 398, h = r.height || Math.min(800, vp.h - 34), saved = this.layout.win;
      const maxX = Math.max(vp.x + 6, vp.x + vp.w - w - 6), maxY = Math.max(vp.y + 6, vp.y + vp.h - h - 6);
      let x = saved && Number.isFinite(saved.x) ? saved.x : vp.x + vp.w - w - 22, y = saved && Number.isFinite(saved.y) ? saved.y : vp.y + vp.h - h - 20;
      return { x: Math.round(Math.min(maxX, Math.max(vp.x + 6, x))), y: Math.round(Math.min(maxY, Math.max(vp.y + 6, y))) };
    }
    applyBox(box, vp) {
      const key = JSON.stringify([box, vp.h, this.origin]);
      if (key === this.boxKey) return;
      this.boxKey = key;
      const st = this.root.style, ox = this.origin.x, oy = this.origin.y;
      st.setProperty("--tp-x", box.x - ox + "px");
      st.setProperty("--tp-y", box.y - oy + "px");
      st.setProperty("--tp-w", box.w);
      st.setProperty("--tp-h", box.h);
      st.setProperty("--tp-vh", vp.h + "px");
      if (box.fw) {
        st.setProperty("--tp-fw", box.fw + "px");
        st.setProperty("--tp-fh", box.fh + "px");
      }
      if (this.verifying) return;
      this.verifying = true;
      try {
        const r = this.root.getBoundingClientRect(), dx = Math.round(r.left - box.x), dy = Math.round(r.top - box.y);
        if ((Math.abs(dx) > 1 || Math.abs(dy) > 1) && (r.width > 0 || r.height > 0)) {
          this.origin = { x: ox + dx, y: oy + dy };
          this.boxKey = "";
          this.applyBox(box, vp);
        }
      } finally {
        this.verifying = false;
      }
    }
    fit() {
      if (this.demo || !this.root) return;
      const vp = this.viewport(), mode = this.pickMode(vp), opened = this.opened;
      this.mode = mode;
      this.compact = mode !== "wide";
      const flag = (name, on) => {
        if (on !== this.root.hasAttribute(name)) on ? this.root.setAttribute(name, "") : this.root.removeAttribute(name);
      };
      flag("data-compact", this.compact);
      flag("data-open", opened);
      if (this.root.getAttribute("data-mode") !== mode) this.root.setAttribute("data-mode", mode);
      let box;
      if (!opened) {
        const p = this.launcherPlace(mode, vp);
        box = { x: p.x, y: p.y, w: "auto", h: "auto" };
      } else if (mode === "phone") box = { x: vp.x, y: vp.y, w: vp.w + "px", h: vp.h + "px" };
      else if (mode === "tablet") box = { x: vp.x, y: vp.y, w: vp.w + "px", h: vp.h + "px", fw: Math.min(460, vp.w - 24), fh: Math.min(vp.h - 24, 920) };
      else {
        const p = this.windowPlace(vp);
        box = { x: p.x, y: p.y, w: "auto", h: "auto" };
      }
      this.applyBox(box, vp);
    }
    installDrag() {
      if (this.demo) return;
      this.layout = this.layoutStore();
      this.origin = { x: 0, y: 0 };
      this.boxKey = "";
      this.cleanups = [];
      let raf = 0;
      this.fitHandler = () => {
        if (raf) return;
        raf = this.win.requestAnimationFrame(() => {
          raf = 0;
          this.fit();
        });
      };
      for (const [target, name] of [[this.win, "resize"], [this.win, "orientationchange"], [this.win.visualViewport, "resize"], [this.win.visualViewport, "scroll"]]) {
        if (!target) continue;
        target.addEventListener(name, this.fitHandler);
        this.cleanups.push(() => target.removeEventListener(name, this.fitHandler));
      }
      const launcher = this.shadow.getElementById("launcher");
      let press = null, lastDone = 0;
      launcher.addEventListener("pointerdown", (e2) => {
        if (e2.button != null && e2.button > 0) return;
        const p = this.launcherPlace(this.mode || "wide", this.viewport());
        press = { id: e2.pointerId, sx: e2.clientX, sy: e2.clientY, p, moved: false };
        try {
          launcher.setPointerCapture(e2.pointerId);
        } catch {
        }
      });
      launcher.addEventListener("pointermove", (e2) => {
        if (!press || e2.pointerId !== press.id) return;
        const dx = e2.clientX - press.sx, dy = e2.clientY - press.sy;
        if (!press.moved && Math.hypot(dx, dy) < 6) return;
        press.moved = true;
        launcher.classList.add("dragging");
        const p = press.p, x = Math.min(p.maxX, Math.max(p.minX, p.x + dx)), y = Math.min(p.maxY, Math.max(p.minY, p.y + dy));
        const span = (a, b) => b - a > 0 ? b - a : 1;
        this.layout[p.key] = { fx: (x - p.minX) / span(p.minX, p.maxX), fy: (y - p.minY) / span(p.minY, p.maxY) };
        this.fit();
        e2.preventDefault();
      });
      const release = (e2) => {
        if (!press || e2.pointerId !== press.id) return;
        const { moved, p } = press;
        press = null;
        launcher.classList.remove("dragging");
        try {
          launcher.releasePointerCapture(e2.pointerId);
        } catch {
        }
        lastDone = Date.now();
        if (moved) {
          if (p.key === "compact" && this.layout.compact) this.layout.compact.fx = this.layout.compact.fx < 0.5 ? 0 : 1;
          this.saveLayout();
          this.fit();
          return;
        }
        if (e2.type === "pointerup") this.open();
      };
      launcher.addEventListener("pointerup", release);
      launcher.addEventListener("pointercancel", release);
      launcher.addEventListener("click", () => {
        if (Date.now() - lastDone < 600) return;
        this.open();
      });
      const handle = this.shadow.getElementById("drag-handle");
      let drag = null;
      handle.addEventListener("pointerdown", (e2) => {
        if (e2.target.closest("button") || this.mode !== "wide" || !this.opened) return;
        const r = this.root.getBoundingClientRect();
        drag = { id: e2.pointerId, sx: e2.clientX, sy: e2.clientY, x0: r.left, y0: r.top };
        try {
          handle.setPointerCapture(e2.pointerId);
        } catch {
        }
      });
      handle.addEventListener("pointermove", (e2) => {
        if (!drag || e2.pointerId !== drag.id) return;
        this.layout.win = { x: drag.x0 + e2.clientX - drag.sx, y: drag.y0 + e2.clientY - drag.sy };
        this.fit();
      });
      const endDrag = (e2) => {
        if (drag && e2.pointerId === drag.id) {
          drag = null;
          this.saveLayout();
        }
      };
      handle.addEventListener("pointerup", endDrag);
      handle.addEventListener("pointercancel", endDrag);
      let scrimDown = false;
      this.root.addEventListener("pointerdown", (e2) => {
        scrimDown = this.mode === "tablet" && this.opened && e2.composedPath()[0] === this.root && Date.now() - (this.openedAt || 0) > 450;
      });
      this.root.addEventListener("click", (e2) => {
        if (scrimDown && e2.composedPath()[0] === this.root) this.close();
        scrimDown = false;
      });
      const screen = this.shadow.querySelector(".screen");
      let swipe = null;
      screen.addEventListener("pointerdown", (e2) => {
        if (e2.pointerType !== "touch" || this.route.view === "home" || this.modalResolve) return;
        if (e2.clientX - screen.getBoundingClientRect().left > 26) return;
        swipe = { id: e2.pointerId, x: e2.clientX, y: e2.clientY };
      });
      screen.addEventListener("pointermove", (e2) => {
        if (!swipe || e2.pointerId !== swipe.id) return;
        const dx = e2.clientX - swipe.x, dy = Math.abs(e2.clientY - swipe.y);
        if (dy > 60) swipe = null;
        else if (dx > 72) {
          swipe = null;
          this.back();
        }
      });
      for (const name of ["pointerup", "pointercancel"]) screen.addEventListener(name, () => {
        swipe = null;
      });
      const addMenu = () => {
        try {
          const menu = this.doc.getElementById("extensionsMenu");
          if (!menu || menu.querySelector("#tsukiyo_phone_menu")) return;
          const item = this.doc.createElement("div");
          item.id = "tsukiyo_phone_menu";
          item.className = "list-group-item flex-container flexGap5 interactable";
          item.tabIndex = 0;
          item.title = "打开月夜来信小手机";
          item.innerHTML = '<div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div><span>月夜来信 · 小手机</span>';
          const go = () => {
            this.open();
            try {
              menu.style.display = "none";
            } catch {
            }
          };
          item.addEventListener("click", go);
          item.addEventListener("keydown", (e2) => {
            if (e2.key === "Enter" || e2.key === " ") {
              e2.preventDefault();
              go();
            }
          });
          menu.append(item);
        } catch {
        }
      };
      addMenu();
      const guard = this.win.setInterval(() => {
        addMenu();
        if (!this.root.isConnected) (this.doc.documentElement || this.doc.body).append(this.root);
        this.fit();
      }, 3e3);
      this.cleanups.push(() => {
        this.win.clearInterval(guard);
        this.doc.getElementById("tsukiyo_phone_menu")?.remove();
      });
      this.fit();
    }
    open(view, id2) {
      this.opened = true;
      this.openedAt = Date.now();
      if (view) this.go(view, id2);
      else this.render();
      this.win.setTimeout(() => this.fit(), 80);
    }
    close() {
      this.opened = false;
      this.finishModal(null);
      this.render();
    }
    go(view, id2 = "", options = {}) {
      if (view === "planner") { view = "studio"; this.centerTab = "long"; }
      const main = this.shadow.getElementById("main");
      if (!options.replace && view !== this.route.view) this.history.push({ ...this.route, scroll: main.scrollTop });
      this.route = { view, id: id2, ...options };
      this.resetForm = true;
      this.lastContent = "";
      main.scrollTop = options.scroll || 0;
      this.render();
      if (view === "chat") this.markRead(id2);
    }
    back() {
      const route = this.history.pop() || { view: "home", id: "" };
      this.route = route;
      this.resetForm = true;
      this.lastContent = "";
      this.render();
      this.shadow.getElementById("main").scrollTop = route.scroll || 0;
    }
    draftFor(t) {
      return this.localDrafts.get(this.snapshot.owner + "|" + t.id) ?? t.draft ?? "";
    }
    setDraft(t, value) {
      this.localDrafts.set(this.snapshot.owner + "|" + t.id, value);
      const input = this.shadow.getElementById("phone-composer");
      if (!input) return;
      input.value = value;
      // 还在输入框里就把光标放到末尾；不在也不抢焦点（别把键盘拽起来）
      if (this.shadow.activeElement === input && !this.composing) {
        try {
          input.setSelectionRange(value.length, value.length);
        } catch {
        }
      }
    }
    async markRead(threadId) {
      if (!this.opened || this.engine.state !== "ready") return;
      const t = this.data?.threads.find((t2) => t2.id === threadId);
      if (!t?.messages.some((m) => m.role === "character" && !m.read)) return;
      await this.engine.mutate((s) => {
        const t2 = s.threads.find((t3) => t3.id === threadId);
        if (t2) for (const m of t2.messages) m.read = true;
      }, "玩家查看会话").catch(() => {
      });
    }
    title() {
      if (["studio","planner"].includes(this.route.view)) return "剧情中心";
      if (this.route.view === "visual") return "视觉档案";
      if (this.route.view === "visualRules") return "视觉规则资料库";
      if (this.route.view === "chat") return this.data?.threads.find((t) => t.id === this.route.id)?.title || "对话";
      if (this.route.view === "contact") return this.data?.contacts.find((c) => c.id === this.route.id)?.name || "人物";
      return names2[this.route.view] || "月夜来信";
    }
    render() {
      if (this.disposed) return;
      const root = this.shadow, window2 = root.querySelector(".window");
      window2.hidden = !this.opened;
      root.getElementById("launcher").hidden = this.opened;
      this.fit();
      window2.dataset.theme = this.engine.settings.data.theme;
      const count = this.data ? unreadCount(this.data) : 0;
      root.getElementById("launcher-count").innerHTML = count ? `<span class="badge">${count}</span>` : "";
      if (!this.opened) return;
      const s = this.data, world = s ? storyFor(s, this.snapshot) : {}, actualTime = world.time || (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      root.getElementById("status-time").textContent = actualTime;
      const top = root.getElementById("topbar");
      top.className = "topbar " + (this.route.view === "home" ? "home-topbar" : "");
      top.innerHTML = this.route.view === "home" ? `<div><div class="overline">LETTERS FROM EVERYDAY</div><h2 class="brand">月夜来信</h2></div><button class="icon-btn" data-action="go" data-id="automation" aria-label="后台设置">${icon("bell", 19)}</button>` : `<button class="icon-btn" data-action="back" aria-label="返回">${icon("back", 19)}</button><div class="heading"><h2>${e(this.title())}</h2><small>${this.route.view === "chat" ? "交流会延续到正文，不替你行动" : this.demo ? "离线演示 · 模拟模型返回" : e(world.place || "当前角色聊天")}</small></div><button class="icon-btn" data-action="go" data-id="home" aria-label="回到手机桌面">${icon("home", 18)}</button>`;
      const busy = this.engine.runner.active;
      root.getElementById("busy").innerHTML = busy ? `<div class="busybar"><i class="spin"></i><span>${e(MODULES[busy.module] || "接口")} · ${busy.background ? "后台任务" : "正在生成"}</span><button data-action="stop">停止</button></div>` : "";
      let html = "";
      const canConfigure = ["settings", "api", "apiEditor", "backup"].includes(this.route.view);
      if ((!s || this.engine.state !== "ready") && !canConfigure) html = `<div class="pad">${empty("等待当前聊天", "先打开角色聊天；正文生成时暂不改写存档。", "moon")}${hint(this.engine.error || "正在连接真实存档…")}${button("配置API与查看设置", "go", "settings", "wide")}${this.demo ? "" : button("重新检查连接", "refresh", "", "wide")}</div>`;
      else html = this.route.view === "home" ? this.homeView() : views[this.route.view]?.(this) || empty("页面暂不可用");
      const main = root.getElementById("main"), scroll = main.scrollTop, wasBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 100;
      const saved = this.resetForm ? null : this.captureForm(main);
      this.resetForm = false;
      if (html !== this.lastContent) {
        main.innerHTML = html;
        this.lastContent = html;
        this.restoreForm(main, saved);
        main.scrollTop = this.route.view === "chat" && wasBottom ? main.scrollHeight : scroll;
        this.loadMedia();
      }
      this.renderComposer(s);
      root.getElementById("dock").innerHTML = [["home", "home", "桌面"], ["messages", "chat", "消息"], ["planner", "compass", "规划"], ["settings", "settings", "设置"]].map(([v, i, label]) => `<button class="${this.route.view === v ? "selected" : ""}" data-action="go" data-id="${v}" aria-label="${label}">${icon(i, 20)}${v === "messages" && count ? `<span class="badge">${count}</span>` : ""}</button>`).join("");
      root.getElementById("connection-note").textContent = this.demo ? "离线演示 · 不调用真实模型" : this.engine.bridge.injectionReady ? "● 正文记忆接口已连接" + (s?.settings.inject ? "" : " · 当前注入已关闭") : "○ 正文注入尚未就绪 · 请检查酒馆接口";
      if (this.route.view === "chat" && this.opened) queueMicrotask(() => this.markRead(this.route.id));
    }
    /**
     * 【2.9.6】输入框只在「换会话」时重建：
     *  - 会话没变 → 只更新旁边的「N 条待发」条，连一个节点都不动（焦点、光标、输入法组合全保住）；
     *  - 草稿一律走 .value 写入，不再拼进 HTML（草稿里的 < & 不再被当标签吃掉）；
     *  - 外部改动（导入存档、切换聊天）在没聚焦、没组合时才对账一次。
     */
    renderComposer(s) {
      const area = this.shadow.getElementById("composer-area");
      if (!area) return;
      const t = this.route.view === "chat" && s && this.engine.state === "ready" ? s.threads.find((x) => x.id === this.route.id) : null;
      if (!t) {
        if (area.childElementCount) area.replaceChildren();
        this.composerThread = "";
        return;
      }
      let input = area.querySelector("#phone-composer");
      if (!input || input.dataset.thread !== t.id) {
        area.innerHTML = composerView(this);
        input = area.querySelector("#phone-composer");
        if (input) {
          input.value = this.draftFor(t);
          this.composerThread = t.id;
          this.watchComposition(input);
        }
      } else if (!this.composing && this.shadow.activeElement !== input) {
        const want = this.draftFor(t);
        if (input.value !== want) input.value = want;
      }
      if (input) input.title = this.composerCompact() ? "回车换行 · 点右侧 ➤ 发送" : "回车发送 · Shift+回车换行";
      const strip = area.querySelector('[data-slot="pending"]');
      if (strip) {
        const n = t.pending.length;
        const label = strip.querySelector('[data-slot="pending-text"]');
        if (label) label.textContent = n ? n + " 条待发 · 尚未交给模型" : "";
        strip.hidden = !n;
      }
    }
    /** 手机/平板布局（回车交给输入法换行）；demo 与未探测到布局时按电脑处理 */
    composerCompact() {
      return this.mode === "phone" || this.mode === "tablet";
    }
    /** 记录输入法组合状态：组合中不重绘输入框、不把 Enter 当发送 */
    watchComposition(input) {
      if (input.dataset.composeWatch) return;
      input.dataset.composeWatch = "1";
      input.addEventListener("compositionstart", () => {
        this.composing = true;
      });
      const done = () => {
        this.composing = false;
      };
      input.addEventListener("compositionend", done);
      input.addEventListener("blur", done);
    }
    /** 发完消息把光标还给输入框（只在它本来就拿着焦点时调用） */
    focusComposer() {
      const input = this.shadow.getElementById("phone-composer");
      if (!input || this.composing || this.disposed) return;
      if (this.shadow.activeElement !== input) input.focus();
      try {
        input.setSelectionRange(input.value.length, input.value.length);
      } catch {
      }
    }
    homeView() {
      const s = this.data, world = storyFor(s, this.snapshot), count = unreadCount(s), active = s.activePlan ? s.plans.find((p) => p.id === s.activePlan.id) : null, ht = arcHomeTitle(s, active);
      return `<div class="home-pad"><div class="hero">${landscape}<div class="hero-copy"><div class="hero-date">${e(world.date || "STORY DATE · 未设置")} · ${e(world.date ? dayLabel(world.date) : "等故事慢慢发生")}</div><h1>让日常，<br>慢慢发生。</h1><p>${e(world.place || "熟悉的人，各有自己的日子。")}</p></div><div class="hero-pill">${icon(world.weather?.includes("雨") ? "cloud" : "sun", 13)}${e(world.weather || "此刻的光")}</div></div><div class="welcome-row"><span class="avatar small user">${icon("moon", 18)}</span><div class="welcome-copy"><b>${count ? "有 " + count + " 条消息，等你慢慢读" : "此刻，给自己留一点空闲"}</b><span>${this.demo ? "演示模式 · 不代表真实剧情已发生" : "你不必先开口，角色也可以主动联系。"}</span></div><button class="bg-pill" data-action="go" data-id="automation"><i class="dot ${s.settings.auto.enabled ? "live" : ""}"></i>${s.settings.auto.enabled ? "后台开启" : "后台关闭"}</button></div><div class="apps">${apps.map(([v, name, i, color]) => `<button class="app" data-action="go" data-id="${v}"><span class="app-icon ${color}">${icon(i, 24)}</span><span>${name}</span>${v === "messages" && count ? `<span class="badge">${count}</span>` : ""}</button>`).join("")}</div><button class="home-bottom" style="width:100%;text-align:left" data-action="go" data-id="planner"><span class="icon-mini">${icon("spark", 18)}</span><div><b>${e(ht.title)}</b><small>${e(ht.copy)}</small></div>${icon("arrow", 14)}</button></div>`;
    }
    captureForm(container) {
      const form = container.querySelector("form");
      if (!form) return null;
      const active = this.shadow.activeElement;
      return { name: form.dataset.form, values: [...form.elements].filter((n) => n.name).map((n) => ({ name: n.name, type: n.type, value: n.value, checked: n.checked })), focus: form.contains(active) ? active.name : null };
    }
    restoreForm(container, state) {
      if (!state) return;
      const form = container.querySelector("form");
      if (form?.dataset.form !== state.name) return;
      for (const value of state.values) {
        const node = [...form.elements].find((n) => n.name === value.name && n.type === value.type);
        if (node) {
          node.value = value.value;
          if (["checkbox", "radio"].includes(node.type)) node.checked = value.checked;
        }
      }
      if (state.focus) [...form.elements].find((n) => n.name === state.focus)?.focus();
    }
    async loadMedia() {
      for (const img of this.shadow.querySelectorAll("img[data-media]")) {
        const mediaId = img.dataset.media;
        try {
          const media = await this.engine.media.get(mediaId);
          if (img.isConnected && img.dataset.media === mediaId) {
            if (media) { if (media.remote) img.referrerPolicy = "no-referrer"; img.src = media.data; }
            else img.alt = "图片在本机缺失";
          }
        } catch {
          if (img.isConnected) img.alt = "图片暂不可用";
        }
      }
    }
    notify(message, kind = "info", target = "") {
      if (this.disposed) return;
      if (!this.opened) {
        const count = this.data ? unreadCount(this.data) : 0;
        this.shadow.getElementById("launcher-count").innerHTML = count ? `<span class="badge">${count}</span>` : "";
        this.shadow.getElementById("launcher").title = message;
        return;
      }
      const node = this.shadow.getElementById("notices");
      node.innerHTML = `<div class="toast ${kind === "error" ? "error" : ""}">${icon(kind === "message" ? "mail" : "spark", 17)}<div class="toast-body">${e(message)}</div><button class="icon-btn" data-action="dismiss-toast" aria-label="关闭通知">${icon("close", 12)}</button></div>`;
      if (kind === "message" && target) node.querySelector(".toast-body").addEventListener("click", () => this.go("chat", target));
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        if (!this.disposed) node.replaceChildren();
      }, 5500);
    }
    async perform(fn) {
      try {
        await fn();
        this.render();
      } catch (e2) {
        this.notify(redactError(e2, this.engine.settings.secrets()), "error");
      }
    }
    act(action, id2 = "", target = null) {
      if ((action === "send" || action === "queue") && this.composing) {
        // 输入法还在拼字：这时候发送会把半截字发出去、也会打断候选框
        this.notify("输入法还在拼字：先选好字，再点发送。", "info");
        return;
      }
      if (action === "pick-all" || action === "pick-none" || action === "pick-present") {
        const want = action === "pick-present" ? new Set(String(id2).split(",")) : null;
        for (const box of this.shadow.getElementById("modals").querySelectorAll("input[type=checkbox][name=members]:not(:disabled)")) {
          if (box.closest(".filter-row")?.hidden) continue;
          box.checked = action === "pick-all" ? true : action === "pick-none" ? false : want.has(box.value);
        }
        return;
      }
      if (action === "modal-cancel") {
        this.finishModal(null);
        return;
      }
      if (action === "modal-choice") {
        const picker = this.shadow.getElementById("modals").querySelector("form[data-review-picker]");
        this.finishModal({ ...(picker ? this.formValues(picker) : {}), choice: id2 });
        return;
      }
      if (action === "dismiss-toast") {
        this.shadow.getElementById("notices").replaceChildren();
        return;
      }
      return this.perform(() => {
        const free = ["go", "back", "refresh", "stop", "theme", "edit-api", "duplicate-api", "delete-api", "test-api", "models-draft", "export-api", "import-api"];
        return handleAction(this, action, id2, target);
      });
    }
    formValues(form) {
      const fd = new this.win.FormData(form), values = Object.fromEntries(fd);
      values.members = fd.getAll("members");
      for (const input of form.querySelectorAll("input[data-kind=date][name]")) {
        const raw = String(values[input.name] || "").trim().replace(/[年月／/.．]/g, "-").replace(/日/g, "").replace(/\s+/g, "");
        const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        values[input.name] = m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : raw;
      }
      for (const input of form.querySelectorAll("input[data-kind=time][name]")) {
        const raw = String(values[input.name] || "").trim().replace(/[：时点]/g, ":").replace(/分/g, "").replace(/\s+/g, "");
        const m = raw.match(/^(\d{1,2}):?(\d{2})$/);
        values[input.name] = m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0") + ":" + m[2] : raw;
      }
      for (const input of form.querySelectorAll("input[type=checkbox][name]")) if (input.name !== "members") values[input.name] = input.checked;
      return values;
    }
    dialog(title, content, { submit = "保存", cancel = "取消", choices = null } = {}) {
      if (this.disposed || !this.root?.isConnected) return Promise.resolve(null);
      if (this.modalResolve) this.finishModal(null);
      const modal = this.shadow.getElementById("modals");
      modal.innerHTML = `<div class="modal-layer"><section class="modal" role="dialog" aria-modal="true" aria-label="${e(title)}"><h3>${e(title)}</h3>${choices ? `<div>${content}</div><div class="buttons">${choices.map(([value, label, kind]) => button(e(label), "modal-choice", value, kind || "")).join("")}</div>` : `<form data-form="modal">${content}<div class="buttons"><button class="btn" type="button" data-action="modal-cancel">${e(cancel)}</button><button class="btn primary" type="submit">${e(submit)}</button></div></form>`}</section></div>`;
      this.win.setTimeout(() => [...modal.querySelectorAll("input:not([type=hidden]),textarea,select,button")].find((el) => !el.closest(".pick-tools") && el.type !== "search")?.focus(), 20);
      return new Promise((resolve) => {
        this.modalResolve = resolve;
      });
    }
    confirm(title, copy, yes = "确认") {
      return this.dialog(title, `<p class="copy">${e(copy)}</p>`, { choices: [["cancel", "取消"], ["yes", yes, "primary"]] }).then((x) => x?.choice === "yes");
    }
    finishModal(value) {
      const resolve = this.modalResolve;
      this.modalResolve = null;
      this.shadow?.getElementById("modals")?.replaceChildren();
      resolve?.(value);
    }
    pickFile(accept, max = 64 * 1024 * 1024) {
      return new Promise((resolve) => {
        const input = this.doc.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.hidden = true;
        this.doc.body.append(input);
        input.onchange = () => {
          const file = input.files?.[0];
          input.remove();
          if (file && file.size > max) {
            this.notify("文件过大", "error");
            resolve(null);
          } else resolve(file || null);
        };
        input.oncancel = () => {
          input.remove();
          resolve(null);
        };
        input.click();
      });
    }
    dispose() {
      this.disposed = true;
      for (const fn of this.cleanups || []) try {
        fn();
      } catch {
      }
      clearTimeout(this.inputTimer);
      clearTimeout(this.timer);
      this.finishModal(null);
      this.off?.();
      this.win.removeEventListener("keydown", this.keyHandler);
      if (this.resize) this.win.removeEventListener("resize", this.resize);
      if (this.fitHandler) {
        this.win.removeEventListener("orientationchange", this.fitHandler);
        this.win.visualViewport?.removeEventListener("resize", this.fitHandler);
      }
      this.alias?.remove();
      this.root.remove();
    }
  };

