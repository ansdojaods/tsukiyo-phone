  // src/services/memory-sync.js
  var MEMORY_TAG = "tsukiyo";
  function cleanKeys(keys) {
    const list = Array.isArray(keys) ? keys : String(keys ?? "").split(/[,，、;；\n]/);
    return [...new Set(list.map((k) => String(k).trim()).filter(Boolean))].map((k) => k.slice(0, 80)).slice(0, 12);
  }
  function autoTitle(value) {
    const t = String(value ?? "").replace(/\s+/g, " ").trim();
    return t.length > 22 ? t.slice(0, 22) + "…" : t;
  }
  var memoryTitle = (m) => String(m.title ?? "").trim() || autoTitle(m.text);
  function memorySig(m) {
    return fingerprint([memoryTitle(m), String(m.text ?? "").trim(), cleanKeys(m.keys).join(""), m.enabled !== false]);
  }
  function entrySig(e2) {
    return fingerprint([String(e2.name ?? "").trim(), String(e2.content ?? "").trim(), cleanKeys(e2.keys).join(""), e2.enabled !== false]);
  }
  function normalizeEntry(raw) {
    const keys = (raw?.strategy?.keys || raw?.keys || []).map((k) => typeof k === "string" ? k : k && k.source ? "/" + k.source + "/" : String(k));
    return { uid: raw.uid ?? raw.id, name: String(raw.name ?? raw.comment ?? ""), content: String(raw.content ?? ""), keys: cleanKeys(keys), enabled: raw.enabled !== false, tid: String(raw.extra?.[MEMORY_TAG]?.id || ""), foreign: String(raw.extra?.[MEMORY_TAG]?.source || "") === "book-studio" };
  }
  function planMemorySync(memories, rawEntries, { removed = [], allowedImportUids = null, newId = () => "memory-" + Math.random().toString(36).slice(2, 10) } = {}) {
    const entries = rawEntries.map(normalizeEntry).filter((e2) => e2.uid !== void 0 && !e2.foreign);
    const byUid = new Map(entries.map((e2) => [e2.uid, e2]));
    const byTid = /* @__PURE__ */ new Map();
    for (const e2 of entries) if (e2.tid && !byTid.has(e2.tid)) byTid.set(e2.tid, e2);
    const used = /* @__PURE__ */ new Set();
    const plan = { create: [], update: [], stamp: [], pull: [], import: [], deleteLocal: [], deleteWB: [], adopt: [], skipped: [], keep: 0, linked: 0, sigs: {}, guard: "" };
    for (const m of memories) {
      const sig = memorySig(m);
      plan.sigs[m.id] = sig;
      let e2 = null;
      if (m.wb && m.wb.uid !== void 0) {
        const c = byUid.get(m.wb.uid);
        if (c && !used.has(c.uid) && (!c.tid || c.tid === m.id)) e2 = c;
      }
      if (!e2) {
        const c = byTid.get(m.id);
        if (c && !used.has(c.uid)) e2 = c;
      }
      if (e2) used.add(e2.uid);
      if (m.wb) plan.linked++;
      if (!m.wb && !e2) {
        plan.create.push(m.id);
        continue;
      }
      if (!e2) {
        if (sig === m.wb.hash) plan.deleteLocal.push(m.id);
        else plan.create.push(m.id);
        continue;
      }
      const es = entrySig(e2);
      if (!e2.content.trim()) {
        plan.update.push({ id: m.id, uid: e2.uid });
        continue;
      }
      if (!m.wb) {
        if (es === sig) plan.adopt.push({ id: m.id, uid: e2.uid, hash: sig });
        else plan.pull.push({ id: m.id, entry: e2, conflict: true });
        continue;
      }
      const base = m.wb.hash, pc = sig !== base, ec = es !== base;
      if (!pc && !ec) {
        if (m.wb.uid !== e2.uid) plan.adopt.push({ id: m.id, uid: e2.uid, hash: base });
        else plan.keep++;
        if (!e2.tid) plan.stamp.push({ uid: e2.uid, id: m.id });
      } else if (pc && !ec) plan.update.push({ id: m.id, uid: e2.uid });
      else if (!pc && ec) plan.pull.push({ id: m.id, entry: e2, conflict: false });
      else if (sig === es) plan.adopt.push({ id: m.id, uid: e2.uid, hash: sig });
      else plan.pull.push({ id: m.id, entry: e2, conflict: true });
    }
    const removedIds = new Set(removed.map((r) => r.id)), removedUids = new Set(removed.filter((r) => r.uid !== void 0).map((r) => r.uid));
    for (const e2 of entries) {
      if (used.has(e2.uid)) continue;
      if (removedIds.has(e2.tid) || !e2.tid && removedUids.has(e2.uid)) {
        plan.deleteWB.push(e2.uid);
        continue;
      }
      if (e2.tid && byTid.get(e2.tid) !== e2) continue;
      if (!e2.content.trim()) continue;
      if (e2.content.length > 8e3) {
        plan.skipped.push({ uid: e2.uid, name: e2.name, reason: "内容超过 8000 字，没有导入" });
        continue;
      }
      if (Array.isArray(allowedImportUids) && !allowedImportUids.includes(e2.uid)) continue;
      plan.import.push({ ...e2, mid: e2.tid && !memories.some((m) => m.id === e2.tid) ? e2.tid : newId() });
    }
    const dl = plan.deleteLocal.length;
    if (dl >= 3 && dl > plan.linked * 0.5 || dl >= 1 && dl === plan.linked && entries.length === 0) plan.guard = "mass-delete";
    return plan;
  }
  var DEFAULT_ENTRY = () => ({
    strategy: { type: "constant", keys: [], keys_secondary: { logic: "and_any", keys: [] }, scan_depth: "same_as_global" },
    position: { type: "at_depth", role: "system", depth: 4, order: 100 },
    probability: 100,
    recursion: { prevent_incoming: false, prevent_outgoing: false, delay_until: null },
    effect: { sticky: null, cooldown: null, delay: null }
  });
  function buildEntry(m) {
    const keys = cleanKeys(m.keys), base = DEFAULT_ENTRY();
    base.strategy.type = keys.length ? "selective" : "constant";
    base.strategy.keys = keys;
    return { ...base, name: memoryTitle(m), enabled: m.enabled !== false, content: String(m.text ?? "").trim(), extra: { [MEMORY_TAG]: { id: m.id, kind: m.kind || "manual", v: 1 } } };
  }
  function applyPlanToEntries(rawEntries, plan, memoriesById) {
    const out = [];
    const drop = new Set(plan.deleteWB);
    const upd = new Map(plan.update.map((u) => [u.uid, u.id]));
    const stamp = new Map(plan.stamp.map((u) => [u.uid, u.id]));
    const imported = new Map(plan.import.map((e2) => [e2.uid, e2]));
    for (const raw of rawEntries) {
      const uid = raw.uid ?? raw.id;
      if (drop.has(uid)) continue;
      let next = raw;
      const imp = imported.get(uid);
      if (imp && !imp.tid) next = { ...raw, extra: { ...raw.extra, [MEMORY_TAG]: { id: imp.mid, kind: "manual", v: 1 } } };
      const mid = upd.get(uid) ?? stamp.get(uid);
      const m = mid ? memoriesById.get(mid) : null;
      if (m) {
        next = { ...raw, extra: { ...raw.extra, [MEMORY_TAG]: { ...raw.extra?.[MEMORY_TAG], id: m.id, kind: m.kind || "manual", v: 1 } } };
        if (upd.has(uid)) {
          const keys = cleanKeys(m.keys), oldKeys = normalizeEntry(raw).keys;
          next = { ...next, name: memoryTitle(m), content: String(m.text ?? "").trim(), enabled: m.enabled !== false };
          if (keys.join("") !== oldKeys.join("")) next = { ...next, strategy: { ...raw.strategy, keys } };
        }
      }
      out.push(next);
    }
    for (const id2 of plan.create) {
      const m = memoriesById.get(id2);
      if (m) out.push(buildEntry(m));
    }
    return out;
  }
  function applyPlanToMemories(s, plan, finalEntries, { book = "", now = Date.now(), newId = () => "memory-" + Math.random().toString(36).slice(2, 10) } = {}) {
    const view = finalEntries.map(normalizeEntry);
    const byTid = new Map(view.filter((e2) => e2.tid).map((e2) => [e2.tid, e2]));
    const byId = new Map(s.memories.map((m) => [m.id, m]));
    const untouched = (m) => m && memorySig(m) === plan.sigs[m.id];
    const stats = { created: 0, updated: 0, pulled: 0, conflicts: 0, imported: 0, deleted: 0, deletedWB: plan.deleteWB.length, guarded: plan.guard ? plan.deleteLocal.length : 0 };
    for (const id2 of plan.create) {
      const m = byId.get(id2), e2 = byTid.get(id2);
      if (untouched(m) && e2) {
        m.wb = { uid: e2.uid, hash: entrySig(e2) };
        stats.created++;
      }
    }
    for (const u of plan.update) {
      const m = byId.get(u.id), e2 = byTid.get(u.id) || view.find((x) => x.uid === u.uid);
      if (untouched(m) && e2) {
        m.wb = { uid: e2.uid, hash: entrySig(e2) };
        stats.updated++;
      }
    }
    for (const a of plan.adopt) {
      const m = byId.get(a.id);
      if (untouched(m)) m.wb = { uid: a.uid, hash: a.hash };
    }
    for (const p of plan.pull) {
      const m = byId.get(p.id);
      if (!untouched(m)) continue;
      if (p.conflict) {
        m.prev = { title: memoryTitle(m), text: m.text, keys: cleanKeys(m.keys), ts: now };
        stats.conflicts++;
      }
      m.title = p.entry.name;
      m.text = p.entry.content.trim();
      m.keys = p.entry.keys;
      m.enabled = p.entry.enabled;
      m.wb = { uid: p.entry.uid, hash: entrySig(p.entry) };
      stats.pulled++;
    }
    const gone = new Set(plan.guard ? [] : plan.deleteLocal.filter((id2) => untouched(byId.get(id2))));
    if (gone.size) {
      s.memories = s.memories.filter((m) => !gone.has(m.id));
      stats.deleted = gone.size;
    }
    for (const e2 of plan.import) {
      if (s.memories.length >= 1e3) break;
      const mid = s.memories.some((m) => m.id === e2.mid) ? newId() : e2.mid;
      s.memories.push({ id: mid, kind: "manual", title: e2.name, text: e2.content.trim(), keys: e2.keys, enabled: e2.enabled, audience: ["user"], visibility: "private", sources: [{ note: book ? "来自世界书「" + book + "」" : "来自世界书" }], resolved: false, ts: now, wb: { uid: e2.uid, hash: entrySig(e2) } });
      stats.imported++;
    }
    return stats;
  }

