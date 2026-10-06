  // src/services/soullink-bridge.js — 外部 SoulLink 扩展桥（v2.6）+ PhoneEngine 组装类
  var SoulLinkBridge = class {
    constructor(engine) {
      this.eng = engine;
    }
    get settings() {
      return this.eng.settings;
    }
    prefs() {
      const ui = this.settings.data.ui || {};
      return { ...soulDefaults(), ...(isObject(ui.soullink) ? ui.soullink : {}) };
    }
    setPrefs(patch) {
      const next = clone(this.settings.data);
      next.ui = { ...next.ui, soullink: { ...this.prefs(), ...patch } };
      this.settings.persist(next);
      return this.prefs();
    }
    ctx() {
      return this.settings.cloud();
    }
    chatKeyGuess() {
      try {
        const parts = JSON.parse(this.eng.repo.snapshot?.owner || "[]");
        return String(parts?.[2] ?? "");
      } catch {
        return "";
      }
    }
    contactMatch(name) {
      const s = this.eng.repo.data;
      if (!s) return null;
      return s.contacts.find((c) => c.name === name || (c.aliases || []).includes(name)) || null;
    }
    /** 在 extensionSettings 里寻找 SoulLink 的档案盒（兼容不同键名与嵌套层级） */
    scan() {
      const out = { found: false, key: "", box: null, chatMap: null, archives: null, chatKey: "", count: 0, names: [], note: "" };
      const ctx = this.ctx();
      if (!ctx?.extensionSettings) {
        out.note = "没有检测到酒馆扩展设置（SoulLink 是酒馆扩展，需要先安装并启用）";
        return out;
      }
      const ext = ctx.extensionSettings;
      const isArchive = (v) => isObject(v) && (Array.isArray(v.记忆) || isObject(v.记忆) || isObject(v.性格) || isObject(v.世界观) || typeof v.姓名 === "string" || typeof v.name === "string");
      const isMap = (v) => isObject(v) && Object.values(v).some((x) => isObject(x));
      const looks = (v) => isObject(v) && (isMap(v.archives) || isMap(v.roster) || isMap(v.characters));
      let key = this.prefs().key;
      if (!key || !looks(ext[key])) {
        for (const k of Object.keys(ext)) if (/soullink|soul[-_ ]?link|灵魂/i.test(k) && looks(ext[k])) {
          key = k;
          break;
        }
      }
      if (!key) {
        for (const k of Object.keys(ext)) if (looks(ext[k])) {
          key = k;
          break;
        }
      }
      if (!key) {
        out.note = "没有找到 SoulLink 的档案数据（extensionSettings 里没有含 archives / roster 的扩展）";
        return out;
      }
      const box = ext[key];
      let archives = isObject(box.archives) ? box.archives : isObject(box.roster) ? box.roster : isObject(box.characters) ? box.characters : {};
      let chatMap = null, chatKey = "";
      const values = Object.values(archives);
      const flat = values.some(isArchive);
      if (!flat && values.length) {
        const cands = Object.entries(archives).filter(([, v]) => isMap(v));
        if (cands.length) {
          const want = this.chatKeyGuess();
          const hit = cands.find(([k]) => k === want) || cands.find(([, v]) => Object.keys(v).some((n) => this.contactMatch(n))) || cands.slice().sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)[0];
          chatKey = hit[0];
          chatMap = archives;
          archives = hit[1];
        }
      }
      out.found = true;
      out.key = key;
      out.box = box;
      out.chatMap = chatMap;
      out.chatKey = chatKey;
      out.archives = archives;
      out.names = Object.keys(archives);
      out.count = out.names.length;
      out.note = "已找到 SoulLink 档案：" + out.count + " 个角色" + (chatKey ? "（聊天 " + chatKey + "）" : "");
      return out;
    }
    /** 读取档案 → 手机联系人资料 / 记忆条目 */
    async pull() {
      const scan = this.scan();
      if (!scan.found) throw Error(scan.note || "没有找到 SoulLink 档案");
      const snap = this.eng.bridge.capture();
      let contacts = 0, memories = 0;
      await this.eng.repo.mutate((s) => {
        for (const [name, archive] of Object.entries(scan.archives)) {
          if (!isObject(archive) || ["__proto__", "prototype", "constructor"].includes(name)) continue;
          const body = SOULLINK_SECTIONS.map((sec) => {
            const raw = archive[sec];
            const list = Array.isArray(raw) ? raw : isObject(raw) ? Object.values(raw) : [];
            const lines = list.map((x) => typeof x === "string" ? x : x?.text || x?.content || "").filter(Boolean);
            return lines.length ? "【" + sec + "】\n" + lines.map((x) => "· " + String(x).slice(0, 1200)).join("\n") : "";
          }).filter(Boolean).join("\n\n");
          let c = this.contactMatch(name);
          if (!c && body) {
            assert(s.contacts.length < 300, "联系人已达上限（300）");
            c = {
              id: "slc-" + fingerprint([scan.key, name]).slice(0, 12), name: String(name).slice(0, 80), age: Number.isFinite(archive.年龄) ? archive.年龄 : null,
              tags: ["SoulLink"], status: "由 SoulLink 档案导入", bio: "", extraNotes: "", references: [], aliases: [],
              recognized: true, reachable: true, proactive: true, allowNarrative: false, color: "sage"
            };
            s.contacts.push(c);
            contacts++;
          }
          if (c && body) {
            const list = (c.references || []).slice(0);
            const item = { book: "SoulLink 档案", name: name + " · 档案", content: body.slice(0, 16e3) };
            const i = list.findIndex((r) => r.book === "SoulLink 档案" && r.name === item.name);
            if (i >= 0) list[i] = item;
            else if (list.length < 10) list.push(item);
            else list[9] = item;
            c.references = list;
            c.sl = { key: scan.key, chatKey: scan.chatKey, name };
          }
          const memRaw = archive.记忆;
          const memList = Array.isArray(memRaw) ? memRaw : isObject(memRaw) ? Object.values(memRaw) : [];
          for (const raw of memList) {
            const t = String(typeof raw === "string" ? raw : raw?.text || raw?.content || "").trim();
            if (!t || s.memories.length >= 1e3) continue;
            const mid = "sl-" + fingerprint([scan.key, name, t]).slice(0, 16);
            if (s.memories.some((m) => m.id === mid)) continue;
            s.memories.push({
              id: mid, kind: "manual", title: text(name + " · " + autoTitle(t), 80), text: t.slice(0, 6e3), keys: [name],
              enabled: true, audience: ["user"], visibility: "private", sources: [{ note: "来自 SoulLink 档案（" + scan.key + "）" }], resolved: false, ts: Date.now(), sl: true
            });
            memories++;
          }
        }
        log(s, "ok", "已从 SoulLink 导入：新增联系人 " + contacts + "、记忆 " + memories + " 条", "memory");
      }, { snapshot: snap, label: "导入 SoulLink 档案" });
      this.setPrefs({ found: scan.key, count: scan.count, lastAt: Date.now(), lastError: "" });
      return { contacts, memories, scan };
    }
    /** 收集要写回 SoulLink 的手机内容（每条一行，按角色归并） */
    pushLines() {
      const s = this.eng.repo.data;
      if (!s) return new Map();
      const contactOf = (id2) => s.contacts.find((c) => c.id === id2) || null;
      const grouped = new Map();
      const add = (name, line) => {
        if (!name) return;
        if (!grouped.has(name)) grouped.set(name, []);
        const list = grouped.get(name);
        if (!list.includes(line) && list.length < 60) list.push(line);
      };
      for (const t of s.threads) {
        const rows = t.messages.slice(-5);
        const targets = t.kind === "group" ? [...new Set(rows.map((m) => contactOf(m.author)?.name).filter(Boolean))] : [contactOf(t.members[0])?.name].filter(Boolean);
        for (const m of rows) {
          const who = m.author === "user" ? "玩家" : contactOf(m.author)?.name || "角色";
          for (const name of targets) add(name, `【小手机·交流】${who}：${String(m.text).replace(/\s+/g, " ").slice(0, 220)}`);
        }
      }
      for (const d of s.diary.slice(-40)) {
        const name = contactOf(d.author)?.name;
        if (!name) continue;
        const kind = d.kind === "heart" ? "心迹" : "日记";
        add(name, `【小手机·${kind}】${d.date || ""}${d.title ? " " + d.title : ""}：${String(d.text).replace(/\s+/g, " ").slice(0, 260)}`);
      }
      for (const a of s.agenda.filter((x) => x.status !== "cancelled").slice(-20)) {
        for (const name of new Set((a.members || []).map((id2) => contactOf(id2)?.name).filter(Boolean))) add(name, `【小手机·约定】${a.date || ""} ${a.title || ""}：${String(a.detail || a.note || "").slice(0, 160)}`);
      }
      return grouped;
    }
    /** 手机 → SoulLink：把最近的交流 / 约定 / 心迹 / 日记追加到对应角色的「记忆」分节 */
    async push({ dry = false } = {}) {
      const scan = this.scan();
      if (!scan.found) throw Error(scan.note || "没有找到 SoulLink 档案");
      const grouped = this.pushLines();
      const stats = { names: [], written: 0, skipped: 0 };
      for (const [name, items] of grouped) {
        const target = scan.archives[name] || (this.contactMatch(name) ? scan.archives[this.contactMatch(name).name] : null);
        if (!isObject(target)) {
          stats.skipped += items.length;
          continue;
        }
        const raw = target.记忆;
        const list = Array.isArray(raw) ? raw : isObject(raw) ? raw : null;
        const existing = new Set((Array.isArray(list) ? list : list ? Object.values(list) : []).map((x) => typeof x === "string" ? x : x?.text || ""));
        const fresh = items.filter((x) => !existing.has(x));
        if (!fresh.length) continue;
        const rows = fresh.map((x) => ({ id: id("sl"), text: x, floor: (this.eng.bridge.context?.()?.chat || []).length || 0, updatedAt: Date.now() }));
        if (Array.isArray(list)) list.push(...rows);
        else if (list) for (const r of rows) list[id("e")] = r;
        else target.记忆 = rows;
        stats.names.push(name);
        stats.written += rows.length;
      }
      if (dry) return { dry: true, ...stats };
      const ctx = this.ctx();
      assert(ctx?.extensionSettings, "需要酒馆扩展设置接口才能写入 SoulLink");
      try {
        ctx.saveSettingsDebounced?.() || ctx.saveSettings?.();
      } catch (e2) {
        this.setPrefs({ lastError: "写入后保存失败：" + (e2?.message || e2) });
      }
      await this.eng.repo.mutate((d) => {
        log(d, "ok", "已把小手机记录追加到 SoulLink 档案：" + (stats.names.join("、") || "无匹配角色"), "memory");
      }, { label: "回写 SoulLink 档案" });
      this.setPrefs({ lastAt: Date.now(), lastError: "", count: scan.count });
      return stats;
    }
    /** 生成 SoulLink 可导入的 roster JSON（结构与其「导出」一致） */
    exportRoster() {
      const s = this.eng.repo.data;
      const scan = this.scan();
      const roster = {};
      for (const c of s.contacts) {
        if (c.source === "soullink" && (c.references || []).some((r) => r.book === "SoulLink 档案")) continue;
        const mem = s.memories.filter((m) => (m.keys || []).includes(c.name)).slice(-40).map((m) => ({ id: m.id, text: m.text, floor: 0, updatedAt: m.ts || Date.now() }));
        const lines = String(c.bio || "").split(/\n{1,}/).map((x) => x.trim()).filter(Boolean);
        roster[c.name] = {
          姓名: c.name, 年龄: c.age ?? null, 性别: null, 职业: "",
          性格: lines.length ? lines : c.bio ? [c.bio] : [],
          世界观: (c.tags || []).slice(0, 12),
          家庭背景: [],
          人际关系: [c.status || "", (c.aliases || []).length ? "别名：" + (c.aliases || []).join("、") : ""].filter(Boolean),
          记忆: mem.length ? mem : c.extraNotes ? [{ id: id("sl"), text: c.extraNotes, floor: 0, updatedAt: Date.now() }] : [],
          updatedAt: Date.now()
        };
      }
      return {
        app: "SoulLink", kind: "roster", version: "1.7.5", exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        chatKey: scan.chatKey || this.chatKeyGuess(), chatLabel: this.eng.bridge.context?.()?.name || "",
        count: Object.keys(roster).length, roster,
        notice: "由月夜来信·小手机导出；可在 SoulLink 概览页用「导入」并入当前聊天（同名覆盖前会确认）。"
      };
    }
    /** 导入 SoulLink 的 roster / archives / 裸映射文件 */
    async importRoster(raw) {
      safeJson(raw);
      const map = isObject(raw?.roster) ? raw.roster : isObject(raw?.archives) ? raw.archives : isObject(raw?.characters) ? raw.characters : isObject(raw?.data) ? raw.data : raw?.items || raw;
      assert(isObject(map) && Object.keys(map).length <= 300, "不是兼容的 SoulLink 名单文件");
      const snap = this.eng.bridge.capture();
      let contacts = 0, memories = 0;
      await this.eng.repo.mutate((s) => {
        for (const [name, archive] of Object.entries(map)) {
          if (!isObject(archive) || ["__proto__", "prototype", "constructor"].includes(name)) continue;
          const body = SOULLINK_SECTIONS.map((sec) => {
            const raw2 = archive[sec];
            const list = Array.isArray(raw2) ? raw2 : isObject(raw2) ? Object.values(raw2) : [];
            const lines = list.map((x) => typeof x === "string" ? x : x?.text || x?.content || "").filter(Boolean);
            return lines.length ? "【" + sec + "】\n" + lines.map((x) => "· " + String(x).slice(0, 1200)).join("\n") : "";
          }).filter(Boolean).join("\n\n");
          let c = this.contactMatch(name);
          if (!c && body) {
            c = {
              id: "slc-" + fingerprint([name]).slice(0, 12), name: String(name).slice(0, 80), age: Number.isFinite(archive.年龄) ? archive.年龄 : null,
              tags: ["SoulLink"], status: "由 SoulLink 文件导入", bio: "", extraNotes: "", references: [], aliases: [],
              recognized: true, reachable: true, proactive: true, allowNarrative: false, color: "sage"
            };
            s.contacts.push(c);
            contacts++;
          }
          if (c && body) {
            const list = (c.references || []).slice(0);
            const item = { book: "SoulLink 文件", name: name + " · 档案", content: body.slice(0, 16e3) };
            const i = list.findIndex((r) => r.book === "SoulLink 文件" && r.name === item.name);
            if (i >= 0) list[i] = item;
            else if (list.length < 10) list.push(item);
            else list[9] = item;
            c.references = list;
          }
          const memRaw = archive.记忆;
          const memList = Array.isArray(memRaw) ? memRaw : isObject(memRaw) ? Object.values(memRaw) : [];
          for (const r of memList) {
            const t = String(typeof r === "string" ? r : r?.text || r?.content || "").trim();
            if (!t || s.memories.length >= 1e3) continue;
            const mid = "sl-" + fingerprint([name, t]).slice(0, 16);
            if (s.memories.some((m) => m.id === mid)) continue;
            s.memories.push({ id: mid, kind: "manual", title: text(name + " · " + autoTitle(t), 80), text: t.slice(0, 6e3), keys: [name], enabled: true, audience: ["user"], visibility: "private", sources: [{ note: "来自 SoulLink 名单文件" }], resolved: false, ts: Date.now(), sl: true });
            memories++;
          }
        }
        log(s, "ok", "已导入 SoulLink 名单：新增联系人 " + contacts + "、记忆 " + memories + " 条", "memory");
      }, { snapshot: snap, label: "导入 SoulLink 名单文件" });
      return { contacts, memories };
    }
  };

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
      this.soullink = new SoulLinkBridge(this);
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

