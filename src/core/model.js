  // src/core/model.js
  var freshMemoryBook = () => ({ name: "", scope: "card", linked: false, autoSync: true, bound: false, lastSyncAt: 0, lastError: "", pendingDelete: [] });
  function freshPhone() {
    return { schema: 1, revision: 0, studio: studioFresh(), visual: avsFresh(), arc: freshArc(), canonicalSeeded: false, removedContacts: [], memoryBook: freshMemoryBook(), bookSync: bookFreshState(), soul: soulFresh(), ms: msFresh(), memApi: memApiFresh(), contacts: [], threads: [], feed: [], plans: [], activePlan: null, agenda: [], notes: [], diary: [], tasks: [], items: [], album: [], places: [], memories: [], summaries: [], legacyArchive: [], logs: [], migration: [], settings: { planningMode: "manual", inject: true, readNarrative: true, unlockAll: true, auto: { enabled: false, consentAt: 0, proactive: true, planning: true, social: false, memory: true, proactiveMinutes: 20, planningMinutes: 45, socialMinutes: 90, proactiveEvery: 3, socialEvery: 5, maxHourly: 6, maxDaily: 24, quietStart: 23, quietEnd: 7, proactiveUnlimited: true, proactiveIgnoreQuiet: true, proactiveUnreadCap: 3, proactiveCooldown: 6 } }, automation: { attempts: [], last: {}, lastReply: {}, failures: {}, next: {}, lastActor: "", lastNarrative: "", proactiveLog: [] }, manualStory: { date: "", time: "", place: "" } };
  }
  function validatePhone(data) {
    safeJson(data);
    assert(isObject(data) && data.schema === 1, "不是兼容的月夜来信存档");
    assert(Number.isSafeInteger(data.revision) && data.revision >= 0, "版本计数错误");
    const limits = { contacts: 200, threads: 120, feed: 500, plans: 100, agenda: 300, notes: 300, diary: 300, tasks: 300, items: 300, album: 60, places: 120, memories: 1e3, summaries: 500, legacyArchive: 20, logs: 200, migration: 50 };
    for (const [key, max] of Object.entries(limits)) {
      assert(Array.isArray(data[key]) && data[key].length <= max, "记录结构或数量无效：" + key);
      const rows = data[key].filter(isObject).filter((x) => x.id);
      assert(new Set(rows.map((x) => x.id)).size === rows.length, "存在重复编号：" + key);
    }
    assert(["manual", "auto"].includes(data.settings?.planningMode), "规划模式错误");
    assert(typeof data.settings.inject === "boolean", "注入开关错误");
    assert(isObject(data.settings.auto) && typeof data.settings.auto.enabled === "boolean", "自动化配置错误");
    assert(typeof data.settings.readNarrative === "boolean", "正文读取开关无效");
    if (data.settings.unlockAll !== void 0) assert(typeof data.settings.unlockAll === "boolean", "人物解锁开关无效");
    if (data.removedContacts !== void 0) {
      const rc = data.removedContacts;
      assert(Array.isArray(rc) && rc.length <= 300 && rc.every((r) => isObject(r) && typeof r.id === "string") && new Set(rc.map((r) => r.id)).size === rc.length, "已移除人物记录错误");
    }
    if (data.memoryBook !== void 0) {
      const mb = data.memoryBook;
      assert(isObject(mb) && typeof mb.name === "string" && mb.name.length <= 200 && ["card", "chat"].includes(mb.scope) && typeof mb.linked === "boolean" && typeof mb.autoSync === "boolean" && Array.isArray(mb.pendingDelete) && mb.pendingDelete.length <= 500, "记忆世界书配置错误");
    }
    if (data.memoryBook?.importUids !== undefined) assert(Array.isArray(data.memoryBook.importUids) && data.memoryBook.importUids.length <= 10000 && data.memoryBook.importUids.every(x => typeof x === "string" || Number.isFinite(x)), "记忆导入选择无效");
    if (data.bookSync !== void 0) {
      const bs = data.bookSync;
      assert(isObject(bs) && typeof bs.name === "string" && bs.name.length <= 200 && ["card", "chat"].includes(bs.scope) && typeof bs.linked === "boolean" && typeof bs.autoSync === "boolean" && Array.isArray(bs.pendingDelete) && bs.pendingDelete.length <= 2000, "世界书工坊配置错误");
      if (bs.managedKeys !== void 0) assert(Array.isArray(bs.managedKeys) && bs.managedKeys.length <= 4000 && bs.managedKeys.every(k => typeof k === "string" && k.length <= 200), "工坊托管清单无效");
      if (bs.syncBases !== void 0) assert(Array.isArray(bs.syncBases) && bs.syncBases.length <= 2000 && bs.syncBases.every(x => x && typeof x.key === "string" && typeof x.local === "string"), "工坊同步基准无效");
      if (bs.excludedKeys !== void 0) assert(Array.isArray(bs.excludedKeys) && bs.excludedKeys.length <= 2000 && bs.excludedKeys.every(k => typeof k === "string" && k.length <= 200), "工坊排除清单无效");
      if (bs.sources !== void 0) assert(isObject(bs.sources) && Object.values(bs.sources).every((x) => typeof x === "boolean"), "世界书工坊来源配置错误");
      if (bs.prefix !== void 0) assert(typeof bs.prefix === "string" && bs.prefix.length <= 20, "世界书条目前缀过长");
      if (bs.maxEntries !== void 0) assert(Number.isInteger(bs.maxEntries) && bs.maxEntries >= 20 && bs.maxEntries <= 2000, "世界书条目上限无效");
      if (bs.pullBack !== void 0) assert(typeof bs.pullBack === "boolean", "世界书回写开关无效");
      if (bs.constantPersona !== void 0) assert(typeof bs.constantPersona === "boolean", "人物档案常驻开关无效");
    }
    const a = data.settings.auto;
    for (const key of ["proactive", "planning", "social", "memory"]) assert(typeof a[key] === "boolean", "自动化开关无效：" + key);
    for (const [key, lo, hi] of [["proactiveMinutes", 0, 1440], ["planningMinutes", 5, 1440], ["socialMinutes", 10, 1440], ["proactiveEvery", 0, 50], ["socialEvery", 1, 50], ["maxHourly", 1, 30], ["maxDaily", 1, 100], ["quietStart", 0, 23], ["quietEnd", 0, 23], ["proactiveUnreadCap", 0, 50], ["proactiveCooldown", 0, 30]]) assert(Number.isInteger(a[key]) && a[key] >= lo && a[key] <= hi, "后台限制无效：" + key);
    for (const key of ["proactiveUnlimited", "proactiveIgnoreQuiet"]) if (a[key] !== void 0) assert(typeof a[key] === "boolean", "自动化开关无效：" + key);
    if (a.enabled) assert(Number.isFinite(a.consentAt) && a.consentAt > 0, "启用自动化需要明确确认");
    const contacts = new Set(data.contacts.map((c) => c.id));
    for (const c of data.contacts) {
      assert(typeof c.id === "string" && c.id.length <= 100 && typeof c.name === "string" && c.name.trim().length > 0 && c.name.length <= 80, "联系人资料不完整");
      assert(c.age === null || Number.isInteger(c.age) && c.age >= 0 && c.age < 150, "年龄无效");
      assert(typeof c.recognized === "boolean" && typeof c.reachable === "boolean", "联系人解锁状态错误");
      if (c.age !== null && c.age < 12) assert(!c.reachable, "儿童请通过监护人联系");
      assert(typeof c.bio === "string" && c.bio.length <= 12e3, "人设文本过长");
      if (c.references) {
        assert(Array.isArray(c.references) && c.references.length <= 10, "参考资料过多");
        for (const r of c.references) assert(typeof r.content === "string" && r.content.length <= 16e3 && typeof r.book === "string" && r.book.length <= 300, "参考资料格式错误");
      }
    }
    for (const t of data.threads) {
      assert(["direct", "group"].includes(t.kind) && Array.isArray(t.members) && t.members.length > 0 && t.members.length <= 12, "会话成员错误");
      assert(t.members.every((n) => contacts.has(n)), "会话引用未知联系人");
      assert(Array.isArray(t.messages) && t.messages.length <= 2400 && Array.isArray(t.pending) && t.pending.length <= 12, "会话记录数量异常");
      assert(new Set(t.messages.map((x) => x.id)).size === t.messages.length, "会话消息编号重复");
      for (const m of t.messages) {
        assert(["user", "character", "system"].includes(m.role) && typeof m.text === "string" && m.text.length <= 4e3 && Number.isFinite(m.ts), "消息格式错误");
        if (m.role === "character") assert(t.members.includes(m.author), "消息说话者不在会话内");
      }
      for (const m of t.pending) assert(typeof m.id === "string" && text(m.text, 2e3), "待发内容错误");
    }
    for (const p of data.plans) {
      assert(p.id && p.title && p.summary && Array.isArray(p.beats) && p.beats.length >= 1 && p.beats.length <= 7, "剧情方向不完整");
      assert(p.members.every((x) => contacts.has(x)), "剧情方向有未知角色");
      for (const b of p.beats) {
        assert(b.id && b.title && b.scene && b.finish && Number.isInteger(b.day) && b.day >= 0 && b.day <= 6, "剧情步骤不完整");
      }
      assert(["candidate", "active", "paused", "completed", "cancelled"].includes(p.status), "方向状态错误");
    }
    if (data.activePlan) {
      const p = data.plans.find((p2) => p2.id === data.activePlan.id);
      assert(p && Number.isInteger(data.activePlan.cursor) && data.activePlan.cursor >= 0 && data.activePlan.cursor < p.beats.length, "当前规划游标无效");
    }
    for (const m of data.memories) {
      assert(m.id && m.text && Array.isArray(m.audience) && Array.isArray(m.sources) && ["phone_fact", "narrative_fact", "promise", "manual"].includes(m.kind), "记忆结构错误");
      if (m.keys !== void 0) assert(Array.isArray(m.keys) && m.keys.length <= 12 && m.keys.every((k) => typeof k === "string" && k.length <= 80), "记忆关键词错误");
      if (m.wb !== void 0) assert(isObject(m.wb) && typeof m.wb.hash === "string", "记忆的世界书链接错误");
    }
    for (const a2 of data.agenda) {
      assert(a2.id && text(a2.title, 160) && ["proposed", "confirmed", "completed", "cancelled", "event"].includes(a2.status), "日程格式错误");
      if (a2.date) isoDay(a2.date);
    }
    assert(isObject(data.automation) && Array.isArray(data.automation.attempts), "后台任务记录错误");
    if (data.automation.proactiveLog !== void 0) assert(Array.isArray(data.automation.proactiveLog) && data.automation.proactiveLog.length <= 40, "主动来信记录错误");
    studioValidate(data.studio);
    avsValidate(data.visual);
    soulValidate(data.soul);
    msValidate(data.ms);
    memApiValidate(data.memApi);
    validateArc(data.arc);
    return data;
  }
  function normalizePhone(raw) {
    const base = freshPhone();
    safeJson(raw);
    assert(isObject(raw), "存档必须为对象");
    const s = { ...base, ...clone(raw), settings: { ...base.settings, ...raw.settings, auto: { ...base.settings.auto, ...raw.settings?.auto } }, automation: { ...base.automation, ...raw.automation, proactiveLog: Array.isArray(raw.automation?.proactiveLog) ? clone(raw.automation.proactiveLog).slice(-40) : [] }, manualStory: { ...base.manualStory, ...raw.manualStory }, memoryBook: { ...base.memoryBook, ...isObject(raw.memoryBook) ? raw.memoryBook : {} }, bookSync: { ...base.bookSync, ...isObject(raw.bookSync) ? raw.bookSync : {}, sources: { ...base.bookSync.sources, ...(isObject(raw.bookSync) && isObject(raw.bookSync.sources) ? raw.bookSync.sources : {}) } }, soul: { ...base.soul, ...(isObject(raw.soul) ? raw.soul : {}), cfg: { ...base.soul.cfg, ...(raw.soul?.cfg || {}) }, auto: { ...base.soul.auto, ...(raw.soul?.auto || {}) }, roleplay: { ...base.soul.roleplay, ...(raw.soul?.roleplay || {}) }, presets: { ...base.soul.presets, ...(raw.soul?.presets || {}) }, last: { ...base.soul.last, ...(raw.soul?.last || {}) }, stats: { ...base.soul.stats, ...(raw.soul?.stats || {}) }, roster: isObject(raw.soul?.roster) ? raw.soul.roster : {} }, ms: { ...base.ms, ...(isObject(raw.ms) ? raw.ms : {}), cfg: { ...base.ms.cfg, ...(raw.ms?.cfg || {}) }, auto: { ...base.ms.auto, ...(raw.ms?.auto || {}) }, inject: { ...base.ms.inject, ...(raw.ms?.inject || {}) }, shelve: { ...base.ms.shelve, ...(raw.ms?.shelve || {}) }, presets: { ...base.ms.presets, ...(raw.ms?.presets || {}) }, seen: { ...base.ms.seen, ...(raw.ms?.seen || {}) }, stats: { ...base.ms.stats, ...(raw.ms?.stats || {}) }, delegate: { ...base.ms.delegate, ...(raw.ms?.delegate || {}) } }, memApi: { ...base.memApi, ...(isObject(raw.memApi) ? raw.memApi : {}), pull: { ...base.memApi.pull, ...(raw.memApi?.pull || {}) }, stats: { ...base.memApi.stats, ...(raw.memApi?.stats || {}) } }, arc: normalizeArc(raw.arc), legacyArchive: [], migration: [] };
    for (const c of s.contacts) {
      c.age = c.age == null ? null : Math.round(Number(c.age));
      if (c.age !== null && c.age < 12) c.reachable = false;
    }
    return validatePhone(s);
  }
  function contactAvailable(c) {
    return !!c && c.recognized === true && c.reachable === true && (c.age === null || c.age >= 12);
  }
  function addContact(s, raw, { allowDuplicate = false } = {}) {
    assert(s.contacts.length < 200, "联系人已达上限");
    const name = allowDuplicate ? uniqueName(s, text(raw.name, 40)) : assertNameFree(s, raw.name);
    assert(name, "请填写姓名");
    const age = raw.age === "" || raw.age == null ? null : Math.round(clamp(raw.age, 0, 130));
    const c = { id: raw.id || id("person"), name, age, bio: text(raw.bio, 12e3), status: text(raw.status || "最近有自己的事在忙", 240), recognized: raw.recognized !== false, reachable: raw.reachable !== false && (age === null || age >= 12), avatar: raw.avatar || "", color: raw.color || "sage", source: raw.source || "manual", allowNarrative: raw.allowNarrative === true, proactive: raw.proactive !== false, follow: true, lastIncoming: 0, history: Array.isArray(raw.history) ? clone(raw.history) : [], ...raw.wb ? { wb: clone(raw.wb) } : {}, ...raw.story ? { story: clone(raw.story) } : {} };
    s.contacts.push(c);
    return c;
  }
  function ensureThread(s, members, { title = "", group = false } = {}) {
    members = [...new Set(members)];
    assert(members.length && (group ? members.length >= 2 : members.length === 1), "私聊需1人，群聊需至少2人");
    assert(members.every((n) => contactAvailable(s.contacts.find((c) => c.id === n))), "存在尚未解锁或不可联系的成员");
    if (!group) {
      const old = s.threads.find((t2) => t2.kind === "direct" && t2.members[0] === members[0]);
      if (old) return old;
    }
    const t = { id: id(group ? "group" : "chat"), kind: group ? "group" : "direct", title: text(title || s.contacts.find((c) => c.id === members[0]).name, 80), members, messages: [], pending: [], draft: "", muted: false, createdAt: Date.now() };
    limitAppend(s.threads, t, 120, "会话");
    return t;
  }
  function queueMessage(s, threadId, value, kind = "text", mediaId = "") {
    const t = s.threads.find((t2) => t2.id === threadId);
    assert(t, "会话不存在");
    const body = text(value, 2e3);
    assert(body || mediaId, "消息不能是空的");
    assert(t.members.every((n) => contactAvailable(s.contacts.find((c) => c.id === n))), "成员目前不可联系");
    assert(!t.pending.some((p) => p.text === body && p.mediaId === mediaId), "相同消息已在待发箱");
    limitAppend(t.pending, { id: id("pending"), text: body || "[图片]", kind, mediaId, ts: Date.now() }, 12, "本会话待发");
    t.draft = "";
    return t;
  }
  function appendMessages(s, threadId, replies, { pendingIds = [], story = "", proactive = false } = {}) {
    const t = s.threads.find((t2) => t2.id === threadId);
    assert(t, "会话已不存在");
    assert(t.messages.length + pendingIds.length + replies.length <= 2400, "会话记录已满，请导出后整理");
    const selected = t.pending.filter((p) => pendingIds.includes(p.id));
    assert(selected.length === pendingIds.length, "待发内容发生变化");
    const now = Date.now();
    for (const [i, p] of selected.entries()) t.messages.push({ id: p.id, role: "user", author: "user", text: p.text, kind: p.kind || "text", mediaId: p.mediaId || "", ts: now - selected.length + i, story, read: true, source: "phone" });
    for (const [i, r] of replies.entries()) {
      assert(t.members.includes(r.author) && contactAvailable(s.contacts.find((c2) => c2.id === r.author)), "回复者不属于可用成员");
      t.messages.push({ id: id("message"), role: "character", author: r.author, text: text(r.text, 1600), kind: r.kind || "text", ts: now + i, story, read: false, source: proactive ? "proactive" : "phone" });
      const c = s.contacts.find((c2) => c2.id === r.author);
      if (proactive) c.lastIncoming = now;
    }
    t.pending = t.pending.filter((p) => !pendingIds.includes(p.id));
    return t;
  }
  var unreadCount = (s) => s.threads.reduce((n, t) => n + t.messages.filter((m) => m.role === "character" && !m.read).length, 0);
  function adoptPlan(s, planId, mode = "manual") {
    const p = s.plans.find((p2) => p2.id === planId);
    assert(p && ["candidate", "paused", "active"].includes(p.status), "这条方向不可采用");
    if (s.activePlan && s.activePlan.id !== p.id) {
      const old = s.plans.find((x) => x.id === s.activePlan.id);
      if (old) old.status = "paused";
    }
    p.status = "active";
    s.activePlan = { id: p.id, cursor: Math.max(0, p.beats.findIndex((b) => !b.done)), selectedBy: mode, selectedAt: Date.now() };
    return p;
  }
  function progressPlan(s, { quote = "", floor = null, manual = false } = {}) {
    assert(s.activePlan, "尚未选择方向");
    assert(manual || text(quote, 500), "推进必须有实际正文依据");
    const p = s.plans.find((p2) => p2.id === s.activePlan.id), b = p.beats[s.activePlan.cursor];
    b.evidence = { quote: text(quote, 500), floor, manual, ts: Date.now() };
    b.done = true;
    if (s.activePlan.cursor + 1 < p.beats.length) s.activePlan.cursor++;
    else {
      p.status = "completed";
      s.activePlan = null;
    }
    return p;
  }
  function log(s, level, message, module = "system") {
    s.logs.push({ id: id("log"), ts: Date.now(), level, module, message: text(message, 350) });
    if (s.logs.length > 200) s.logs.splice(0, s.logs.length - 200);
  }

