  // src/core/contacts.js
  var nameKey = (v) => String(v ?? "").normalize("NFKC").replace(/[\s\u3000·・•．.。]+/g, "").toLowerCase();
  var CARD_SOURCES = ["kusogaki", "current-card"];
  var isCardContact = (c) => !!c && CARD_SOURCES.includes(c.source);
  var ContactNameError = class extends Error {
    constructor(message, { code = "duplicate", existingId = "", name = "" } = {}) {
      super(message);
      this.name = "ContactNameError";
      this.code = code;
      this.existingId = existingId;
      this.contactName = name;
    }
  };
  function findByName(s, name, exceptId = "") {
    const k = nameKey(name);
    return k ? s.contacts.find((c) => c.id !== exceptId && nameKey(c.name) === k) || null : null;
  }
  function uniqueName(s, name, exceptId = "") {
    const base = text(name, 34);
    let out = base, n = 2;
    while (findByName(s, out, exceptId)) out = `${base}（${n++}）`;
    return out;
  }
  function assertNameFree(s, name, exceptId = "") {
    const clean = text(name, 40);
    if (!clean) throw new ContactNameError("请填写姓名", { code: "empty" });
    const dup = findByName(s, clean, exceptId);
    if (dup) throw new ContactNameError(`通讯录里已经有「${dup.name}」了。可以打开它、合并到它，或换一个名字。`, { code: "duplicate", existingId: dup.id, name: clean });
    return clean;
  }
  function deepReplace(node, from, to) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i] === from) node[i] = to;
        else if (node[i] && typeof node[i] === "object") deepReplace(node[i], from, to);
      }
    } else if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        if (node[k] === from) node[k] = to;
        else if (node[k] && typeof node[k] === "object") deepReplace(node[k], from, to);
      }
    }
  }
  function deleteContact(s, contactId) {
    const c = s.contacts.find((x) => x.id === contactId);
    assert(c, "联系人不存在");
    const report = { threads: 0, messages: 0, groups: 0, posts: 0, comments: 0, agenda: 0 };
    s.contacts = s.contacts.filter((x) => x.id !== contactId);
    s.threads = s.threads.filter((t) => {
      if (t.kind === "direct" && t.members.length === 1 && t.members[0] === contactId) {
        report.threads++;
        report.messages += t.messages.length;
        return false;
      }
      return true;
    });
    for (const t of s.threads) if (t.members.includes(contactId)) {
      t.members = t.members.filter((m) => m !== contactId);
      t.messages = t.messages.filter((m) => m.author !== contactId);
      report.groups++;
    }
    s.threads = s.threads.filter((t) => t.members.length > 0);
    const live = new Set(s.threads.map((t) => t.id));
    s.summaries = s.summaries.filter((m) => !m.threadId || live.has(m.threadId));
    for (const m of s.memories) m.audience = (m.audience || []).filter((x) => x !== contactId);
    const before = s.feed.length;
    s.feed = s.feed.filter((p) => p.author !== contactId);
    report.posts = before - s.feed.length;
    for (const p of s.feed) {
      p.likes = (p.likes || []).filter((x) => x !== contactId);
      const n = (p.comments || []).length;
      p.comments = (p.comments || []).filter((x) => x.author !== contactId);
      report.comments += n - p.comments.length;
    }
    for (const a of s.agenda) if ((a.members || []).includes(contactId)) {
      a.members = a.members.filter((m) => m !== contactId);
      report.agenda++;
    }
    for (const p of s.plans) p.members = (p.members || []).filter((m) => m !== contactId);
    for (const n of s.notes) if (Array.isArray(n.people)) n.people = n.people.filter((m) => m !== contactId);
    for (const t of s.tasks) if (Array.isArray(t.people)) t.people = t.people.filter((m) => m !== contactId);
    if (s.automation?.lastActor === contactId) s.automation.lastActor = "";
    if (isCardContact(c)) {
      s.removedContacts = (s.removedContacts || []).filter((r) => r.id !== c.id);
      s.removedContacts.push({ id: c.id, name: c.name, source: c.source, ts: Date.now() });
      if (s.removedContacts.length > 300) s.removedContacts.splice(0, s.removedContacts.length - 300);
    }
    return report;
  }
  function mergeContacts(s, fromId, intoId) {
    const from = s.contacts.find((c) => c.id === fromId), into = s.contacts.find((c) => c.id === intoId);
    assert(from && into && from.id !== into.id, "无法合并：联系人不存在");
    assert(!isCardContact(from), "来自角色卡的人物不能被合并掉，请反过来合并");
    if (from.bio && from.bio.trim() && from.bio.trim() !== (into.bio || "").trim()) {
      const note = `〔并入「${from.name}」的补充〕
${from.bio.trim()}`;
      if (isCardContact(into)) into.extraNotes = text([into.extraNotes, note].filter(Boolean).join("\n\n"), 3e3);
      else into.bio = text([into.bio, note].filter(Boolean).join("\n\n"), 12e3);
    }
    if (!into.avatar && from.avatar) into.avatar = from.avatar;
    s.contacts = s.contacts.filter((c) => c.id !== fromId);
    for (const key of Object.keys(s)) {
      if (key === "contacts" || key === "removedContacts") continue;
      const v = s[key];
      if (v && typeof v === "object") deepReplace(v, fromId, intoId);
    }
    const direct = s.threads.filter((t) => t.kind === "direct" && t.members.length === 1 && t.members[0] === intoId);
    let merged = 0;
    if (direct.length > 1) {
      const keep = direct[0];
      for (const t of direct.slice(1)) {
        const seen = new Set(keep.messages.map((m) => m.id));
        for (const m of t.messages) if (!seen.has(m.id)) keep.messages.push(m);
        keep.messages.sort((a, b) => a.ts - b.ts);
        for (const p of t.pending) if (keep.pending.length < 12 && !keep.pending.some((x) => x.id === p.id)) keep.pending.push(p);
        keep.draft = keep.draft || t.draft || "";
        for (const m of s.summaries) if (m.threadId === t.id) m.threadId = keep.id;
        for (const m of s.memories) if (m.threadId === t.id) m.threadId = keep.id;
        merged++;
      }
      const drop = new Set(direct.slice(1).map((t) => t.id));
      s.threads = s.threads.filter((t) => !drop.has(t.id));
    }
    for (const t of s.threads) t.members = [...new Set(t.members)];
    return { merged };
  }
  var NAME_SUFFIX = /[\s_\-—–·•|｜]*(?:通用)?(?:人物设定|人物设置|人物档案|角色设定|角色档案|角色设置|人物卡|角色卡|人设|设定|档案|资料|简介|详情|解读)$/;
  var NAME_PREFIX = /^(?:人物设定|人物档案|角色设定|角色档案|人物|角色|人设|档案)[\s_\-—–:：·•|｜]+/;
  var NOT_A_NAME = /设定|规则|世界|系统|说明|剧情|事件|地点|时间线|指令|格式|状态栏|变量|开场|背景|概述/;
  function guessContactFromEntry(entry) {
    const label = String(entry?.name ?? entry?.comment ?? "").trim();
    const content = String(entry?.content ?? "");
    let name = label.replace(NAME_SUFFIX, "").replace(NAME_PREFIX, "").trim();
    const field2 = content.match(/(?:^|\n)[ \t]*[·•\-*]?[ \t]*(?:姓名|名字|全名|本名|Name)[ \t]*[:：][ \t]*([^\n（(【\[/／]{1,24})/i);
    const fieldName = field2 ? field2[1].trim() : "";
    const ageMatch = content.match(/(?:年龄|Age)[ \t]*[:：][ \t]*(\d{1,3})/i);
    const age = ageMatch ? Number(ageMatch[1]) : null;
    const unusable = !name || name.length > 24 || NOT_A_NAME.test(name) || /^[\d\s#\-_.·]+$/.test(name);
    if (fieldName && (unusable || fieldName.length > name.length && fieldName.includes(name))) name = fieldName;
    if (!name) name = fieldName || label;
    let score = 0;
    if (fieldName) score += 3;
    if (age !== null) score += 2;
    if (/人设|人物|角色|档案|设定/.test(label)) score += 2;
    if (/(?:性格|外貌|身份|职业|喜好|口癖|说话)/.test(content)) score += 1;
    if (NOT_A_NAME.test(label) && !fieldName) score -= 3;
    const person = score >= 3 && name.length > 0 && name.length <= 24;
    return { name: text(name, 40), age: age !== null && age >= 0 && age < 150 ? age : null, person, score, label, bio: content.trim() };
  }

