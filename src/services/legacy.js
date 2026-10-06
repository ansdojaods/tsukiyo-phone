  // src/services/legacy.js
  function inspectLegacy(raw) {
    const p = raw?.手机终端 || raw;
    safeJson(p);
    assert(isObject(p) && isObject(p.会话 || {}) && isObject(p.群聊 || {}), "旧手机记录结构不正确");
    assert(Object.hasOwn(p, "会话") || Object.hasOwn(p, "备忘") || Object.hasOwn(p, "群聊"), "未找到现有手机协议");
    return { phone: clone(p), signature: fingerprint(p), summary: { direct: Object.keys(p.会话 || {}).length, groups: Object.keys(p.群聊 || {}).length, notes: (p.备忘 || []).length, history: Object.keys(p.人物过往 || {}).length, photos: (p.留影 || []).length } };
  }
  function importLegacy(data, inspected, { active = true } = {}) {
    assert(!data.migration.includes(inspected.signature), "这份旧手机记录已经导入，不会重复叠加");
    const p = inspected.phone;
    limitAppend(data.legacyArchive, { id: id("legacy"), createdAt: Date.now(), kind: "原手机完整只读归档", data: clone(p) }, 20, "旧手机归档");
    data.migration.push(inspected.signature);
    if (!active) return { archived: true };
    function contact(name) {
      let c = data.contacts.find((c2) => c2.name === name);
      if (!c) c = addContact(data, { name, id: "legacy-" + fingerprint(name), bio: "旧手机导入。未确认属于当前剧情前，保持锁定。", recognized: false, reachable: false, source: "legacy-pending", age: null });
      return c;
    }
    function thread(name, members, rows, group) {
      const ids = [...new Set(members.map((n) => contact(n).id))];
      assert(ids.length <= 12, "旧群聊人数过多，已保留原件，请分组导入");
      const existing = data.threads.find((t2) => !group && t2.kind === "direct" && t2.members[0] === ids[0] || group && t2.id === "legacy-thread-" + fingerprint([name, group]));
      const t = existing || { id: "legacy-thread-" + fingerprint([name, group]), kind: group ? "group" : "direct", title: name, members: ids, messages: [], pending: [], draft: "", muted: false, createdAt: Date.now() };
      for (const [i, m] of (Array.isArray(rows) ? rows : []).entries()) {
        if (!["u", "c"].includes(m?.r)) continue;
        const role = m.r === "u" ? "user" : "character", from = role === "user" ? "user" : contact(m.from || members[0]).id;
        if (role === "character" && !t.members.includes(from)) {
          assert(t.members.length < 12, "历史群成员超过支持范围");
          t.members.push(from);
          t.muted = true;
          t.historyMembersNote = "保留曾参与的发言者；发送前请核对成员。";
        }
        const messageId = "legacy-message-" + fingerprint([name, group, i, m]);
        if (t.messages.some((x) => x.id === messageId)) continue;
        limitAppend(t.messages, { id: messageId, author: from, role, text: text(m.t, 4e3), kind: "text", ts: Number(m.ts) || Date.now(), story: "旧手机已发生交流", read: role === "user" || m.read === true, source: "legacy" }, 2400, "会话消息");
      }
      const pending = p.待发?.[(group ? "group:" : "direct:") + name] || [];
      for (const [i, value] of pending.entries()) {
        const pendingId = "legacy-pending-" + fingerprint([name, i, value]);
        if (t.pending.some((x) => x.id === pendingId) || t.messages.some((x) => x.id === pendingId)) continue;
        limitAppend(t.pending, { id: pendingId, text: text(value, 2e3), kind: "text", ts: Date.now(), mediaId: "" }, 12, "待发消息");
      }
      t.messages.sort((a, b) => a.ts - b.ts);
      if (!existing) limitAppend(data.threads, t, 120, "会话");
      return t;
    }
    for (const [name, rows] of Object.entries(p.会话 || {})) thread(name, [name], rows, false);
    for (const [name, g] of Object.entries(p.群聊 || {})) {
      if (Array.isArray(g.成员) && g.成员.length) thread(name, g.成员, g.消息 || [], true);
    }
    for (const [key, values] of Object.entries(p.待发 || {})) {
      const match = key.match(/^(direct|group):(.+)$/);
      if (!match || !Array.isArray(values)) continue;
      const group = match[1] === "group", name = match[2];
      if (!group && !Object.hasOwn(p.会话 || {}, name)) thread(name, [name], [], false);
    }
    for (const [i, n] of (p.备忘 || []).entries()) {
      const noteId = "legacy-note-" + fingerprint([i, n]);
      if (data.notes.some((x) => x.id === noteId)) continue;
      limitAppend(data.notes, { id: noteId, title: "旧手机便签", text: text(n.t || n.text || n, 6e3), ts: Number(n.ts) || Date.now(), source: "legacy" }, 300, "备忘");
    }
    if (text(p.玩家行程, 6e3)) limitAppend(data.notes, { id: id("legacy-plan"), title: "旧手机未执行行程", text: text(p.玩家行程, 6e3), ts: Date.now(), source: "未执行计划" }, 300, "备忘");
    for (const [name, h] of Object.entries(p.人物过往 || {})) {
      const c = contact(name);
      if (Array.isArray(h?.entries)) c.history = clone(h.entries);
    }
    for (const [key, m] of Object.entries(p.记忆 || {})) {
      const name = key.slice(2), group = key.startsWith("G:");
      const t = data.threads.find((t2) => t2.title === name && t2.kind === (group ? "group" : "direct"));
      if (!t) continue;
      if (text(m.摘要, 1500)) limitAppend(data.summaries, { id: id("legacy-summary"), threadId: t.id, text: text(m.摘要, 1500), coveredId: t.messages.at(-1)?.id || "", sourceIds: [], ts: Date.now(), source: "旧手机摘要，仅作参考" }, 500, "摘要");
      for (const a of m.约定 || []) {
        const title = typeof a === "string" ? a : a.text;
        if (!title) continue;
        limitAppend(data.agenda, { id: id("legacy-agenda"), title: text(title, 160), date: "", time: "", members: t.members, status: ["completed", "cancelled"].includes(a.status) ? a.status : "proposed", note: "旧手机约定；没有自动补造日期或完成状态", source: "legacy" }, 300, "日程");
      }
    }
    return { archived: true, imported: true };
  }

