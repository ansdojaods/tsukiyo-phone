  // src/core/repository.js
  var MIRROR_DB = "tsukiyo-phone-mirror";
  var MIRROR_STORE = "snapshots";
  function ownerParts(owner) {
    try {
      const a = JSON.parse(owner);
      return Array.isArray(a) ? a.map(String) : null;
    } catch {
      return null;
    }
  }
  function sameCharacter(a, b) {
    const x = ownerParts(a), y = ownerParts(b);
    return !!x && !!y && x[0] === y[0] && x[1] === y[1] && (x[0] !== "" || x[1] !== "");
  }
  var MirrorStore = class {
    constructor(win) {
      this.win = win;
      this.cache = /* @__PURE__ */ new Map();
      this.warmed = /* @__PURE__ */ new Set();
      this.dbPromise = null;
    }
    lsKey(key) {
      return "tsukiyo-phone:v1:mirror:" + fingerprint(key);
    }
    lsGet(key) {
      try {
        const v = this.win.localStorage.getItem(this.lsKey(key));
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    }
    lsPut(key, value) {
      try {
        const s = JSON.stringify(value);
        if (s.length < 6e5) this.win.localStorage.setItem(this.lsKey(key), s);
        else this.win.localStorage.removeItem(this.lsKey(key));
      } catch {
      }
    }
    open() {
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve) => {
        try {
          const idb = this.win.indexedDB;
          if (!idb) return resolve(null);
          const req = idb.open(MIRROR_DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(MIRROR_STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
          this.win.setTimeout(() => resolve(null), 2500);
        } catch {
          resolve(null);
        }
      });
      return this.dbPromise;
    }
    async get(key) {
      const db = await this.open();
      if (!db) return this.lsGet(key);
      return new Promise((resolve) => {
        try {
          const r = db.transaction(MIRROR_STORE, "readonly").objectStore(MIRROR_STORE).get(key);
          r.onsuccess = () => resolve(r.result ?? this.lsGet(key));
          r.onerror = () => resolve(this.lsGet(key));
        } catch {
          resolve(this.lsGet(key));
        }
      });
    }
    async put(key, value) {
      this.lsPut(key, value);
      const db = await this.open();
      if (!db) return false;
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(MIRROR_STORE, "readwrite");
          tx.objectStore(MIRROR_STORE).put(value, key);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch {
          resolve(false);
        }
      });
    }
    async del(key) {
      try {
        this.win.localStorage.removeItem(this.lsKey(key));
      } catch {
      }
      const db = await this.open();
      if (!db) return;
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(MIRROR_STORE, "readwrite");
          tx.objectStore(MIRROR_STORE).delete(key);
          tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    }
    async warm(owner) {
      if (this.warmed.has(owner)) return;
      this.warmed.add(owner);
      const v = await this.get("o:" + owner);
      if (v?.schema === 1 && v.data && v.owner === owner) this.cache.set(owner, v);
    }
    peek(owner) {
      return this.cache.get(owner) || null;
    }
    async save(owner, payload) {
      this.cache.set(owner, payload);
      return this.put("o:" + owner, payload);
    }
    async remove(owner) {
      this.cache.delete(owner);
      await this.del("o:" + owner);
    }
  };
  var PhoneRepository = class {
    constructor(bridge) {
      this.bridge = bridge;
      this.events = new Emitter();
      this.queue = Promise.resolve();
      this.data = null;
      this.snapshot = null;
      this.seeded = false;
      this.warnings = [];
      this.mirror = new MirrorStore(bridge.win);
      this.lastChoice = { source: "seed", floor: -1, rev: 0, tier: 0, count: 0 };
      this.revisionHigh = 0;
      this.mirrorTimer = null;
      this.mirrorJob = null;
      this.mirrorState = { at: 0, chat: false, local: false, error: "" };
      this.onHide = () => this.flushMirror();
      this.onVis = () => {
        if (this.bridge.win.document?.visibilityState === "hidden") this.flushMirror();
      };
      try {
        bridge.win.addEventListener("pagehide", this.onHide);
        bridge.win.document?.addEventListener("visibilitychange", this.onVis);
      } catch {
      }
    }
    choose(snapshot2) {
      const cands = [];
      const consider = (source, p, floor) => {
        if (!p || !isObject(p.data) || typeof p.owner !== "string") return;
        const tier = p.owner === snapshot2.owner ? 0 : source === "mirror" ? 9 : sameCharacter(p.owner, snapshot2.owner) ? 1 : 9;
        if (tier > 1) return;
        try {
          validatePhone(p.data);
        } catch {
          if (!this.warnings.includes("发现不兼容或损坏的手机快照，未覆盖它")) this.warnings.push("发现不兼容或损坏的手机快照，未覆盖它");
          return;
        }
        cands.push({ source, floor, tier, p, rev: p.data.revision || 0, at: p.updated || 0, exact: (p.sig || fingerprint(p.lineage || [])) === snapshot2.signature });
      };
      for (const src of this.bridge.candidates(snapshot2)) {
        const e2 = src.envelope;
        if (e2?.schema !== 1 || !Array.isArray(e2.checkpoints)) continue;
        for (const p of e2.checkpoints) consider("floor", p, src.floor);
      }
      const chatStore = this.bridge.readChatStore?.();
      if (chatStore?.schema === 1) consider("chat", chatStore, -1);
      if (!cands.length) {
        const m = this.mirror.peek(snapshot2.owner);
        if (m) consider("mirror", m, -1);
      }
      const rank = { floor: 0, chat: 1, mirror: 2 };
      cands.sort((a, b) => b.rev - a.rev || b.at - a.at || a.tier - b.tier || rank[a.source] - rank[b.source] || b.floor - a.floor);
      const win = cands[0] || null;
      this.lastChoice = win ? { source: win.source, floor: win.floor, rev: win.rev, tier: win.tier, count: cands.length, exact: win.exact } : { source: "seed", floor: -1, rev: 0, tier: 0, count: 0 };
      if (win) this.revisionHigh = Math.max(this.revisionHigh, win.rev);
      if (win && win.source !== "floor") this.lastRestore = { source: win.source, rev: win.rev, at: Date.now() };
      return syncHostContacts(win ? normalizePhone(win.p.data) : this.bridge.initial?.() || seedFromHost(snapshot2), snapshot2);
    }
    diagnostics() {
      let tailHas = false;
      try {
        const snap = this.snapshot;
        if (snap) tailHas = !!this.bridge.readTarget(snap);
      } catch {
      }
      return { choice: { ...this.lastChoice }, lastRestore: this.lastRestore ? { ...this.lastRestore } : null, tailHasEnvelope: tailHas, chatStore: !!this.bridge.readChatStore?.(), mirror: !!this.mirror.peek(this.snapshot?.owner || ""), mirrorState: { ...this.mirrorState }, revision: this.data?.revision ?? 0, warnings: [...this.warnings].slice(-3) };
    }
    load() {
      const snap = this.bridge.capture(), data = syncHostContacts(this.choose(snap), snap);
      this.data = data;
      this.snapshot = snap;
      this.events.emit({ type: "load", data, snapshot: snap });
      return data;
    }
    taskSnapshot() {
      const s = this.bridge.capture();
      return { ...s, phoneDigest: fingerprint(this.choose(s)) };
    }
    mutate(fn, { snapshot: snapshot2 = null, guard = null, label = "保存记录" } = {}) {
      const run = this.queue.catch(() => {
      }).then(async () => {
        let last;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await this.commit(fn, { requested: snapshot2, guard, label });
          } catch (e2) {
            last = e2;
            if (!/手机存档刚刚更新/.test(String(e2?.message || ""))) throw e2;
            await sleep(80);
          }
        }
        throw last;
      });
      this.queue = run.catch(() => {
      });
      return run;
    }
    async commit(fn, { requested, guard, label }) {
      if (requested) assert(this.bridge.same(requested), "已切换到另一个聊天，这次修改没有写入新的聊天");
      const snap = this.bridge.capture(), oldTarget = this.bridge.readTarget(snap), base = syncHostContacts(this.choose(snap), snap);
      if (guard) assert(guard(base, snap), "相关记录已有新变化，旧结果没有写入");
      const next = clone(base), result = fn(next, snap);
      assert(!result || typeof result.then !== "function", "保存函数不可包含异步操作");
      next.revision = Math.max(base.revision, this.revisionHigh || 0) + 1;
      validatePhone(next);
      const oldCheckpoints = oldTarget?.schema === 1 && Array.isArray(oldTarget.checkpoints) ? oldTarget.checkpoints : [];
      const checkpoints = oldCheckpoints.filter((p) => p && p.owner === snap.owner && (p.sig || fingerprint(p.lineage || [])) !== snap.signature).sort((a, b) => (a.updated || 0) - (b.updated || 0)).slice(-2);
      checkpoints.push({ owner: snap.owner, sig: snap.signature, lineage: clone(snap.lineage.slice(-40)), updated: Date.now(), data: next });
      const envelope = { schema: 1, checkpoints };
      safeJson(envelope);
      await this.bridge.saveEnvelope(snap, envelope, fingerprint(oldTarget));
      this.data = next;
      this.revisionHigh = next.revision;
      this.snapshot = this.bridge.capture();
      this.events.emit({ type: "save", label, data: next, snapshot: this.snapshot });
      this.queueMirror(next, snap);
      return next;
    }
    queueMirror(data, snap) {
      this.mirrorJob = { owner: snap.owner, data };
      clearTimeout(this.mirrorTimer);
      this.mirrorTimer = setTimeout(() => this.flushMirror(), 6e3);
    }
    async flushMirror() {
      clearTimeout(this.mirrorTimer);
      const job = this.mirrorJob;
      if (!job) return;
      this.mirrorJob = null;
      if (this.mirrorState.rev === job.data.revision && this.mirrorState.owner === job.owner && this.mirrorState.chat) return;
      const payload = { schema: 1, owner: job.owner, lineage: [], updated: Date.now(), data: job.data };
      try {
        safeJson(payload);
      } catch {
        return;
      }
      const [a, b] = await Promise.allSettled([Promise.resolve().then(() => this.bridge.writeChatStore?.(payload)), this.mirror.save(job.owner, payload)]);
      this.mirrorState = { at: Date.now(), owner: job.owner, rev: job.data.revision, chat: a.status === "fulfilled" && a.value === true, local: b.status === "fulfilled" && b.value === true, error: text([a, b].find((r) => r.status === "rejected")?.reason?.message || "", 120) };
    }
    async initialize() {
      this.load();
      return this.mutate(() => {
      }, { label: "初始化手机" });
    }
    on(fn) {
      return this.events.on(fn);
    }
    clearView() {
      this.data = null;
      this.snapshot = null;
      this.events.emit({ type: "unavailable" });
    }
    dispose() {
      clearTimeout(this.mirrorTimer);
      try {
        this.bridge.win.removeEventListener("pagehide", this.onHide);
        this.bridge.win.document?.removeEventListener("visibilitychange", this.onVis);
      } catch {
      }
    }
  };

