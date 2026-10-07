  // src/ui/commands.js
  function snapshot(ui) {
    return ui.engine.repo.taskSnapshot();
  }
  function still(ui, snap) {
    assert(ui.engine.bridge.same(snap), "确认期间聊天/分支已变化；没有保存到另一个存档");
  }
  async function change(ui, fn, label, snap = null) {
    return ui.engine.repo.mutate(fn, { label, snapshot: snap || ui.engine.bridge.capture() });
  }
  async function askText(ui, title, label, { value = "", max = 4e3, multiline = true, submit = "保存" } = {}) {
    const result = await ui.dialog(title, field(label, "value", value, { textarea: multiline, max, required: true }), { submit });
    return result ? text(result.value, max) : null;
  }
  function namedThread(ui, id2) {
    const t = ui.data?.threads.find((t2) => t2.id === id2);
    assert(t, "会话不存在");
    return t;
  }
  function download(ui, name, data) {
    downloadJson(ui.win, name, data);
    ui.notify("已请求下载，请实际确认文件已保存。");
  }
  function downloadText(ui, name, value, mime = "text/markdown;charset=utf-8") {
    const blob = new ui.win.Blob([String(value ?? "")], { type: mime }), url = ui.win.URL.createObjectURL(blob), a = ui.win.document.createElement("a");
    a.href = url;
    a.download = name;
    ui.win.document.body.append(a);
    a.click();
    a.remove();
    ui.win.setTimeout(() => ui.win.URL.revokeObjectURL(url), 1e3);
    ui.notify("已请求下载 " + name + "，请确认文件已保存。");
  }
  var DUMP_MEMORY_KINDS = { phone_fact: "手机交流事实", narrative_fact: "正文事实", promise: "未完约定", manual: "手工记忆" };
  function flatLine(v, max = 1200) {
    return text(String(v ?? "").replace(/\s*\n+\s*/g, " "), max);
  }
  /** 主动来信冷却：把最近几次主动来信摘录进提示词，要求换话题、换开场，别重复同一件事。 */
  function proactiveCooldownNote(s) {
    const n2 = Math.round(clamp(s?.settings?.auto?.proactiveCooldown ?? 6, 0, 30));
    if (!n2) return "";
    const rows = (s.automation?.proactiveLog || []).slice(-n2);
    if (!rows.length) return "";
    return "\n最近几次主动来信（尽量换话题、换开场，不要重复同一件事或同一句话）：" + rows.map((r2) => "「" + r2.name + "：" + text(r2.text, 60) + (r2.reason ? "（" + text(r2.reason, 40) + "）" : "") + "」").join("；");
  }
  /** 可读导出：把手机里的记录整理成一份 Markdown（不含图片像素、不含 API 密钥）。 */
  function phoneReadableDump(s) {
    const L = [], story = s.manualStory || {}, hearts = s.diary.filter((d) => d.kind === "heart"), diary = s.diary.filter((d) => d.kind !== "heart");
    const msgCount = s.threads.reduce((n2, t) => n2 + (t.messages || []).length, 0);
    L.push("# 月夜来信 · 小手机数据导出", "", "- 导出时间：" + new Date().toLocaleString("zh-CN", { hour12: false }));
    if (story.date || story.time || story.place) L.push("- 剧情时间：" + [story.date, story.time, story.place].filter(Boolean).join(" · "));
    L.push("- 统计：联系人 " + s.contacts.length + " · 会话 " + s.threads.length + "（消息 " + msgCount + "） · 记忆 " + s.memories.length + " · 日记 " + diary.length + " · 恋爱心迹 " + hearts.length + " · 约定 " + s.agenda.length + " · 备忘 " + s.notes.length + " · 清单 " + s.tasks.length + " · 地点 " + s.places.length + " · 动态 " + s.feed.length + " · 规划 " + s.plans.length + " · 灵魂链接 " + Object.keys(soulData(s).roster).length + " 人");
    L.push("", "> 这是给人看的可读导出，用于备份、排查与迁移；图片像素与 API 密钥不在此文件内。", "");
    L.push("## 一、联系人（" + s.contacts.length + "）", "");
    for (const c of s.contacts) {
      L.push("### " + c.name + (c.age == null ? "" : "（" + c.age + " 岁）"), "");
      L.push("- 状态：" + flatLine(c.status, 240));
      L.push("- 可联系：" + (contactAvailable(c) ? "是" : "否") + " · 允许主动来信：" + (c.proactive === false ? "否" : "是") + " · 场外参考正文：" + (c.allowNarrative ? "是" : "否") + " · 来源：" + (c.source || "manual"));
      if (c.bio) L.push("- 人设：" + flatLine(c.bio, 2000));
      if (c.extraNotes) L.push("- 补充：" + flatLine(c.extraNotes, 1000));
      for (const r2 of c.references || []) L.push("- 参考资料《" + (r2.book || "未注明") + "》" + (r2.name || "") + "：" + flatLine(r2.content, 1000));
      for (const h of c.history || []) L.push("- 经历 · " + (h.title || "未命名") + (h.time ? "（" + h.time + "）" : "") + "：" + flatLine(h.text, 800));
      L.push("");
    }
    L.push("## 二、会话摘录", "");
    for (const t of s.threads) {
      const all = t.messages || [], msgs = all.slice(-200);
      L.push("### " + (t.title || "未命名会话") + "（" + (t.kind === "group" ? "群聊" : "私聊") + " · " + msgs.length + "/" + all.length + " 条）", "");
      for (const m of msgs) {
        const who = m.role === "user" ? "我" : contactName(s, m.author) !== "未知联系人" ? contactName(s, m.author) : m.authorName || "角色";
        L.push("- [" + (m.story || new Date(m.ts || Date.now()).toLocaleString("zh-CN", { hour12: false })) + "] " + who + "：" + flatLine(m.text, 1200));
      }
      L.push("");
    }
    L.push("## 三、记忆（" + s.memories.length + "）", "");
    for (const m of s.memories) {
      L.push("### [" + (DUMP_MEMORY_KINDS[m.kind] || m.kind) + "] " + (m.title || "未命名"));
      L.push("- 状态：" + (m.enabled === false ? "已停用" : "启用") + " · " + (m.resolved ? "已解决" : "未解决") + (m.summary ? " · 剧情概要" : "") + (m.keys?.length ? " · 关键词：" + m.keys.join("、") : ""));
      L.push("- 正文：" + flatLine(m.text, 2000));
      const src = (m.sources || []).map((x) => [x.quote ? "原话：" + flatLine(x.quote, 200) : "", x.note ? flatLine(x.note, 200) : "", x.floor !== void 0 ? "#" + (x.floor + 1) + "楼" : ""].filter(Boolean).join(" / ")).filter(Boolean);
      if (src.length) L.push("- 来源：" + src.join("；"));
      L.push("");
    }
    L.push("## 四、日记与恋爱心迹（" + diary.length + " + " + hearts.length + "）", "");
    for (const d of [...s.diary].reverse()) {
      const who = !d.author || d.author === "user" ? "我" : contactName(s, d.author) !== "未知联系人" ? contactName(s, d.author) : d.authorName || "角色";
      L.push("### " + (d.kind === "heart" ? "[心迹 #" + ((d.floor ?? 0) + 1) + "楼]" : "[日记]") + " " + (d.title || "未命名") + " · " + who + (d.date ? " · " + d.date : ""));
      L.push(flatLine(d.text, 2000), "");
    }
    L.push("## 五、约定与日程（" + s.agenda.length + "）", "");
    for (const a2 of s.agenda) L.push("- [" + (a2.date || "未定日期") + (a2.time ? " " + a2.time : "") + "] " + (a2.title || "未命名") + " · " + (a2.status || "") + (a2.note ? " · " + flatLine(a2.note, 400) : ""));
    if (s.agenda.length) L.push("");
    L.push("## 六、备忘 / 清单 / 地点 / 动态 / 规划", "");
    for (const n2 of s.notes) L.push("- [备忘] " + (n2.title || "未命名") + "：" + flatLine(n2.text || n2.note, 800));
    for (const t of s.tasks) L.push("- [清单] " + (t.title || "未命名") + (Number.isFinite(t.progress) ? "（进度 " + t.progress + "）" : "") + (t.note ? "：" + flatLine(t.note, 400) : ""));
    for (const p of s.places) L.push("- [地点] " + (p.name || p.title || "未命名") + (p.zone ? " · " + p.zone : "") + (p.note ? "：" + flatLine(p.note, 400) : ""));
    for (const f of s.feed) L.push("- [动态] " + (f.title || "未命名") + "：" + flatLine(f.text, 800));
    for (const p of s.plans) L.push("- [规划] " + (p.title || "未命名") + " · " + (p.status || "") + (p.summary ? "：" + flatLine(p.summary, 600) : ""));
    const soulRows = Object.values(soulData(s).roster);
    if (soulRows.length) {
      L.push("", "## 七、灵魂链接档案（" + soulRows.length + " 人）", "");
      for (const row of soulRows) {
        L.push("### " + row.name + (row.aliases?.length ? "（" + row.aliases.join("、") + "）" : ""), "");
        for (const key of SOUL_SECTIONS) {
          const rows = (row.sections?.[key] || []).map((x) => x.text + (x.floor >= 0 ? "（#" + (x.floor + 1) + "楼）" : ""));
          if (rows.length) L.push("- 【" + key + "】" + rows.join("；"));
        }
        L.push("");
      }
    }
    return { filename: "月夜来信-手机数据-" + new Date().toISOString().slice(0, 10) + ".md", text: L.join("\n") + "\n" };
  }
  /** 单个联系人的“档案包”：资料 + 参考资料 + 经历 + 该角色的记忆 / 日记 / 心迹 / 约定 / 私聊记录。 */
  function contactPackFrom(s, contactId) {
    const c = s.contacts.find((x) => x.id === contactId);
    assert(c, "人物不存在");
    const name = c.name;
    const memories = s.memories.filter((m) => (m.keys || []).includes(name) || (m.audience || []).includes(c.id));
    const diary = s.diary.filter((d) => d.author === c.id || d.authorName && d.authorName === name);
    const agenda = s.agenda.filter((a2) => (a2.with || []).includes(c.id) || String(a2.title || "").includes(name));
    const threads = s.threads.filter((t) => t.kind === "direct" && t.members[0] === c.id).map((t) => ({ title: t.title, messages: clone(t.messages || []).slice(-200) }));
    return {
      app: "tsukiyo-phone",
      kind: "contact-pack",
      version: VERSION,
      exportedAt: new Date().toISOString(),
      story: clone(s.manualStory || {}),
      contact: { name, age: c.age, bio: c.bio, extraNotes: c.extraNotes || "", status: c.status, color: c.color, recognized: c.recognized !== false, reachable: c.reachable !== false, allowNarrative: c.allowNarrative === true, references: clone(c.references || []), history: clone(c.history || []) },
      memories: clone(memories),
      diary: clone(diary),
      agenda: clone(agenda),
      threads
    };
  }
  /** 把档案包并进当前手机：同名不重复建人，资料与记忆按内容去重合并；不会搬来别的卡的世界书链接。 */
  function applyContactPack(s, pack) {
    assert(isObject(pack) && isObject(pack.contact) && text(pack.contact.name, 40), "档案包缺少联系人资料");
    const src = pack.contact, name = text(src.name, 40), stats = { name, contact: false, memories: 0, diary: 0, agenda: 0, messages: 0 };
    let c = s.contacts.find((x) => x.name === name);
    if (!c) {
      c = addContact(s, { name, age: src.age, bio: src.bio, status: src.status, color: src.color, recognized: src.recognized !== false, reachable: src.reachable !== false && (src.age == null || src.age >= 12), allowNarrative: src.allowNarrative === true, history: Array.isArray(src.history) ? src.history : [], source: "pack" });
      stats.contact = true;
    } else {
      const refs = Array.isArray(c.references) ? c.references.slice() : [];
      for (const r2 of src.references || []) if (isObject(r2) && !refs.some((x) => x.name === r2.name && x.book === r2.book)) refs.push(clone(r2));
      c.references = refs.slice(-20);
      const hist = Array.isArray(c.history) ? c.history.slice() : [];
      for (const h of src.history || []) if (isObject(h) && !hist.some((x) => x.title === h.title && x.text === h.text)) hist.push(clone(h));
      c.history = hist.slice(0, 40);
      if (src.extraNotes && !String(c.bio || "").includes(src.extraNotes)) c.bio = text([c.bio, src.extraNotes].filter(Boolean).join("\n\n"), 12e3);
    }
    for (const m of pack.memories || []) {
      if (!isObject(m) || !m.text || s.memories.length >= 1e3) continue;
      if (s.memories.some((x) => x.text === m.text)) continue;
      const keys = [...new Set([...(Array.isArray(m.keys) ? m.keys : []).filter((k) => typeof k === "string" && k !== name), name])].slice(0, 12);
      s.memories.push({ id: id("memory"), kind: ["phone_fact", "narrative_fact", "promise", "manual"].includes(m.kind) ? m.kind : "manual", title: text(m.title || name + " 的档案包记忆", 80), text: text(m.text, 6e3), keys, enabled: true, audience: ["user"], visibility: "private", sources: [{ note: "来自联系人档案包" }], resolved: false, ts: Date.now() });
      stats.memories++;
    }
    for (const d of pack.diary || []) {
      if (!isObject(d) || !d.text || s.diary.length >= 500) continue;
      if (s.diary.some((x) => x.kind === d.kind && x.text === d.text)) continue;
      s.diary.push({ id: id("diary"), kind: d.kind === "heart" ? "heart" : "diary", author: c.id, authorName: name, title: text(d.title || "档案包日记", 80), text: text(d.text, 6e3), date: text(d.date, 40), floor: Number.isInteger(d.floor) ? d.floor : null, ts: Date.now() });
      stats.diary++;
    }
    for (const a2 of pack.agenda || []) {
      if (!isObject(a2) || !a2.title || s.agenda.length >= 300) continue;
      if (s.agenda.some((x) => x.title === a2.title && x.date === a2.date)) continue;
      s.agenda.push({ id: id("agenda"), title: text(a2.title, 160), date: text(a2.date, 40), time: text(a2.time, 20), note: text(a2.note, 1e3), status: ["proposed", "confirmed", "completed", "cancelled", "event"].includes(a2.status) ? a2.status : "proposed", with: [c.id], ts: Date.now() });
      stats.agenda++;
    }
    for (const t of pack.threads || []) {
      if (!isObject(t) || !contactAvailable(c)) break;
      const rows = (t.messages || []).filter((m) => isObject(m) && m.text).slice(-200);
      if (!rows.length) continue;
      const th = s.threads.find((x) => x.kind === "direct" && x.members[0] === c.id) || ensureThread(s, [c.id]);
      for (const m of rows) {
        if (th.messages.some((x) => x.role === m.role && x.text === m.text)) continue;
        th.messages.push({ id: id("message"), role: m.role === "user" ? "user" : "character", author: m.role === "user" ? null : c.id, text: text(m.text, 1600), kind: "text", ts: Number.isFinite(m.ts) ? m.ts : Date.now(), story: text(m.story, 60), read: true, source: "pack" });
        stats.messages++;
      }
      th.messages = th.messages.slice(-2400);
    }
    return stats;
  }

  async function send(ui, threadId, { queueOnly = false } = {}) {
    const snap = snapshot(ui), t = namedThread(ui, threadId);
    if (!queueOnly && ui.engine.soul) await ui.engine.soul.beforePhoneSend(t).catch(() => {
    });
    const input = ui.shadow.getElementById("phone-composer");
    // 【2.9.6】记下发送前焦点在不在输入框：在的话发完立刻还给它（手机键盘不闪、不断输入法）
    const hadFocus = !!input && ui.shadow.activeElement === input;
    const value = text(input?.dataset.thread === t.id ? input.value : ui.draftFor(t), 2e3);
    if (value) {
      await change(ui, (s) => queueMessage(s, t.id, value), queueOnly ? "暂存待发消息" : "准备发送", snap);
      ui.setDraft(t, "");
      if (hadFocus) ui.focusComposer();
    }
    still(ui, snap);
    const latest = namedThread(ui, threadId);
    assert(latest.pending.length, "请先写一句消息");
    if (queueOnly) {
      ui.notify("已暂存，尚未发给模型。");
      return;
    }
    await ui.engine.actions.reply(threadId);
  }
  function contactBody(c, locked, v = {}) {
    const val = (k, d) => v[k] !== void 0 ? v[k] : d;
    return (locked ? hint("这位人物来自角色卡：原姓名、年龄、人设保持原卡控制。你可以新增备注；不需要时也可以在人物页把 ta 从通讯录移除（之后能恢复）。") + `<h4>${e(c.name)}</h4>` : field("姓名", "name", val("name", c?.name || ""), { required: true, max: 40 }) + field("年龄（不知道可留空）", "age", val("age", c?.age ?? ""), { type: "number" })) + (locked ? field("新增补充，不替换原人设", "extraNotes", val("extraNotes", c.extraNotes || ""), { textarea: true, max: 3e3 }) : field("人物设定", "bio", val("bio", c?.bio || ""), { textarea: true, max: 12e3 }) + field("当前状态 / 独立事务", "status", val("status", c?.status || ""), { max: 240 }) + checkbox("已经相认（作者手动确认）", "recognized", val("recognized", c?.recognized !== false)) + checkbox("已建立联系方式（12岁以下仍不直接联系）", "reachable", val("reachable", c?.reachable !== false))) + checkbox("允许此人主动来信", "proactive", val("proactive", c?.proactive !== false)) + checkbox("允许场外参考正文（仅在你确认此人确实知情时开启）", "allowNarrative", val("allowNarrative", c?.allowNarrative === true));
  }
  var sourceLabel = (c) => isCardContact(c) ? "来自角色卡" : c.source === "worldbook" ? "从世界书导入" : "手动添加";
  async function editContact(ui, contactId) {
    const snap = snapshot(ui), c = ui.data.contacts.find((c2) => c2.id === contactId), locked = isCardContact(c);
    let draft = {};
    for (let round = 0; round < 8; round++) {
      const result = await ui.dialog(c ? "人物资料" : "添加联系人", contactBody(c, locked, draft), { submit: "保存资料" });
      if (!result) return;
      still(ui, snap);
      draft = result;
      let name = "", allowDuplicate = false;
      if (!locked) {
        name = text(result.name, 40);
        assert(name, "请填写姓名");
        const dup = findByName(ui.data, name, contactId);
        if (dup) {
          const suffixed = uniqueName(ui.data, name, contactId);
          const choice = await ui.dialog("通讯录里已经有「" + dup.name + "」", `<p class="copy">你填写的名字和现有联系人重名（${sourceLabel(dup)}）。你的输入不会丢，可以选择：</p>${c ? `<p class="tiny muted">「合并」会把当前这位的聊天、动态、日程并进「${e(dup.name)}」，然后删掉当前这位。</p>` : ""}`, { choices: c ? [["merge", "合并进「" + dup.name + "」", "primary"], ["retry", "换个名字"], ["cancel", "取消"]] : [["open", "打开「" + dup.name + "」", "primary"], ["dup", "仍然新建为「" + suffixed + "」"], ["retry", "换个名字"], ["cancel", "取消"]] });
          still(ui, snap);
          const pick = choice?.choice;
          if (!pick || pick === "cancel") return;
          if (pick === "retry") continue;
          if (pick === "open") {
            ui.go("contact", dup.id);
            return;
          }
          if (pick === "merge") {
            await change(ui, (s) => {
              const target = s.contacts.find((x) => x.id === contactId);
              assert(target, "联系人已变化");
              target.bio = text(result.bio, 12e3);
              mergeContacts(s, contactId, dup.id);
            }, "合并联系人", snap);
            ui.notify("已合并到「" + dup.name + "」：聊天、动态和日程都并过去了。");
            ui.go("contact", dup.id);
            return;
          }
          allowDuplicate = true;
          name = suffixed;
        }
      }
      let created = contactId;
      await change(ui, (s) => {
        if (c) {
          const target = s.contacts.find((x) => x.id === contactId);
          assert(target, "联系人已变化");
          if (locked) target.extraNotes = text(result.extraNotes, 3e3);
          else {
            target.name = name;
            target.age = result.age === "" ? null : Math.round(Number(result.age));
            target.bio = text(result.bio, 12e3);
            target.status = text(result.status, 240);
            target.recognized = !!result.recognized;
            target.reachable = !!result.reachable && (target.age === null || target.age >= 12);
          }
          target.proactive = !!result.proactive;
          target.allowNarrative = !!result.allowNarrative;
        } else {
          const row = addContact(s, { ...result, name }, { allowDuplicate });
          created = row.id;
        }
      }, "保存人物增补", snap);
      if (allowDuplicate) ui.notify("已新建为「" + name + "」，之后可以随时改名。");
      ui.go("contact", created);
      return;
    }
  }
  async function importWorldbookContacts(ui) {
    const bridge = ui.engine.bridge;
    assert(bridge.wbSupported?.(), "需要酒馆助手的世界书接口（getWorldbook）；请确认已启用酒馆助手");
    const [names3, bind] = await Promise.all([bridge.wbNames(), bridge.wbBindings().catch(() => ({ primary: null, additional: [], chat: null }))]);
    assert(names3.length, "酒馆里还没有世界书");
    const bound = [...new Set([bind.primary, ...bind.additional, bind.chat].filter(Boolean))].filter((n) => names3.includes(n));
    const books = [...bound, ...names3.filter((n) => !bound.includes(n))];
    const first = await ui.dialog("从世界书导入联系人", hint("先选一本世界书，下一步勾选要导入的人物。只读取世界书，不会修改它。") + select("世界书", "book", books.map((n) => [n, n + (bound.includes(n) ? "（当前角色卡已绑定）" : "")]), books[0]), { submit: "下一步" });
    if (!first?.book) return;
    const book = first.book, snap = snapshot(ui);
    const rows = (await bridge.wbRead(book)).filter((r2) => String(r2.content ?? "").trim());
    still(ui, snap);
    assert(rows.length, "这本世界书里没有可读的条目");
    const existing = ui.data.contacts;
    const cands = rows.map((r2) => ({ row: r2, ...guessContactFromEntry(r2) })).filter((x) => x.name).map((x) => {
      const have = existing.find((c) => c.wb && c.wb.book === book && c.wb.uid === x.row.uid) || findByName(ui.data, x.name);
      return { ...x, key: String(x.row.uid ?? x.row.id), have };
    }).sort((a, b) => Number(b.person) - Number(a.person) || b.score - a.score);
    const items = cands.map((x) => ({ id: x.key, name: x.name, hint: x.label, note: [x.person ? "疑似人物" : "", x.age !== null ? x.age + "岁" : "", x.have ? "已在通讯录" : "", x.label !== x.name ? "条目：" + x.label : "", text(x.bio.replace(/\s+/g, " "), 46)].filter(Boolean).join(" · ") }));
    const picked = cands.filter((x) => x.person && !x.have).map((x) => x.key);
    const r = await ui.dialog("选择要导入的人物 · " + book, `${hint("共 " + cands.length + " 个条目，已默认勾选“疑似人物”。名字取自条目标题或“姓名：”字段，导入后仍可改；已经在通讯录里的不会重复导入。")}<div class="pick-tools">${`<button type="button" class="btn" data-action="pick-present" data-id="${e(picked.join(","))}">只选疑似人物</button>`}<button type="button" class="btn" data-action="pick-all">全选</button><button type="button" class="btn" data-action="pick-none">清空</button></div>${filterBox("搜索姓名 / 条目名…")}${peopleChecks(items, { checked: picked, disabled: new Set(cands.filter((x) => x.have).map((x) => x.key)) })}`, { submit: "导入所选" });
    if (!r) return;
    const chosen = cands.filter((x) => (r.members || []).includes(x.key) && !x.have);
    assert(chosen.length, "没有勾选可导入的人物");
    still(ui, snap);
    let added = 0;
    await change(ui, (s) => {
      for (const x of chosen) {
        addContact(s, { name: x.name, age: x.age, bio: text(x.bio, 12e3), source: "worldbook", wb: { book, uid: x.row.uid ?? x.row.id }, status: "来自世界书「" + book + "」", allowNarrative: false }, { allowDuplicate: true });
        added++;
      }
    }, "从世界书导入联系人", snap);
    ui.notify("已导入 " + added + " 位人物。默认已相认、可联系；不需要的可以在人物页删除。");
  }
  var presentIds = (ui) => ui.data.contacts.filter((c) => ui.snapshot.present?.includes(c.name)).map((c) => c.id);
  var pickItem = (c) => ({ id: c.id, name: c.name, note: c.age != null ? c.age + "岁" : "" });
  var syncNote = (r) => {
    if (!r) return "同步已排队，稍后完成。";
    const st = r.stats, wrote = st.created + st.updated + st.deletedWB, got = st.pulled + st.imported + st.deleted;
    if (!wrote && !got && !st.guarded) return "已是最新，没有需要同步的内容。";
    return "同步完成：写入世界书 " + wrote + " 条，从世界书取回 " + (st.pulled + st.imported) + " 条" + (st.deleted ? "，手机删除 " + st.deleted + " 条" : "") + (st.conflicts ? "；" + st.conflicts + " 条两边都改过，已采用世界书版本" : "") + (st.guarded ? "；世界书里有 " + st.guarded + " 条被删，等你确认" : "") + "。";
  };
  async function memoryEditor(ui, memoryId) {
    const snap = snapshot(ui), m = ui.data.memories.find((x) => x.id === memoryId);
    assert(!memoryId || m, "记忆已变化");
    const people = ui.data.contacts, aud = new Set(m ? m.audience : ["user"]);
    const r = await ui.dialog(m ? "编辑记忆" : "新增记忆", field("标题（可留空，自动取开头）", "title", m?.title || "", { max: 120 }) + field("确实发生的事", "body", m?.text || "", { textarea: true, required: true, max: 8e3 }) + field("触发关键词（逗号分隔；留空 = 常驻，每次都进正文）", "keys", (m?.keys || []).join("，"), { max: 1e3 }) + (m ? "" : field("依据 / 来源", "source", "", { textarea: true, required: true, max: 300 })) + `<div class="section-label">知情人（勾选；一个都不选则只有玩家知道）</div><div class="checks"><label class="checkbox-label"><input type="checkbox" name="members" value="user" ${aud.has("user") ? "checked" : ""}><span>玩家</span></label>${people.map((c) => `<label class="checkbox-label"><input type="checkbox" name="members" value="${e(c.id)}" ${aud.has(c.id) ? "checked" : ""}><span>${e(c.name)}</span></label>`).join("")}</div>` + checkbox("此信息已经公开（其他角色也能在动态里引用）", "public", m?.visibility === "public") + checkbox("启用（关闭后不会进入正文，也不会被角色引用）", "enabled", m ? m.enabled !== false : true));
    if (!r) return;
    still(ui, snap);
    const body = text(r.body, 8e3);
    assert(body, "内容不能为空");
    const audience = (r.members || []).length ? r.members : ["user"];
    await change(ui, (s) => {
      if (m) {
        const t = s.memories.find((x) => x.id === memoryId);
        assert(t, "记忆已变化");
        Object.assign(t, { title: text(r.title, 120), text: body, keys: cleanKeys(r.keys), audience, visibility: r.public ? "public" : "private", enabled: !!r.enabled });
      } else limitAppend(s.memories, { id: id("memory"), kind: "manual", title: text(r.title, 120), text: body, keys: cleanKeys(r.keys), enabled: !!r.enabled, audience, visibility: r.public ? "public" : "private", sources: [{ note: text(r.source, 300) }], resolved: false, ts: Date.now() }, 1e3, "记忆");
    }, m ? "编辑记忆" : "新增手工记忆", snap);
  }
  async function newGroup(ui) {
    const snap = snapshot(ui), people = ui.data.contacts.filter(contactAvailable);
    assert(people.length >= 2, "至少要有两位可联系的人物");
    const r = await ui.dialog("建一个小群", field("群名", "title", "", { required: true, max: 60 }) + `<div class="checks">${people.map((c) => `<label class="checkbox-label"><input type="checkbox" name="members" value="${e(c.id)}"><span>${e(c.name)}</span></label>`).join("")}</div>`);
    if (!r) return;
    still(ui, snap);
    let groupId;
    await change(ui, (s) => {
      groupId = ensureThread(s, r.members, { title: r.title, group: true }).id;
    }, "创建群聊", snap);
    ui.go("chat", groupId);
  }
  async function newPost(ui) {
    const snap = snapshot(ui);
    const r = await ui.dialog("发一条生活动态", field("今天想说的小事", "body", "", { textarea: true, required: true, max: 1500 }) + select("装饰配色（不是实际照片）", "theme", [["none", "纯文字"], ["rain", "雨天与远山"], ["coffee", "柔和的下午"], ["sky", "晴空"]], "none") + select("附一张相册照片（可选）", "mediaId", [["", "不附图"], ...ui.data.album.map((a) => [a.mediaId, a.title || "留影"])], ""));
    if (!r) return;
    still(ui, snap);
    await change(ui, (s) => limitAppend(s.feed, { id: id("post"), author: "user", text: text(r.body, 1500), theme: r.mediaId ? "none" : r.theme, mediaId: r.mediaId || "", likes: [], comments: [], ts: Date.now(), story: storyFor(s, snap).date, source: "player" }, 500, "朋友圈"), "玩家发布动态", snap);
  }
  async function pickContact(ui, title, { includeUser = false } = {}) {
    const contacts = ui.data.contacts.filter(contactAvailable);
    const choices = contacts.map((c) => [c.id, c.name]);
    if (includeUser) choices.unshift(["user", "自己"]);
    assert(choices.length, "还没有可用联系人");
    const result = await ui.dialog(title, select("人物", "contact", choices, choices[0][0]));
    return result?.contact || null;
  }
  async function newAgenda(ui) {
    const snap = snapshot(ui), world = storyFor(ui.data, snap);
    const r = await ui.dialog("留一个约定", field("内容", "title", "", { required: true, max: 160 }) + field("日期，可先不定", "date", world.date, { type: "date" }) + field("时间，可先不定", "time", "", { type: "time" }) + field("备注 / 参与者", "note", "", { textarea: true, max: 600 }) + select("当前状态", "status", [["proposed", "待商量，不是已经约好"], ["confirmed", "双方已明确确认"]], "proposed") + '<div class="section-label">明确参与者（不是自动替他们同意）</div><div class="checks">' + ui.data.contacts.filter((c) => c.recognized).map((c) => '<label class="checkbox-label"><input type="checkbox" name="members" value="' + e(c.id) + '"><span>' + e(c.name) + "</span></label>").join("") + "</div>");
    if (!r) return;
    if (r.date) isoDay(r.date);
    still(ui, snap);
    await change(ui, (s) => limitAppend(s.agenda, { id: id("agenda"), title: text(r.title, 160), date: r.date || "", time: r.time || "", note: text(r.note, 600), members: r.members || [], status: r.status, source: "玩家记录" }, 300, "日程"), "新增日程", snap);
  }
  async function noteEditor(ui, noteId) {
    const snap = snapshot(ui), row = ui.data.notes.find((n) => n.id === noteId);
    const r = await ui.dialog(row ? "编辑便签" : "写张便签", field("标题", "title", row?.title || "", { max: 80 }) + field("内容", "text", row?.text || "", { textarea: true, required: true, max: 6e3 }) + (row ? checkbox("删除此便签（不影响旧手机归档）", "remove", false) : ""));
    if (!r) return;
    still(ui, snap);
    await change(ui, (s) => {
      if (r.remove) {
        s.notes = s.notes.filter((x) => x.id !== noteId);
        return;
      }
      if (row) {
        const n = s.notes.find((x) => x.id === noteId);
        assert(n, "便签已不存在");
        Object.assign(n, { title: text(r.title, 80) || "无题", text: text(r.text, 6e3), ts: Date.now() });
      } else limitAppend(s.notes, { id: id("note"), title: text(r.title, 80) || "无题", text: text(r.text, 6e3), ts: Date.now() }, 300, "便签");
    }, "保存便签", snap);
  }
  async function diaryEditor(ui, diaryId) {
    const snap = snapshot(ui), row = ui.data.diary.find((n) => n.id === diaryId), world = storyFor(ui.data, snap);
    const isHeart = row?.kind === "heart";
    const r = await ui.dialog(row ? (isHeart ? "编辑恋爱心迹" : "读一篇日记") : "写一篇日记",
      field("标题", "title", row?.title || "", { required: true, max: 80 }) +
      field("剧情日期", "date", row?.date || world.date, { type: "date" }) +
      (isHeart ? field("情绪关键词", "mood", row?.mood || "", { max: 24 }) + field("心动指数", "heartbeat", row?.heartbeat || "", { max: 36 }) + field("本楼表面装作", "surface", row?.surface || "", { textarea: true, max: 240 }) + field("心底回应（致本楼的你）", "replyToFloor", row?.replyToFloor || "", { textarea: true, max: 400 }) : "") +
      field(isHeart ? "恋爱心迹独白" : "记录", "text", row?.text || "", { textarea: true, required: true, max: 6e3 }) +
      (isHeart ? field("未说出口的小秘密", "secret", row?.secret || "", { textarea: true, max: 260 }) : checkbox("我已核对，这篇不是未经确认的AI草稿", "confirmed", row?.status === "confirmed")) +
      (row ? checkbox(isHeart ? "删除这条恋爱心迹" : "删除这篇手机日记", "remove", false) : ""));
    if (!r) return;
    if (r.date) isoDay(r.date);
    still(ui, snap);
    await change(ui, (s) => {
      if (r.remove) {
        s.diary = s.diary.filter((x) => x.id !== diaryId);
        return;
      }
      const entry = {
        title: text(r.title, 80),
        date: r.date || "",
        text: text(r.text, 6e3),
        status: isHeart ? "confirmed" : (r.confirmed ? "confirmed" : "draft"),
        ts: Date.now(),
        ...(isHeart ? {
          mood: text(r.mood || row?.mood || "", 24),
          heartbeat: text(r.heartbeat || row?.heartbeat || "", 36),
          surface: text(r.surface || "", 240),
          replyToFloor: text(r.replyToFloor || "", 400),
          secret: text(r.secret || "", 260)
        } : {})
      };
      if (row) Object.assign(s.diary.find((x) => x.id === diaryId), entry);
      else limitAppend(s.diary, { id: id("diary"), ...entry, source: "玩家记录" }, 300, "日记");
    }, isHeart ? "保存恋爱心迹" : "保存日记", snap);
  }
  async function taskEditor(ui) {
    const snap = snapshot(ui);
    const r = await ui.dialog("一件慢慢完成的事", field("想做什么", "title", "", { required: true, max: 180 }) + field("分类", "category", "生活", { max: 40 }) + field("分成几步", "target", 1, { type: "number" }) + hint("这里记录实际进度，不因为点按钮就自动完成正文事件。"));
    if (!r) return;
    const target = Number(r.target);
    assert(Number.isInteger(target) && target >= 1 && target <= 100, "项目步数应为1—100");
    still(ui, snap);
    await change(ui, (s) => limitAppend(s.tasks, { id: id("task"), title: text(r.title, 180), category: text(r.category, 40), progress: 0, target, done: false, source: "玩家心愿" }, 300, "清单"), "新增生活目标", snap);
  }
  async function itemEditor(ui, itemId) {
    const snap = snapshot(ui), row = ui.data.items.find((x) => x.id === itemId);
    const r = await ui.dialog(row ? "物品记录" : "记录一件物品", field("名称", "title", row?.title || "", { required: true, max: 100 }) + field("数量", "quantity", row?.quantity ?? 1, { type: "number" }) + field("来源与备注", "note", row?.note || "", { textarea: true, max: 600 }) + hint("这是手机附注，不自动增减原卡背包。"));
    if (!r) return;
    const quantity = Number(r.quantity);
    assert(Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= 1e6, "数量应为非负整数");
    still(ui, snap);
    await change(ui, (s) => {
      const entry = { title: text(r.title, 100), quantity, note: text(r.note, 600), source: "手机手工记录" };
      if (row) Object.assign(s.items.find((x) => x.id === itemId), entry);
      else limitAppend(s.items, { id: id("item"), ...entry }, 300, "物品");
    }, "保存物品附注", snap);
  }
  async function uploadPhoto(ui, { avatarId = "", threadId = "" } = {}) {
    const snap = snapshot(ui), file = await ui.pickFile("image/png,image/jpeg,image/webp,image/gif", 10 * 1024 * 1024);
    if (!file) return;
    still(ui, snap);
    const title = await askText(ui, avatarId ? "头像说明" : "给这一刻写个名字", "标题 / 图片说明", { value: avatarId ? "人物头像" : file.name.replace(/\.[^.]+$/, ""), max: 120, multiline: false });
    if (title === null) return;
    still(ui, snap);
    const media = await ui.engine.media.upload(file, snap.owner);
    still(ui, snap);
    await change(ui, (s) => {
      if (avatarId) {
        const c = s.contacts.find((c2) => c2.id === avatarId);
        assert(c, "联系人已不存在");
        c.avatar = media.id;
      } else {
        limitAppend(s.album, { id: id("photo"), mediaId: media.id, title, ts: Date.now(), date: storyFor(s, snap).date }, 60, "相册");
        if (threadId) queueMessage(s, threadId, title, "image", media.id);
      }
    }, avatarId ? "保存头像" : "保存照片", snap);
    ui.notify(threadId ? "图片卡片已暂存。当前模型按文字说明交流，不进行图像识别。" : "图片已保存在手机专用图片库。");
  }
  function normalizeImageUrl(raw) {
    let u = String(raw || "").trim();
    if (!u) return "";
    const md = u.match(/^!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)$/) || u.match(/^<img[^>]+src=["']([^"']+)["']/i);
    if (md) u = md[1];
    const blob = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (blob) u = "https://raw.githubusercontent.com/" + blob[1] + "/" + blob[2] + "/" + blob[3];
    const raw2 = u.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/(.+)$/);
    if (raw2) u = "https://raw.githubusercontent.com/" + raw2[1] + "/" + raw2[2] + "/" + raw2[3];
    const gitee = u.match(/^https:\/\/gitee\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (gitee) u = "https://gitee.com/" + gitee[1] + "/" + gitee[2] + "/raw/" + gitee[3];
    assert(/^https?:\/\/[^\s"'<>]+$/i.test(u), "不是有效的图片网址：" + text(raw, 60));
    assert(u.length <= 2e3, "网址过长");
    return u;
  }
  function probeImage(win, url) {
    return new Promise((resolve) => {
      const img = new win.Image(), t = setTimeout(() => resolve(false), 12e3);
      img.onload = () => { clearTimeout(t); resolve(true); };
      img.onerror = () => { clearTimeout(t); resolve(false); };
      img.referrerPolicy = "no-referrer";
      img.src = url;
    });
  }
  async function addPhotoUrls(ui) {
    const snap = snapshot(ui);
    const r = await ui.dialog("用网址添加照片", field("图片网址（一行一个，最多 20 个）", "urls", "", { textarea: true, required: true, max: 4e4 }) + field("标题（可空；多张时自动编号）", "title", "", { max: 120 }) + `<p class="form-note">支持图床直链、GitHub（blob 链接会自动转成 raw 直链）、Gitee、jsDelivr、Markdown 图片 ![](网址)。图片不下载到本机，只保存网址；网址失效或需要登录时将无法显示。</p>`);
    if (!r) return;
    const lines = String(r.urls || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 20);
    assert(lines.length, "请至少填写一个网址");
    const urls = lines.map(normalizeImageUrl);
    const bad = [];
    for (const u of urls) if (!await probeImage(ui.win || window, u)) bad.push(u);
    if (bad.length && !await ui.confirm("有 " + bad.length + " 个网址暂时无法加载", bad.slice(0, 5).join("\n") + "\n\n可能是网址不是图片直链、需要登录或网络不通。仍然保存吗？")) return;
    const base = text(r.title || "", 120);
    await change(ui, (s) => {
      urls.forEach((u, i) => limitAppend(s.album, { id: id("photo"), mediaId: "url:" + u, url: u, title: base ? base + (urls.length > 1 ? " " + (i + 1) : "") : decodeURIComponent(u.split(/[?#]/)[0].split("/").pop() || "网络图片").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "网络图片", ts: Date.now(), date: storyFor(s, snap).date }, 60, "相册"));
    }, "用网址添加照片", snap);
    ui.notify("已添加 " + urls.length + " 张网址照片。");
  }
  async function cafeTools(ui) {
    const runtime = ui.engine.legacyRuntime();
    if (!runtime?.KG) {
      await ui.dialog("店务与真实变量", hint(ui.demo ? "演示模式可体验清单和日程；店务记账需要连接兼容角色卡，不制造假的变量写入。" : "当前卡没有兼容的店务控制器。你仍可使用生活清单；接入原卡控制器后才开放真实订单记账。"), { choices: [["ok", "知道了", "primary"]] });
      return;
    }
    const snap = snapshot(ui), s = runtime.read(), recipes = Object.entries(runtime.KG.RECIPES).map(([id2, r]) => [id2, r.name + " · ¥" + r.price + " / 成本¥" + r.cost]);
    const p = await ui.dialog("店务与合作工具", select("选择记录类型", "kind", [["order", "已经出餐的订单"], ["project", "已经做完的项目一步"], ["clue", "新发现的待核实线索"]], "order"));
    if (!p) return;
    still(ui, snap);
    if (p.kind === "order") {
      const r = await ui.dialog("记录实际订单", select("菜单", "recipe", recipes, recipes[0][0]) + hint("须在店内且获得许可。这里只结算正文已经实际出餐、尚未结算的订单。") + checkbox("我确认实际出餐，且尚未在正文/旧界面结算", "confirmed"));
      if (r) {
        still(ui, snap);
        await ui.engine.settleCafe(r.recipe, r.confirmed);
        ui.notify("已通过原卡控制器记账。");
      }
    }
    if (p.kind === "project") {
      const choices = Object.entries(s.生活.项目).map(([n, p2]) => [n, n + " " + p2.进度 + "/" + p2.目标]);
      const r = await ui.dialog("记下完成的一步", select("项目", "project", choices, choices[0][0]) + field("实际做完了什么", "note", "", { textarea: true, required: true, max: 300 }) + checkbox("这一步确实已经发生", "confirmed"));
      if (r) {
        still(ui, snap);
        await ui.engine.recordProject(r.project, r.note, r.confirmed);
      }
    }
    if (p.kind === "clue") {
      const r = await ui.dialog("线索板", field("线索", "title", "", { required: true, max: 120 }) + field("明确来源", "source", "", { textarea: true, required: true, max: 240 }));
      if (r) {
        still(ui, snap);
        await ui.engine.addClue(r.title, r.source);
      }
    }
  }
  async function restore(ui) {
    ui.engine.runner.cancel("准备恢复备份");
    const file = await ui.pickFile(".json,application/json");
    if (!file) return;
    const inspected = inspectBackup(JSON.parse(await file.text())), snap = snapshot(ui);
    const q = inspected.summary;
    const approved = await ui.confirm("校验通过，先备份当前手机", `这份文件包含：
${q.contacts}位联系人、${q.threads}个会话、${q.messages}条消息、${q.memories}条记忆、${q.plans}个方向、${q.media}张图片。

下一步先下载当前数据。还不会覆盖。${inspected.mediaIncluded ? "" : "\n注意：该文件不含完整图片。"}`, "下载当前备份");
    if (!approved) return;
    still(ui, snap);
    const current = await exportBackup(ui.engine.repo, ui.engine.media);
    download(ui, "月夜来信-恢复前备份.json", current);
    if (!await ui.confirm("确认备份确已下载", "程序不能保证文件已落盘。请检查“恢复前备份”已经下载，再执行覆盖。\n只恢复手机，主线正文和stat_data不改。后台将保持关闭。", "已经保存，执行恢复")) return;
    still(ui, snap);
    assert(fingerprint(ui.engine.repo.choose(snap)) === snap.phoneDigest, "确认期间手机有新消息/修改，未覆盖，请重新预览");
    await restoreBackup(ui.engine.repo, ui.engine.media, inspected, snap);
    ui.notify("已恢复并回读确认。后台保持关闭，请先核对配置。");
  }
  async function handleAction(ui, action, value, target) {
    const engine = ui.engine;
    if (value === "memories" && ["batch-delete-modal", "clear-module"].includes(action)) return reviewAction(ui, "review-memory-manage", action === "clear-module" ? "all" : "");
    if (action.startsWith("safe-") || action === "book-sync") return safetyAction(ui, action === "book-sync" ? "safe-sync" : action, value);
    if (action.startsWith("review-") || action === "soul-char-del") return reviewAction(ui, action, value);
    if (action.startsWith("center-")) return centerAction(ui, action, value);
    if (action.startsWith("st-")) return studioAction(ui, action, value);
    if (action.startsWith("avs-")) return handleVisualAction(ui, action, value);
    if (action.startsWith("arc-") || action.startsWith("diag-")) return handleArcAction(ui, action, value, target);
    switch (action) {
      case "go":
        ui.go(value);
        return;
      case "back":
        ui.back();
        return;
      case "refresh":
        await engine.refresh();
        return;
      case "thread":
        ui.go("chat", value);
        return;
      case "new-thread": {
        let threadId;
        await change(ui, (s) => {
          threadId = ensureThread(s, [value]).id;
        }, "开启会话");
        ui.go("chat", threadId);
        return;
      }
      case "contact":
        ui.go("contact", value);
        return;
      case "read-persona": {
        const c = ui.data.contacts.find((c2) => c2.id === value);
        assert(c, "人物不存在");
        assert(typeof engine.bridge.personaReferences === "function", "演示环境不读取真实酒馆世界书");
        const result = await engine.bridge.personaReferences(c.name);
        assert(result.rows.length, "当前绑定世界书没有找到明确匹配的人设条目，未扫描其他卡或猜测人物");
        if (await ui.confirm("补入人物参考？", "找到：" + result.rows.map((r) => r.book + " / " + r.name).join("、") + "。\n只新增到手机参考，不修改世界书或原人设。它们不是自动发生的当前事实。")) await change(ui, (s) => {
          const target2 = s.contacts.find((c2) => c2.id === value);
          assert(target2, "人物已变化");
          target2.references = target2.references || [];
          for (const r of result.rows) if (!target2.references.some((x) => x.id === r.id)) {
            assert(target2.references.length < 10, "参考资料已满，请先导出整理");
            target2.references.push(r);
          }
        }, "从本卡绑定世界书新增人设参考", result.snapshot);
        return;
      }
      case "new-group":
        return newGroup(ui);
      case "edit-contact":
        return editContact(ui, value);
      case "delete-contact": {
        const c = ui.data.contacts.find((x) => x.id === value);
        assert(c, "联系人不存在");
        const snap = snapshot(ui), probe = deleteContact(clone(ui.data), c.id);
        const yes = await ui.confirm("删除「" + c.name + "」？", "将从通讯录移除，并一并删除：私聊 " + probe.threads + " 个（" + probe.messages + " 条消息）、ta 的朋友圈动态 " + probe.posts + " 条，以及群聊 / 日程里对 ta 的引用。" + (isCardContact(c) ? "不会改动角色卡本身；以后可以在通讯录底部“已移除的角色卡人物”里恢复（聊天记录不会恢复）。" : "此操作无法撤销，建议先做一次备份。"), "删除");
        if (!yes) return;
        still(ui, snap);
        await change(ui, (s) => {
          deleteContact(s, c.id);
        }, "删除联系人", snap);
        ui.notify("已删除「" + c.name + "」。");
        ui.go("contacts", "", { replace: true });
        return;
      }
      case "import-wb-contacts":
        return importWorldbookContacts(ui);
      case "restore-contacts": {
        const rows = ui.data.removedContacts || [];
        assert(rows.length, "没有已移除的角色卡人物");
        const snap = snapshot(ui);
        const r = await ui.dialog("恢复角色卡人物", hint("勾选要放回通讯录的人物。恢复后按角色卡变量重新同步；他们原来的聊天记录不会恢复。") + pickTools() + peopleChecks(rows.map((x) => ({ id: x.id, name: x.name, note: x.source === "kusogaki" ? "月夜来信" : "当前角色卡" })), { checked: rows.map((x) => x.id) }), { submit: "恢复所选" });
        if (!r) return;
        assert(r.members?.length, "没有勾选人物");
        still(ui, snap);
        await change(ui, (s) => {
          restoreCardContacts(s, snap, r.members);
        }, "恢复角色卡人物", snap);
        ui.notify("已恢复 " + r.members.length + " 位人物。");
        return;
      }
      case "unlock-all": {
        const snap = snapshot(ui);
        await change(ui, (s) => {
          s.settings.unlockAll = !s.settings.unlockAll;
          syncHostContacts(s, snap);
        }, "角色卡人物解锁方式", snap);
        return;
      }
      case "module-toggle": {
        assert(Object.hasOwn(MODULES, value), "未知模块");
        const on = !engine.settings.isEnabled(value);
        engine.settings.setEnabled(value, on);
        ui.notify("「" + MODULES[value] + "」" + (on ? "已打开" : "已关闭：不会再调用它的 API"));
        return;
      }
      case "memory-book-create": {
        const mb = engine.memoryBook;
        assert(mb.supported(), "需要酒馆助手的世界书接口（createWorldbook / updateWorldbookWith）；请确认已启用酒馆助手");
        const r = await ui.dialog("创建记忆世界书", hint("会新建一本世界书，并追加绑定到当前角色卡（不动原有的世界书绑定）。手机里的记忆会写成条目，你可以在酒馆里直接修改，手机自动同步。") + field("世界书名称", "name", ui.data.memoryBook.name || defaultBookName(ui.snapshot, "card"), { required: true, max: 120 }) + select("范围", "scope", [["card", "整张角色卡共用（推荐：这张卡新开的聊天会自动连上同一本）"], ["chat", "只给当前聊天用（每个聊天一本，互不混）"]], "card"), { submit: "创建并同步" });
        if (!r) return;
        const name = r.scope === "chat" && r.name === defaultBookName(ui.snapshot, "card") ? defaultBookName(ui.snapshot, "chat") : r.name;
        try {
          const res = await mb.link({ name, scope: r.scope });
          ui.notify("记忆世界书「" + name + "」已创建并绑定。" + syncNote(res));
        } catch (err) {
          if (err.code !== "BOOK_EXISTS") throw err;
          ui.notify("同名世界书已存在，请预览后勾选需要读取的条目。");
          await reviewAction(ui, "review-memory-connect", err.book);
        }
        return;
      }
      case "memory-book-sync": {
        const res = await engine.memoryBook.sync({ reason: "manual", force: true });
        ui.notify(syncNote(res));
        return;
      }
      case "memory-book-generate": {
        const mb = engine.memoryBook;
        if (mb.supported() && !mb.info().linked) {
          const pick = await ui.dialog("生成记忆", `<p class="copy">还没有连接记忆世界书。生成的记忆可以只放在手机里，也可以先创建“${e(defaultBookName(ui.snapshot, "card"))}”，让记忆同时写进世界书。</p>`, { choices: [["book", "先创建世界书", "primary"], ["phone", "只放在手机里"], ["cancel", "取消"]] });
          if (!pick || pick.choice === "cancel") return;
          if (pick.choice === "book") {
            await handleAction(ui, "memory-book-create", "");
            if (!mb.info().linked) return;
          }
        }
        const r = await engine.actions.memoryBookGenerate();
        ui.notify("记忆已更新：新增 " + r.added + " 条" + (r.summary ? "，并更新了剧情概要" : "") + (mb.info().linked ? "；稍后自动同步进世界书。" : "。"));
        return;
      }
      case "memory-book-unlink":
        if (await ui.confirm("停止同步记忆世界书？", "手机和世界书从此互不影响；世界书本身和已同步的记忆都会保留。", "停止同步")) {
          await engine.memoryBook.unlink();
          ui.notify("已停止同步。");
        }
        return;
      case "memory-book-rebind":
        await engine.memoryBook.rebind();
        ui.notify("已重新绑定到当前角色卡/聊天。");
        return;
      case "memory-book-autosync":
        await engine.memoryBook.setAutoSync(!ui.data.memoryBook.autoSync);
        return;
      case "memory-book-rebuild":
        if (await ui.confirm("以手机记忆重建世界书？", "会把手机里的所有记忆重新写进这本世界书；世界书里现有的同名条目不会被覆盖，可能出现重复，可在酒馆里整理。", "重建")) {
          const res = await engine.memoryBook.rebuildFromPhone();
          ui.notify("已重建。" + syncNote(res));
        }
        return;
      case "memory-book-accept-delete": {
        const res = await engine.memoryBook.acceptMassDelete();
        ui.notify(syncNote(res));
        return;
      }
      case "memory-edit":
        return memoryEditor(ui, value);
      case "memory-toggle":
        await change(ui, (s) => {
          const m = s.memories.find((x) => x.id === value);
          assert(m, "记忆已变化");
          m.enabled = m.enabled === false;
        }, "启用/停用记忆");
        return;
      case "memory-delete": {
        const m = ui.data.memories.find((x) => x.id === value);
        assert(m, "记忆不存在");
        if (await ui.confirm("删除这条记忆？", m.wb && ui.data.memoryBook.linked ? "会同时从记忆世界书里删除对应条目。" : "只从手机里删除。", "删除")) await change(ui, (s) => engine.memoryBook.removeLinked(s, value), "删除记忆");
        return;
      }
      case "memory-restore-prev":
        await engine.memoryBook.restorePrev(value);
        return;
      case "contact-proactive":
        await change(ui, (s) => {
          const c = s.contacts.find((c2) => c2.id === value);
          assert(c, "人物不存在");
          c.proactive = !c.proactive;
        }, "设置此人主动来信");
        return;
      case "avatar-upload":
        return uploadPhoto(ui, { avatarId: value });
      case "send":
        return send(ui, value);
      case "queue":
        return send(ui, value, { queueOnly: true });
      case "send-pending":
        return engine.actions.reply(value);
      case "clear-pending": {
        const snap = snapshot(ui);
        if (await ui.confirm("清空待发？", "只移除尚未发送的文字；已发生的聊天保留。")) await change(ui, (s) => {
          const t = s.threads.find((t2) => t2.id === value);
          assert(t, "会话已变化");
          t.pending = [];
        }, "清空未发送消息", snap);
        return;
      }
      case "stop":
        engine.arc.userStop();
        engine.runner.cancel("玩家主动停止");
        ui.notify("已请求停止；不会撤销已经提交的记录。");
        return;
      case "emoji": {
        const r = await ui.dialog("加一点语气", "", { choices: [["嗯嗯", "嗯嗯"], ["晚安", "晚安"], ["☕", "☕"], ["🌙", "🌙"], ["😊", "😊"], ["…", "…"], ["cancel", "取消"]] });
        if (r && r.choice !== "cancel") {
          const t = namedThread(ui, ui.route.id);
          ui.setDraft(t, ui.draftFor(t) + r.choice);
          ui.shadow.getElementById("phone-composer")?.focus();
        }
        return;
      }
      case "chat-tools": {
        const r = await ui.dialog("这段对话还能做什么", hint("图片为附件卡片；浏览器朗读不是实际电话通话。"), { choices: [["image", "发一张照片"], ["agenda", "记个约定"], ["memory", "归纳记忆"], ["record", "补记正文里的通信"], ["cancel", "取消"]] });
        if (r?.choice === "image") return uploadPhoto(ui, { threadId: ui.route.id });
        if (r?.choice === "agenda") return newAgenda(ui);
        if (r?.choice === "memory") return engine.actions.memory(ui.route.id);
        if (r?.choice === "record") return handleAction(ui, "record-narrative-message", ui.route.id);
        return;
      }
      case "record-narrative-message": {
        const snap = snapshot(ui), t = namedThread(ui, value);
        const r = await ui.dialog("补记正文里已发生的通信", select("实际发送者", "author", [["user", "玩家"], ...t.members.map((id2) => [id2, contactName(ui.data, id2)])], "user") + field("消息原文", "text", "", { textarea: true, required: true, max: 1600 }) + field("最近正文中的逐字依据", "quote", "", { textarea: true, required: true, max: 1200 }) + checkbox("确认这是已发送/收到的手机通信，不是当面对白、草稿或未来计划", "confirmed"));
        if (!r) return;
        assert(r.confirmed, "需要确认通信确实发生");
        const quote = text(r.quote, 1200), body = text(r.text, 1600), source = snap.history.find((m) => m.text.includes(quote));
        assert(quote.length >= 4 && source && source.text.includes(body), "消息及依据必须能在最近实际正文中核对，请照原文填写");
        still(ui, snap);
        await change(ui, (s) => {
          const row = s.threads.find((t2) => t2.id === value);
          assert(row, "会话已变化");
          assert(r.author === "user" || row.members.includes(r.author), "说话者不在会话中");
          assert(!row.messages.some((m) => m.sourceFloor === source.floor && m.text === body && m.author === r.author), "这条正文通信已经补记");
          limitAppend(row.messages, { id: id("narrative-message"), role: r.author === "user" ? "user" : "character", author: r.author, text: body, kind: "text", ts: Date.now(), story: [storyFor(s, snap).date, storyFor(s, snap).time].filter(Boolean).join(" "), read: true, source: "narrative-confirmed", sourceFloor: source.floor, quote }, 2400, "会话消息");
        }, "按玩家确认与正文依据补记通信", snap);
        ui.notify("已补记并保留正文依据，不额外调用模型。");
        return;
      }
      case "speak": {
        const t = namedThread(ui, ui.route.id), m = t.messages.find((m2) => m2.id === value);
        assert(m, "消息不存在");
        assert(ui.win.speechSynthesis && ui.win.SpeechSynthesisUtterance, "当前浏览器不支持本地朗读");
        ui.win.speechSynthesis.cancel();
        const speech = new ui.win.SpeechSynthesisUtterance(m.text);
        speech.lang = "zh-CN";
        ui.win.speechSynthesis.speak(speech);
        return;
      }
      case "memory-thread":
        await engine.actions.memory(value);
        ui.notify("记忆已保留来源，并会进入正文参考。");
        return;
      case "summarize":
        return engine.actions.memory();
      case "proactive":
        return engine.actions.proactive();
      case "new-post":
        return newPost(ui);
      case "generate-post": {
        const pool = ui.data.contacts.filter(contactAvailable).filter((c) => c.follow !== false);
        assert(pool.length, "还没有可用联系人");
        const f = await askPeople(ui, { title: "生成朋友圈动态", autoLabel: "根据正文自动（挑在场或被提到的人）", pool: pool.map(pickItem), present: presentIds(ui), note: "可以按正文自动挑人、指定多位，或随机抽几位；每人一条，只写 ta 自己知道的事。" });
        if (!f) return;
        const posts = await engine.actions.socialMany(f);
        ui.notify("已生成 " + posts.length + " 条动态。");
        return;
      }
      case "like":
        await change(ui, (s) => {
          const p = s.feed.find((p2) => p2.id === value);
          assert(p, "动态已不在当前分支");
          p.likes = p.likes.includes("user") ? p.likes.filter((x) => x !== "user") : [...p.likes, "user"];
        }, "喜欢一条动态");
        return;
      case "comment": {
        const snap = snapshot(ui), body = await askText(ui, "写一句评论", "评论内容", { max: 500 });
        if (body) await change(ui, (s) => {
          const p = s.feed.find((p2) => p2.id === value);
          assert(p, "动态已变化");
          assert(p.comments.length < 100, "评论已达上限");
          p.comments.push({ id: id("comment"), author: "user", text: body, ts: Date.now() });
        }, "评论生活动态", snap);
        return;
      }
      case "post-reply": {
        const p = ui.data.feed.find((p2) => p2.id === value);
        assert(p, "动态不存在");
        const c = p.author === "user" ? await pickContact(ui, "请谁看看这条动态？") : p.author;
        if (c) return engine.actions.postReply(value, c);
        return;
      }
      case "share-post": {
        const post = ui.data.feed.find((p) => p.id === value);
        assert(post, "动态不存在");
        const c = await pickContact(ui, "分享给谁？");
        if (!c) return;
        let threadId;
        await change(ui, (s) => {
          const t = ensureThread(s, [c]);
          threadId = t.id;
          queueMessage(s, t.id, "分享一条动态：" + post.text);
        }, "分享动态到待发");
        ui.go("chat", threadId);
        return;
      }
      case "delete-post": {
        const snap = snapshot(ui);
        if (await ui.confirm("移除这条手机动态？", "不会撤回正文中已经知道的信息。仅移除当前分支的手机记录。")) await change(ui, (s) => {
          s.feed = s.feed.filter((p) => p.id !== value);
        }, "移除手机动态", snap);
        return;
      }
      case "generate-plan":
        return engine.actions.plan();
      case "plan-detail":
        ui.go("plan", value);
        return;
      case "plan-mode":
        await engine.setPlanningMode(value);
        return;
      case "adopt-plan":
        await change(ui, (s) => adoptPlan(s, value, s.settings.planningMode), "采用未来方向");
        ui.go("plan", value);
        ui.notify("方向已接入隐藏参考；下一次正文继续时自然承接，不自动发消息。");
        return;
      case "pause-plan":
        await change(ui, (s) => {
          const p = s.plans.find((p2) => p2.id === value);
          assert(p, "方向不存在");
          p.status = "paused";
          if (s.activePlan?.id === value) s.activePlan = null;
        }, "暂停方向，保留结果");
        return;
      case "cancel-plan":
        await change(ui, (s) => {
          const p = s.plans.find((p2) => p2.id === value);
          assert(p, "方向不存在");
          p.status = "cancelled";
          if (s.activePlan?.id === value) s.activePlan = null;
        }, "取消候选方向");
        return;
      case "review-plan":
        return engine.actions.reviewPlan();
      case "complete-step": {
        const snap = snapshot(ui);
        const note = await askText(ui, "确认实际完成", "请记录已经发生的结果或正文依据；不是意向。", { max: 500 });
        if (note) await change(ui, (s) => {
          assert(s.activePlan?.id === value, "当前采用的方向已变");
          progressPlan(s, { quote: note, manual: true });
        }, "玩家确认当前一步已发生", snap);
        return;
      }
      case "plan-intent": {
        const [pId, index, choice] = value.split("|"), p = ui.data.plans.find((p2) => p2.id === pId), b = p?.beats[Number(index)];
        assert(b && b.choices[Number(choice)], "意向不存在");
        const line = "我想" + b.choices[Number(choice)] + "。先确认当前条件和对方意愿，不跳过我的回应。";
        if (engine.bridge.fill(line)) ui.notify("意向已放入正文输入框，没有自动发送。");
        return;
      }
      case "agenda-day":
        ui.go("agenda", "", { date: value, month: ui.route.month || 0, replace: true });
        return;
      case "agenda-month":
        ui.go("agenda", "", { month: Number(value) || 0, replace: true });
        return;
      case "new-agenda":
        return newAgenda(ui);
      case "story-date": {
        const snap = snapshot(ui);
        const r = await ui.dialog("剧情时间的备用设置", hint("原卡变量有日期时优先使用原卡；这里只给未提供日期的卡设置备用值，不改stat_data。") + field("剧情日期", "date", ui.data.manualStory.date, { type: "date" }) + field("剧情时间", "time", ui.data.manualStory.time, { type: "time" }) + field("剧情地点", "place", ui.data.manualStory.place, { max: 120 }));
        if (r) {
          if (r.date) isoDay(r.date);
          assert(!r.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time), "时间格式应为 HH:MM");
          await change(ui, (s) => {
            s.manualStory = { date: r.date, time: r.time, place: text(r.place, 120) };
          }, "设置备用剧情时钟", snap);
        }
        return;
      }
      case "agenda-confirm":
      case "agenda-done":
      case "agenda-cancel": {
        const snap = snapshot(ui);
        const status = action === "agenda-confirm" ? "confirmed" : action === "agenda-done" ? "completed" : "cancelled";
        if (await ui.confirm("更新约定记录", "请确认这一状态已经实际发生或得到当事人明确回应。不会因为点按钮就替角色同意。")) await change(ui, (s) => {
          const a = s.agenda.find((a2) => a2.id === value);
          assert(a, "约定已变化");
          a.status = status;
        }, "更新约定状态", snap);
        return;
      }
      case "new-memory":
        return memoryEditor(ui, "");
      case "resolve-memory": {
        const snap = snapshot(ui);
        if (await ui.confirm("约定确实结束了吗？", "只是已经完成或明确取消，才结束这条待办；不默认增加好感或删除旧交流。")) await change(ui, (s) => {
          const m = s.memories.find((x) => x.id === value);
          assert(m, "记忆已变化");
          m.resolved = true;
        }, "核对约定结束", snap);
        return;
      }
      case "inspect-injection":
        engine.updatePrompt();
        await ui.dialog("当前给正文的隐藏参考", hint(engine.bridge.mode === "demo" ? "此处为演示注入；没有连接真实酒馆。" : engine.bridge.injectionReady ? "已经调用当前酒馆的提示注入接口；是否进入最终提示还需你的宿主实机确认。" : "接口尚未就绪，不声称已进入正文。") + `<pre>${e([engine.prompt, ...Object.values(compileArcInjection(ui.data, ui.snapshot))].filter(Boolean).join("\n\n") || "当前没有启用注入或没有稳定存档")}</pre>`, { choices: [["ok", "关闭", "primary"]] });
        return;
      case "agenda-week":
        ui.go("agenda", "", { week: Number(value) || 0, date: addDays(storyFor(ui.data, ui.snapshot).date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), (Number(value) || 0) * 7), replace: true });
        return;
      case "gen-festivals": {
        try {
          const r = await engine.actions.festivals({ month: value });
          ui.notify("已为 " + (value || "本月").slice(0, 7) + " 加入 " + (r?.added ?? 0) + " 个节日与活动。");
        } catch (err) {
          const snap = snapshot(ui), base = /^\d{4}-\d{2}-01$/.test(value || "") ? value : monthStart(storyFor(ui.data, snap).date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
          let n = 0;
          await change(ui, (s) => {
            n = addCalendarEvents(s, builtinEvents(base, monthDays(base)), "内置节庆表");
          }, "加入内置节庆", snap);
          ui.notify("接口暂不可用（" + text(err?.message || err, 60) + "），已用内置节庆表加入 " + n + " 项。");
        }
        return;
      }
      case "agenda-intent": {
        const a = ui.data.agenda.find((x) => x.id === value);
        assert(a, "日程不存在");
        engine.bridge.fill("我想邀请大家" + (a.date ? "在" + a.date + (a.time ? " " + a.time : "") : "") + "一起去「" + a.title + "」" + (a.place ? "（" + a.place + "）" : "") + "。先问问对方有没有空、想不想去，不替谁答应。");
        ui.notify("邀约意向已放入正文输入框，没有自动发送。");
        return;
      }
      case "agenda-propose": {
        const snap = snapshot(ui);
        await change(ui, (s) => {
          const a = s.agenda.find((x) => x.id === value);
          assert(a, "日程不存在");
          a.status = "proposed";
        }, "节日转为待商量", snap);
        return;
      }
      case "agenda-delete": {
        const snap = snapshot(ui);
        await change(ui, (s) => {
          s.agenda = s.agenda.filter((x) => x.id !== value);
        }, "移除日程", snap);
        return;
      }
      case "diary-filter":
        ui.go("diary", "", { author: value, replace: true });
        return;
      case "random-diary": {
        const pool = ui.data.contacts.filter((c) => c.age === null || c.age >= 12);
        assert(pool.length, "通讯录里还没有角色");
        const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(3, pool.length)).map((c) => c.id);
        ui.notify("随机抽到：" + picked.map((x) => contactName(ui.data, x)).join("、") + "，正在写日记…");
        await engine.actions.diaries(picked);
        ui.go("diary", "", { replace: true });
        return;
      }
      case "auto-tasks": {
        assert(ui.data.contacts.length, "通讯录还是空的，先添加或导入联系人");
        const f = await askPeople(ui, { title: "生成生活清单", autoLabel: "根据正文自动（不限定人物）", pool: ui.data.contacts.map(pickItem), present: presentIds(ui), note: "选几位角色，就围绕 ta 们生成清单（想一起做的事、答应过的小事……）；也可以按正文整理。" });
        if (!f) return;
        const n = await engine.actions.autoTasks(f);
        ui.notify(n ? "已加入 " + n + " 条清单。" : "没有找到新的可记事项。");
        return;
      }
      case "auto-notes": {
        assert(ui.data.contacts.length, "通讯录还是空的，先添加或导入联系人");
        const f = await askPeople(ui, { title: "生成备忘", autoLabel: "根据正文自动（不限定人物）", pool: ui.data.contacts.map(pickItem), present: presentIds(ui), note: "选几位角色，就围绕 ta 们生成备忘（喜好、忌口、说过的话、约定……）；也可以按正文整理。" });
        if (!f) return;
        const n = await engine.actions.autoNotes(f);
        ui.notify(n ? "已生成 " + n + " 张便签。" : "没有找到新的需要记住的事。");
        return;
      }
      case "place-zone":
        ui.go("places", "", { zone: value, replace: true });
        return;
      case "place-zone-home":
        ui.go("places", "", { zone: "HOME", replace: true });
        return;
      case "place-random": {
        const list = kusogaki_default.places.filter((p2) => (p2.acts || []).length && !["SCHOOL"].includes(p2.zone) && !["P03", "P20", "P24"].includes(p2.id));
        const p = list[Math.floor(Math.random() * list.length)];
        assert(p, "还没有可推荐的地点，可以先添加地点");
        ui.go("places", "", { zone: ui.route.zone || "all", pick: p.id, replace: true });
        return;
      }
      case "place-act": {
        const [pid, i] = value.split("|"), p = kusogaki_default.places.find((x) => x.id === pid), act = p?.acts?.[Number(i)];
        assert(act, "玩法不存在");
        engine.bridge.fill("我想去「" + p.name + "」" + act + "。先确认时间、路程和对方的意愿，不自动出发。");
        ui.notify("玩法意向已放入正文输入框，没有自动发送。");
        return;
      }
      case "new-note":
        return noteEditor(ui, "");
      case "edit-note":
        return noteEditor(ui, value);
      case "new-diary":
        return diaryEditor(ui, "");
      case "edit-diary":
        return diaryEditor(ui, value);
      case "generate-diary": {
        const people = ui.data.contacts.filter((c) => c.age === null || c.age >= 12);
        const r = await ui.dialog("生成角色日记", `${select("方式", "mode", [["pick", "指定角色（勾选下方）"], ["random", "随机抽取角色"]], "pick")}${field("随机人数（随机方式时生效）", "count", 3, { type: "number" })}<div class="checks"><label class="checkbox-label"><input type="checkbox" name="members" value="user"><span>我（玩家）的日记</span></label>${people.map((c) => `<label class="checkbox-label"><input type="checkbox" name="members" value="${e(c.id)}"><span>${e(c.name)}${c.recognized ? "" : " · 未相认"}</span></label>`).join("")}</div>${hint("每位角色各写一篇，只写本人知道的事。最多 6 位。")}`, { submit: "开始生成" });
        if (!r) return;
        let picked = r.members || [];
        if (r.mode === "random") {
          const n = Math.min(6, Math.max(1, Math.trunc(Number(r.count) || 3)));
          picked = [...people].sort(() => Math.random() - 0.5).slice(0, n).map((c) => c.id);
        }
        picked = picked.slice(0, 6);
        assert(picked.length, "请至少勾选一位角色，或改用随机");
        await engine.actions.diaries(picked);
        ui.go("diary", "", { replace: true });
        return;
      }
      case "new-task":
        return taskEditor(ui);
      case "task-progress": {
        const snap = snapshot(ui), t = ui.data.tasks.find((t2) => t2.id === value);
        assert(t, "条目不存在");
        const yes = await ui.confirm(t.done ? "把记录改为未完成？" : "这一步实际做完了吗？", "这只更新手机清单，不自动证明正文剧情已完成。");
        if (yes) await change(ui, (s) => {
          const t2 = s.tasks.find((t3) => t3.id === value);
          assert(t2, "条目已变化");
          if (t2.done) {
            t2.done = false;
            t2.progress = 0;
          } else {
            t2.progress = Math.min(t2.target || 1, (t2.progress || 0) + 1);
            t2.done = t2.progress >= (t2.target || 1);
          }
        }, "更新实际清单进度", snap);
        return;
      }
      case "task-delete": {
        const snap = snapshot(ui);
        if (await ui.confirm("移除清单记录？", "不会删除原卡设定或已发生剧情。")) await change(ui, (s) => {
          s.tasks = s.tasks.filter((t) => t.id !== value);
        }, "移除清单", snap);
        return;
      }
      case "new-item":
        return itemEditor(ui, "");
      case "edit-item":
        return itemEditor(ui, value);
      case "delete-item": {
        const snap = snapshot(ui);
        if (await ui.confirm("移除手机物品附注？", "不会改动主线背包。")) await change(ui, (s) => {
          s.items = s.items.filter((x) => x.id !== value);
        }, "移除手机附注", snap);
        return;
      }
      case "cafe-tools":
        return cafeTools(ui);
      case "album-upload":
        return uploadPhoto(ui);
      case "album-url":
        return addPhotoUrls(ui);
      case "photo": {
        const p = ui.data.album.find((p2) => p2.id === value);
        assert(p, "照片不在当前分支");
        const m = await engine.media.get(p.mediaId);
        await ui.dialog(p.title, `${m ? `<img src="${e(m.data)}" referrerpolicy="no-referrer" alt="${e(p.title)}" style="width:100%;border-radius:12px">` : hint("此图片在本机缺失，请使用含图片备份恢复。")}<p class="form-note">${e(p.date || "未填写剧情日期")} · ${m?.remote ? "网址图片：" + e(m.data.slice(0, 80)) : "仅在当前手机保存"}</p>`, { choices: [["ok", "关闭", "primary"]] });
        return;
      }
      case "new-place": {
        const snap = snapshot(ui);
        const r = await ui.dialog("记下一个地点", field("名称", "title", "", { required: true, max: 100 }) + field("说明与进入条件", "note", "", { textarea: true, required: true, max: 1e3 }));
        if (r) await change(ui, (s) => limitAppend(s.places, { id: id("place"), title: text(r.title, 100), note: text(r.note, 1e3) }, 120, "地点"), "新增地点参考", snap);
        return;
      }
      case "delete-place": {
        const snap = snapshot(ui);
        if (await ui.confirm("移除自建地点？", "不会改动原卡地图或既有经历。")) await change(ui, (s) => {
          s.places = s.places.filter((p) => p.id !== value);
        }, "移除自建地点", snap);
        return;
      }
      case "place-intent": {
        const p = ui.data.places.find((p2) => p2.id === value) || kusogaki_default.places.find((p2) => p2.id === value);
        assert(p, "地点不存在");
        engine.bridge.fill("我想商量去「" + (p.title || p.name) + "」看看。先确认时间、路程和许可，不自动出发。");
        ui.notify("出行意向已放入正文输入框，没有自动发送。");
        return;
      }
      case "theme":
        engine.settings.update({ theme: engine.settings.data.theme === "night" ? "day" : "night" });
        return;
      case "inject":
        await change(ui, (s) => {
          s.settings.inject = !s.settings.inject;
        }, "切换正文记忆联动");
        return;
      case "baibai-preview-memory": {
        baibaiInvalidate();
        const brief = baibaiPlanningBrief();
        assert(brief, "记忆读取未开启或尚未连接，请检查手机设置和柏宝书联动页的读取开关");
        await ui.confirm("柏宝书记忆参考（只读）", JSON.stringify(brief, null, 2), "知道了");
        return;
      }
      case "baibai-enabled":
      case "baibai-brief":
      case "baibai-push":
      case "baibai-present": {
        const st = engine.settings, key = action.slice(7), cur = isObject(st.data.ui.baibai) ? st.data.ui.baibai : {};
        const turnOn = cur[key] === false;
        st.update({ ui: { ...st.data.ui, baibai: { ...cur, [key]: turnOn } } });
        baibaiInvalidate();
        if ((key === "push" || key === "enabled") && turnOn) engine.baibai.schedule(800);
        return;
      }
      case "baibai-push-now": {
        assert(ui.data, "先打开一个聊天");
        assert(baibaiApi(), "未检测到百宝月夜书（需 ≥1.3.0，并在其「联动」页开启小手机联动）");
        const r = await engine.baibai.push({ force: true });
        ui.notify(r && (r.added || r.updated) ? `已回写柏宝书：新增 ${r.added} 条，更新 ${r.updated} 条。` : "柏宝书里已是最新，没有需要回写的内容。");
        return;
      }
      case "baibai-import-memory": {
        assert(ui.data, "先打开一个聊天");
        assert(baibaiReadEnabled(), "请先开启柏宝书记忆读取");
        const brief = baibaiBrief(null, { maxAge: 0 });
        assert(brief, "未检测到柏宝书，或柏宝书关闭了小手机联动");
        const snapNow = snapshot(ui);
        const have = new Set(ui.data.memories.map((m) => m.id));
        const fresh = baibaiMemoryCandidates(brief, ui.data).filter((c) => !have.has(c.id));
        if (!fresh.length) {
          ui.notify("柏宝书里没有新的可导入记忆。");
          return;
        }
        if (!await ui.confirm("导入柏宝书记忆？", `将把 ${fresh.length} 条柏宝书的未了结计划 / 锚点日记 / 分层剧情摘要存为手机记忆（带“柏宝书”标记：不同步进记忆世界书，也不会再注入正文，避免与柏宝书自己的注入重复）。默认仅玩家知情；可在“记忆”里明确设置其他知情人、停用或删除。`)) return;
        let count = 0;
        await change(ui, (s) => {
          const ids = new Set(s.memories.map((m) => m.id));
          for (const c of fresh) {
            if (ids.has(c.id) || s.memories.length >= 1e3) continue;
            s.memories.push({ id: c.id, kind: c.kind, title: c.title, text: c.text, keys: [], enabled: true, audience: c.audience, visibility: "private", sources: [{ note: "柏宝书 · " + (c.bb.kind === "plan" ? "未了结计划" : c.bb.kind === "anchor" ? "锚点日记" : "分层摘要") }], resolved: false, ts: Date.now(), bb: c.bb });
            ids.add(c.id);
            count++;
          }
          log(s, "info", "从柏宝书导入 " + count + " 条记忆", "memory");
        }, "导入柏宝书记忆", snapNow);
        ui.notify("已从柏宝书导入 " + count + " 条记忆。");
        return;
      }
      case "baibai-import-api": {
        const api = baibaiApi();
        assert(api, "未检测到柏宝书");
        let list;
        try {
          list = api.listChannels();
        } catch (e2) {
          throw Error("读取柏宝书渠道失败：" + (e2?.message || e2));
        }
        assert(Array.isArray(list) && list.length, "柏宝书里还没有副 API 渠道");
        if (!await ui.confirm("导入柏宝书 API 方案？", list.map((c) => "· " + c.name + "（" + (c.model || "未填模型") + " @ " + (c.host || "?") + (c.hasKey ? "，含密钥" : "，无密钥") + "）").join("\n") + "\n\n密钥会随方案导入并在本机记住；同一渠道重复导入时按编号覆盖。导入的是副本，之后两边各自修改互不影响。")) return;
        let ok = 0;
        const fail = [];
        for (const c of list) {
          try {
            const ch = api.exportChannel(c.id);
            const core = String(ch.id || c.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
            const pid = "baibai-" + (core || fingerprint(String(c.name || c.id)));
            const prev = engine.settings.data.profiles.find((p) => p.id === pid);
            engine.settings.saveProfile({ id: pid, name: text("柏宝书·" + (ch.name || c.name || "渠道"), 40), type: "openai", transport: prev?.transport || "helper", url: baibaiNormalizeUrl(ch.url), model: text(ch.model, 120), temperature: Number.isFinite(ch.temperature) ? ch.temperature : 0.8, maxTokens: Number.isFinite(ch.maxTokens) ? ch.maxTokens : 1800, rememberKey: !!ch.key || !!prev?.rememberKey, key: ch.key || "", testPrompt: prev?.testPrompt || "" });
            ok++;
          } catch (e2) {
            fail.push((c.name || c.id) + "：" + text(e2?.message || e2, 80));
          }
        }
        ui.notify("已导入 " + ok + " 个柏宝书方案" + (fail.length ? "；失败：" + fail.join("；") : "。"), fail.length ? "error" : "info");
        return;
      }
      case "baibai-test": {
        const api = baibaiApi();
        assert(api, "未检测到柏宝书");
        const list = api.listChannels();
        assert(Array.isArray(list) && list.length, "柏宝书里还没有副 API 渠道");
        ui.notify("正在通过柏宝书测活 " + list.length + " 个渠道（密钥不经过手机）…");
        const results = [];
        for (const c of list) {
          try {
            const r = await api.testChannel(c.id);
            results.push((r?.ok ? "✓ " : "✗ ") + c.name + (r?.message ? "：" + text(r.message, 80) : ""));
          } catch (e2) {
            results.push("✗ " + c.name + "：" + text(e2?.message || e2, 80));
          }
        }
        baibaiInvalidate();
        await ui.confirm("柏宝书渠道测活结果", results.join("\n"), "知道了");
        return;
      }
      // ===== 恋爱心迹（每楼层角色心声 & 联动百宝书主要配角） =====
      case "diary-tab":
        ui.go("diary", "", { tab: value || "all", author: ui.route.author || "all", floor: ui.route.floor || "all", replace: true });
        return;
      case "diary-floor":
        ui.go("diary", "", { tab: ui.route.tab || "all", author: ui.route.author || "all", floor: value || "all", replace: true });
        return;
      case "heart-auto-toggle": {
        const st = engine.settings, cur = heartPrefs();
        const next = !cur.autoEveryFloor;
        st.update({ ui: { ...st.data.ui, heartTrace: { ...cur, autoEveryFloor: next } } });
        ui.notify(next ? "已开启：每当新楼层回复完成时，将自动生成主要配角的恋爱心迹。" : "已关闭每楼层自动生成恋爱心迹。");
        return;
      }
      case "heart-auto-mode": {
        const st = engine.settings, cur = heartPrefs();
        if (!["baibai_main", "present", "pinned"].includes(value)) return;
        st.update({ ui: { ...st.data.ui, heartTrace: { ...cur, autoMode: value } } });
        return;
      }
      case "heart-pick-pinned": {
        assert(ui.data, "先打开一个聊天");
        const snapNow = snapshot(ui);
        await change(ui, (s) => {
          syncBaibaiMainNpcsToContacts(s, null, { onlyImportantOrPresent: true });
        }, "同步百宝书角色", snapNow).catch(() => {});
        const cur = heartPrefs();
        const { list: bbMain } = baibaiMainNpcsForHeart(ui.data, snapNow);
        const bbMap = new Map(bbMain.map((n) => [nameKey(n.name), n]));
        const pool = ui.data.contacts.filter((c) => c.age === null || c.age >= 12).map((c) => {
          const b = bbMap.get(nameKey(c.name));
          return {
            id: c.id,
            name: c.name,
            note: [b?.important ? "★百宝书主配" : "", b?.present ? "在场" : "", b?.affinityText || b?.relation || c.status].filter(Boolean).join(" · ")
          };
        });
        const r = await ui.dialog("恋爱心迹 · 自动联动与关注设置", `${select("自动联动对象", "autoMode", [["baibai_main", "百宝书主要配角（核心/在场/有好感度的角色）"], ["present", "当前楼层在场角色"], ["pinned", "仅下方勾选的固定关注角色"]], cur.autoMode)}${field("每楼层自动生成最多人数（1—4）", "maxPerFloor", cur.maxPerFloor, { type: "number" })}${checkbox("将生成的恋爱心迹回写到百宝月夜书【小手机·恋爱心迹】", "syncToBaibai", cur.syncToBaibai)}<div class="section-label">固定关注的角色（勾选）</div>${pickTools()}${filterBox("搜索角色姓名…")}${peopleChecks(pool, { checked: cur.pinnedIds })}`, { submit: "保存设置" });
        if (!r) return;
        const st = engine.settings;
        st.update({
          ui: {
            ...st.data.ui,
            heartTrace: {
              ...cur,
              autoMode: ["baibai_main", "present", "pinned"].includes(r.autoMode) ? r.autoMode : cur.autoMode,
              maxPerFloor: Math.min(4, Math.max(1, Math.trunc(Number(r.maxPerFloor) || 2))),
              syncToBaibai: !!r.syncToBaibai,
              pinnedIds: Array.isArray(r.members) ? r.members : []
            }
          }
        });
        ui.notify("恋爱心迹联动设置已保存。");
        return;
      }
      case "heart-sync-baibai": {
        assert(ui.data, "先打开一个聊天");
        const brief = baibaiBrief(null, { maxAge: 0 });
        assert(brief, "未检测到百宝月夜书简报，请确认百宝月夜书已开启小手机联动");
        const snapNow = snapshot(ui);
        let res = { added: [], updated: 0 };
        await change(ui, (s) => {
          res = syncBaibaiMainNpcsToContacts(s, brief, { onlyImportantOrPresent: false });
        }, "同步百宝书主要配角", snapNow);
        ui.notify(res.added.length || res.updated
          ? `已同步百宝月夜书角色：新增 ${res.added.length} 位（${res.added.map((c) => c.name).join("、")}），更新 ${res.updated} 位资料。`
          : "通讯录已包含百宝月夜书中的全部主要配角。");
        return;
      }
      case "quick-heart-baibai": {
        assert(ui.data, "先打开一个聊天");
        const snapNow = snapshot(ui);
        await change(ui, (s) => {
          syncBaibaiMainNpcsToContacts(s, null, { onlyImportantOrPresent: true });
        }, "同步百宝书主要配角", snapNow).catch(() => {});
        const picked = pickAutoHeartContacts(ui.data, snapNow);
        assert(picked.length, "没有找到可生成心迹的角色，请先添加联系人或同步百宝书角色");
        await engine.actions.heartTraces(picked, { floor: snapNow.floor });
        ui.go("diary", "", { tab: "heart", replace: true });
        return;
      }
      case "quick-heart-npc": {
        assert(ui.data, "先打开一个聊天");
        const npcName = text(value, 40);
        assert(npcName, "未指定角色");
        const snapNow = snapshot(ui);
        let targetId = "";
        await change(ui, (s) => {
          syncBaibaiMainNpcsToContacts(s, null, { onlyImportantOrPresent: false });
          let c = s.contacts.find((x) => nameKey(x.name) === nameKey(npcName));
          if (!c) {
            c = addContact(s, { name: npcName, bio: "百宝月夜书联动角色", status: "百宝书主要配角", recognized: true, reachable: true, color: "rose" });
          }
          targetId = c.id;
        }, "准备角色心迹：" + npcName, snapNow);
        assert(targetId, "无法定位角色：" + npcName);
        await engine.actions.heartTraces([targetId], { floor: snapNow.floor });
        ui.go("diary", "", { tab: "heart", replace: true });
        return;
      }
      case "generate-heart-trace": {
        assert(ui.data, "先打开一个聊天");
        const snapNow = snapshot(ui);
        await change(ui, (s) => {
          syncBaibaiMainNpcsToContacts(s, null, { onlyImportantOrPresent: false });
        }, "同步百宝书角色", snapNow).catch(() => {});
        const fctx = collectFloorContext(engine.bridge, snapNow);
        const floorChoices = fctx.floors.length
          ? [...fctx.floors].reverse().map((f) => [String(f.floor), `#${f.floor + 1}楼 · ${f.name}：${text(f.text, 28)}`])
          : [[String(snapNow.floor ?? 0), `当前 #${(snapNow.floor ?? 0) + 1}楼`]];
        const { list: bbMain } = baibaiMainNpcsForHeart(ui.data, snapNow);
        const bbMap = new Map(bbMain.map((n) => [nameKey(n.name), n]));
        const people = ui.data.contacts.filter((c) => c.age === null || c.age >= 12);
        const pool = people.map((c) => {
          const b = bbMap.get(nameKey(c.name));
          return {
            id: c.id,
            name: c.name,
            note: [b?.important ? "★百宝书主配" : "", b?.present ? "在场" : "", b?.affinityText || b?.relation || c.status].filter(Boolean).join(" · ")
          };
        });
        const defaultChecked = pickAutoHeartContacts(ui.data, snapNow);
        const presentIds = people.filter((c) => (snapNow.present || []).some((p) => nameKey(p) === nameKey(c.name)) || bbMap.get(nameKey(c.name))?.present).map((c) => c.id);
        const r = await ui.dialog("生成恋爱心迹 · 选楼层与角色", `${hint("可针对任意楼层的正文互动，生成角色当下的表面伪装、心底对你的回应与第一人称恋爱心迹。已联动百宝月夜书的主要配角与好感状态。")}${select("目标正文楼层", "floor", floorChoices, String(fctx.targetFloor))}${select("选人方式", "mode", [["pick", "使用下方勾选的角色"], ["baibai", "自动选百宝书主要配角 / 在场角色"], ["random", "随机抽取角色"]], "pick")}${field("心迹侧重提示（可选，如：嘴硬吃醋 / 偷偷心动）", "focusHint", "", { max: 200, placeholder: "留空则按本楼层正文与好感度自然推演" })}<div class="section-label">选择角色（最多 4 位）</div>${pickTools(presentIds, "本楼在场/主配")}${filterBox("搜索角色…")}${peopleChecks(pool, { checked: defaultChecked })}`, { submit: "生成恋爱心迹" });
        if (!r) return;
        let picked = Array.isArray(r.members) ? r.members : [];
        if (r.mode === "baibai") picked = pickAutoHeartContacts(ui.data, snapNow);
        else if (r.mode === "random") picked = [...people].sort(() => Math.random() - 0.5).slice(0, 2).map((c) => c.id);
        picked = picked.slice(0, 4);
        assert(picked.length, "请至少选择一位角色");
        await engine.actions.heartTraces(picked, { floor: Number(r.floor), focusHint: text(r.focusHint || "", 200) });
        ui.go("diary", "", { tab: "heart", replace: true });
        return;
      }
      case "heart-followup": {
        assert(ui.data, "先打开一个聊天");
        const d = ui.data.diary.find((x) => x.id === value && x.kind === "heart");
        assert(d, "未找到该条恋爱心迹");
        const who = contactName(ui.data, d.author) !== "未知联系人" ? contactName(ui.data, d.author) : (d.authorName || "角色");
        const prompt = await askText(ui, `回应 / 追问 ${who} 的心迹（#${(d.floor ?? 0) + 1}楼）`, "你想对 ta 的这段心迹说什么、追问什么，或做出什么小动作？", { placeholder: "例如：凑近盯着ta微红的耳尖问：「刚才明明在偷偷看我吧？」", max: 400 });
        if (!prompt) return;
        await engine.actions.heartFollowup(d.id, prompt);
        return;
      }
      // ===== 全模块通用删除管理（多选删除 + 一键清空 + 单项删除） =====
      case "batch-delete-modal": {
        assert(ui.data, "先打开一个聊天");
        const meta = tpModuleMeta(ui, value);
        assert(meta && meta.items.length, "当前模块没有可删除的记录");
        const snapNow = snapshot(ui);
        const r = await ui.dialog(`多选删除 · ${meta.title}`, `${hint(meta.warn)}${pickTools()}${filterBox("搜索要删除的记录…")}${peopleChecks(meta.items, { name: "members", checked: [] })}`, { submit: "删除所选" });
        if (!r) return;
        const selected = Array.isArray(r.members) ? r.members : [];
        assert(selected.length, "请至少勾选一条要删除的记录");
        if (!await ui.confirm(`确认删除所选的 ${selected.length} 条${meta.title}？`, meta.warn + "此操作不可直接撤销。", "确认删除")) return;
        still(ui, snapNow);
        const idSet = new Set(selected);
        if (value === "album") {
          for (const p of ui.data.album.filter((x) => idSet.has(x.id))) {
            if (p.mediaId && !String(p.mediaId).startsWith("url:")) await engine.media.remove?.(p.mediaId).catch(() => {});
          }
        }
        let removedCount = 0;
        await change(ui, (s) => {
          const m2 = tpModuleMeta({ data: s }, value);
          if (m2) removedCount = m2.remove(s, idSet);
        }, `批量删除${meta.title}`, snapNow);
        ui.notify(`已删除 ${removedCount} 条${meta.title}。`);
        return;
      }
      case "clear-module": {
        assert(ui.data, "先打开一个聊天");
        const meta = tpModuleMeta(ui, value);
        assert(meta && meta.items.length, "当前模块已经是空的");
        const snapNow = snapshot(ui);
        if (!await ui.confirm(`一键清空全部${meta.title}（共 ${meta.items.length} 条）？`, meta.warn + "清空后无法直接恢复，建议重要内容先备份。", "确认清空")) return;
        still(ui, snapNow);
        if (value === "album") {
          for (const p of ui.data.album) {
            if (p.mediaId && !String(p.mediaId).startsWith("url:")) await engine.media.remove?.(p.mediaId).catch(() => {});
          }
        }
        let cleared = 0;
        await change(ui, (s) => {
          const m2 = tpModuleMeta({ data: s }, value);
          if (m2) cleared = m2.clear(s);
        }, `一键清空${meta.title}`, snapNow);
        ui.notify(`已清空 ${cleared} 条${meta.title}。`);
        return;
      }
      case "delete-diary": {
        const snapNow = snapshot(ui), d = ui.data?.diary.find((x) => x.id === value);
        assert(d, "记录不存在");
        const label = d.kind === "heart" ? "恋爱心迹" : "日记";
        if (await ui.confirm(`删除这篇${label}「${d.title}」？`, "删除后不可直接撤销。", "删除")) {
          await change(ui, (s) => {
            s.diary = s.diary.filter((x) => x.id !== value);
          }, "删除" + label, snapNow);
          ui.notify(`已删除${label}。`);
        }
        return;
      }
      case "delete-note": {
        const snapNow = snapshot(ui), n = ui.data?.notes.find((x) => x.id === value);
        assert(n, "便签不存在");
        if (await ui.confirm(`删除便签「${n.title || "无题"}」？`, "删除后不可直接撤销。", "删除")) {
          await change(ui, (s) => {
            s.notes = s.notes.filter((x) => x.id !== value);
          }, "删除便签", snapNow);
          ui.notify("已删除便签。");
        }
        return;
      }
      case "delete-photo": {
        const snapNow = snapshot(ui), p = ui.data?.album.find((x) => x.id === value);
        assert(p, "照片不存在");
        if (await ui.confirm(`移除照片「${p.title || "留影"}」？`, "将从手机相册中移除。", "移除")) {
          if (p.mediaId && !String(p.mediaId).startsWith("url:")) await engine.media.remove?.(p.mediaId).catch(() => {});
          await change(ui, (s) => {
            s.album = s.album.filter((x) => x.id !== value);
          }, "删除相册照片", snapNow);
          ui.notify("已移除照片。");
        }
        return;
      }
      case "delete-chat-msg": {
        const [tid, mid] = String(value).split("|");
        const snapNow = snapshot(ui), t = ui.data?.threads.find((x) => x.id === tid);
        const m = t?.messages.find((x) => x.id === mid);
        assert(t && m, "消息不存在");
        if (await ui.confirm("删除这条消息？", `「${text(m.text || "[图片]", 60)}」将被移除。`, "删除")) {
          await change(ui, (s) => {
            const th = s.threads.find((x) => x.id === tid);
            if (th) th.messages = th.messages.filter((x) => x.id !== mid);
          }, "删除单条消息", snapNow);
        }
        return;
      }
      case "delete-thread": {
        const snapNow = snapshot(ui), t = ui.data?.threads.find((x) => x.id === value);
        assert(t, "会话不存在");
        if (await ui.confirm(`删除会话「${t.title}」？`, `将移除该会话内的 ${t.messages.length} 条消息与待发草稿。`, "删除")) {
          await change(ui, (s) => {
            s.threads = s.threads.filter((x) => x.id !== value);
            s.summaries = s.summaries.filter((x) => x.threadId !== value);
          }, "删除会话", snapNow);
          ui.notify(`已删除会话「${t.title}」。`);
        }
        return;
      }
      case "delete-plan": {
        const snapNow = snapshot(ui), p = ui.data?.plans.find((x) => x.id === value);
        assert(p, "方向不存在");
        if (await ui.confirm(`删除方向「${p.title}」？`, "将从候选与方向档案中移除。", "删除")) {
          await change(ui, (s) => {
            s.plans = s.plans.filter((x) => x.id !== value);
            if (s.activePlan?.id === value) s.activePlan = null;
          }, "删除未来方向", snapNow);
          ui.notify("已删除该方向。");
        }
        return;
      }
      case "read-narrative":
        await change(ui, (s) => {
          s.settings.readNarrative = !s.settings.readNarrative;
        }, "切换可知情正文读取");
        return;
      case "auto-enable": {
        assert(ui.data, "先打开一个聊天");
        if (ui.data.settings.auto.enabled) {
          await engine.setAuto(false);
          ui.notify("后台已关闭，已请求停止当前任务。");
          return;
        }
        const snap = snapshot(ui);
        if (await ui.confirm("开启后台自动工作？", `手机收起也会检查任务，并向各模块分配的API发送当前聊天相关资料。
当前上限：${ui.data.settings.auto.maxHourly}次/小时、${ui.data.settings.auto.maxDaily}次/24小时（主动来信不计入）。其它模块失败/决定不发消息也算调用。

关闭酒馆页面后停止；不承诺浏览器后台准点。${ui.demo ? "\n当前演示不会请求真实模型。" : ""}`, "我了解，开启")) {
          still(ui, snap);
          await engine.setAuto(true);
          engine.scheduler.tick().catch(() => {
          });
        }
        return;
      }
      case "scheduler-tick":
        assert(ui.data?.settings.auto.enabled, "先明确开启后台自动化");
        await engine.scheduler.tick();
        ui.notify(engine.scheduler.status);
        return;
      case "edit-api":
        ui.go("apiEditor", value);
        return;
      case "duplicate-api": {
        const p = engine.settings.duplicate(value);
        ui.go("apiEditor", p.id);
        return;
      }
      case "delete-api":
        if (await ui.confirm("删除这个API方案？", "使用它的模块会改回“沿用默认”；如果它也是默认，会回到跟随酒馆。")) engine.settings.remove(value);
        return;
      case "batch-test": {
        const st = engine.settings, list = st.data.profiles;
        const r = await ui.dialog("批量测活", `<p class="tiny muted">每个方案只用它自己配置的模型发一次请求（可能计费）。不附带自定义提示词、人物资料或聊天记录。</p><div class="card">${list.map((p) => `<label class="checkbox-label"><input type="checkbox" name="members" value="${e(p.id)}" checked><span>${e(p.name)} · ${e(p.model || "酒馆当前模型")}</span></label>`).join("")}</div><label class="form-field"><span>统一测试语句</span><textarea class="field" name="phrase" rows="3" maxlength="2000">${e(st.data.ui.testPrompt || "")}</textarea></label>${checkbox("优先使用各方案自己的测活用语", "perProfile", true)}`, { submit: "开始测试" });
        if (!r) return;
        const ids = r.members || [], phrase = String(r.phrase || "").trim() || "请回复 OK。";
        assert(ids.length, "至少选择一个方案");
        if (phrase !== st.data.ui.testPrompt) st.update({ ui: { ...st.data.ui, testPrompt: phrase.slice(0, 2e3) } });
        ui.notify("正在测试 " + ids.length + " 个方案…");
        const rows = await Promise.all(ids.map(async (pid) => {
          const p = list.find((x) => x.id === pid), t0 = Date.now();
          try {
            const out = engine.bridge.mode === "demo" ? "演示环境：未请求真实 API。" : await engine.router.call("chat", { system: "这是一条用户主动触发的 API 测活请求。请直接、简短地回应用户。", user: r.perProfile && p?.testPrompt ? p.testPrompt : phrase }, { profileId: pid, raw: true });
            return { p, ok: true, ms: Date.now() - t0, out: text(out, 600) };
          } catch (err) {
            return { p, ok: false, ms: Date.now() - t0, out: String(err?.message || err).slice(0, 300) };
          }
        }));
        const okN = rows.filter((x) => x.ok).length;
        st.update({ ui: { ...st.data.ui, lastTest: { ...st.data.ui.lastTest || {}, ...Object.fromEntries(rows.filter((x) => x.p).map((x) => [x.p.id, { ok: x.ok, ms: x.ms, ts: Date.now() }])) } } });
        await ui.dialog("测活结果 · " + okN + "/" + rows.length + " 可用", rows.map((x) => `<div class="card"><div class="row-top"><b>${e(x.p?.name || "?")}</b>${tag(x.ok ? "✓ " + (x.ms / 1e3).toFixed(1) + "s" : "✗ 失败", x.ok ? "" : "rose")}</div><small>${e(x.p?.model || "酒馆当前模型")}</small><p class="copy" style="white-space:pre-wrap">${e(x.out)}</p></div>`).join(""), { choices: [["ok", "关闭", "primary"]] });
        return;
      }
      case "cloud-pull":
        ui.notify(engine.settings.pullCloud(true) ? "已从酒馆设置读取API方案。" : "酒馆设置里还没有可用的同步副本（在任一设备保存一次方案即可上传）。");
        ui.render?.();
        return;
      case "sync-keys": {
        const st = engine.settings;
        st.update({ ui: { ...st.data.ui, syncKeys: st.data.ui.syncKeys === false } });
        return;
      }
      case "plan-strip": {
        const st = engine.settings;
        st.update({ ui: { ...st.data.ui, planStrip: st.data.ui.planStrip === false } });
        return;
      }
      case "edit-prompt": {
        const st = engine.settings, pc = st.data.prompt || {};
        const r = await ui.dialog("自定义提示词", `<p class="tiny muted">开启后，手机每次向模型发请求时都会把这段提示词作为第一条系统消息先发送（批量测活除外）。适合写破限、文风、语言要求等。</p>${checkbox("启用自定义提示词", "enabled", !!pc.enabled)}<label class="form-field"><span>提示词内容</span><textarea class="field" name="text" rows="10" maxlength="20000">${e(pc.text || "")}</textarea></label>`);
        if (!r) return;
        st.update({ prompt: { enabled: r.enabled === true || r.enabled === "on", text: String(r.text || "").slice(0, 2e4) } });
        ui.notify("自定义提示词已保存。");
        return;
      }
      case "test-api": {
        const st = engine.settings, p = st.data.profiles.find((x) => x.id === value);
        assert(p, "方案不存在，请先保存");
        const pc = st.data.prompt || {}, hasPrompt = !!(pc.enabled && String(pc.text || "").trim());
        const r = await ui.dialog("测活 · " + p.name, `<p class="tiny muted">${ui.demo ? "演示只说明配置路径，不测试真实网络。" : "只用这份方案配置的模型发一次短请求（可能计费）；不发送人物资料或聊天记录。"}</p><div class="card"><small>${e(p.model || "酒馆当前模型")}${p.url ? " · " + e(p.url) : ""}</small></div><label class="form-field"><span>这份方案专属的测试用语（保存在方案里）</span><textarea class="field" name="phrase" rows="3" maxlength="2000" placeholder="请回复 OK。">${e(p.testPrompt || st.data.ui.testPrompt || "")}</textarea></label>${hasPrompt ? checkbox("同时附带自定义提示词（检查破限/文风是否生效）", "withPrompt", !!st.data.ui.testWithPrompt) : ""}`, { submit: "开始测活" });
        if (!r) return;
        const phrase = String(r.phrase || "").trim() || "请回复 OK。", withPrompt = hasPrompt && !!r.withPrompt;
        if (p.id !== "tavern" && phrase !== (p.testPrompt || "")) st.saveProfile({ ...p, testPrompt: phrase, key: void 0 });
        else if (p.id === "tavern" && phrase !== st.data.ui.testPrompt) st.update({ ui: { ...st.data.ui, testPrompt: phrase.slice(0, 2e3) } });
        if (withPrompt !== !!st.data.ui.testWithPrompt) st.update({ ui: { ...st.data.ui, testWithPrompt: withPrompt } });
        ui.notify("正在测活「" + p.name + "」…");
        const t0 = Date.now();
        let ok = true, out;
        try {
          out = engine.bridge.mode === "demo" ? "演示环境：未请求真实 API。" : await engine.router.call("chat", { system: "这是一条用户主动触发的 API 测活请求。请直接、简短地回应用户。", user: phrase }, { profileId: p.id, raw: !withPrompt });
          out = text(out, 600);
        } catch (err) {
          ok = false;
          out = String(err?.message || err).slice(0, 300);
        }
        const ms = Date.now() - t0;
        st.update({ ui: { ...st.data.ui, lastTest: { ...st.data.ui.lastTest || {}, [p.id]: { ok, ms, ts: Date.now() } } } });
        await ui.dialog("测活结果 · " + (ok ? "可用" : "失败"), `<div class="card"><div class="row-top"><b>${e(p.name)}</b>${tag(ok ? "✓ " + (ms / 1e3).toFixed(1) + "s" : "✗ 失败", ok ? "" : "rose")}</div><small>${e(p.model || "酒馆当前模型")}${withPrompt ? " · 已附带自定义提示词" : ""}</small><p class="copy" style="white-space:pre-wrap">${e(out)}</p></div>`, { choices: [["ok", "关闭", "primary"]] });
        return;
      }
      case "models-draft": {
        const form = ui.shadow.querySelector('form[data-form="api"]');
        assert(form, "先打开方案编辑");
        const raw = ui.formValues(form);
        const secret = raw.key || engine.settings.key(raw.id);
        const rows = await engine.router.modelsDraft({ ...raw, key: secret });
        if (!form.isConnected || ui.route.view !== "apiEditor") return;
        if (!rows.length) {
          ui.notify("没有返回模型列表，可手动填写。");
          return;
        }
        const r = await ui.dialog("选择模型", select("模型", "model", rows.map((x) => [x, x]), rows[0]));
        if (r) {
          const field2 = form.querySelector("[name=model]");
          if (field2?.isConnected) field2.value = r.model;
        }
        return;
      }
      case "export-api":
        if (await ui.confirm("导出API方案？", "文件会包含各方案的 API 密钥（明文），请只在自己的设备间传递。", "导出")) download(ui, "月夜来信-API方案-含密钥.json", engine.settings.export());
        return;
      case "import-api": {
        const f = await ui.pickFile(".json,application/json", 1024 * 1024);
        if (!f) return;
        const raw = JSON.parse(await f.text());
        if (await ui.confirm("导入API方案？", "按方案ID合并；文件里的密钥会一并导入并在本机记住。模块路由可能随文件调整。")) {
          engine.settings.import(raw);
          ui.notify("方案、密钥与模块路由已导入。");
        }
        return;
      }
      case "book-create": {
        const r = await ui.dialog("创建世界书工坊", hint("会新建一本世界书并追加绑定到当前角色卡（不动原有的世界书绑定）。手机里的日记、心迹、摘要、人物档案、约定、备忘会按你勾选的数据类型写成条目；可以在酒馆里直接修改，手机自动同步。") + field("世界书名称", "name", ui.data.bookSync?.name || defaultBookName(ui.snapshot, "card").replace(/-小手机记忆/, "-小手机世界书"), { required: true, max: 120 }) + select("范围", "scope", [["card", "整张角色卡共用（推荐：这张卡新开的聊天共用同一本）"], ["chat", "只给当前聊天用（每个聊天一本，互不混）"]], "card") + select("写入内容", "sources", [["all", "日记 + 心迹 + 摘要 + 人物档案 + 约定（推荐）"], ["light", "只写日记、心迹与约定"], ["persona", "只写人物档案（NPC 性格与资料）"]], "all"), { submit: "创建并同步" });
        if (!r) return;
        try {
          const sourceKeys = r.sources === "light" ? ["diary", "hearts", "agenda"] : r.sources === "persona" ? ["persona"] : ["diary", "hearts", "summaries", "persona", "agenda"];
          const sources = Object.fromEntries(Object.keys(BOOK_SOURCES).map(k => [k, sourceKeys.includes(k)]));
          const res = await ui.engine.bookStudio.link({ name: r.name, scope: r.scope, sources });
          const st = res?.stats;
          ui.notify("世界书已创建并绑定。" + (st ? `新增 ${st.created} 条、更新 ${st.updated} 条。` : ""));
        } catch (err) {
          if (err?.code === "BOOK_EXISTS") {
            ui.notify("已存在同名世界书（" + err.count + " 个条目），没有覆盖。请改用“读取已有世界书并同步”来预览连接。", "error");
          } else ui.notify(err?.message || "创建失败", "error");
        }
        return;
      }
      case "book-sync": {
        try {
          const res = await ui.engine.bookStudio.sync({ reason: "manual", force: true });
          const st = res?.stats;
          ui.notify(st ? `同步完成：新增 ${st.created} · 更新 ${st.updated} · 取回 ${st.pulled} · 删除 ${st.deleted}${st.skipped ? " · 跳过 " + st.skipped : ""}` : "没有需要同步的变化。");
        } catch (err) {
          ui.notify(err?.message || "同步失败", "error");
        }
        return;
      }
      case "book-rebuild": {
        if (!await ui.confirm("以手机数据重建世界书？", "会先删除世界书里由本工坊写入的全部条目，再按当前手机数据重新写入。你自己手写的其它条目不动。", "重建")) return;
        try {
          const res = await ui.engine.bookStudio.rebuildFromPhone();
          ui.notify("已重建：" + (res?.stats?.created || 0) + " 条。");
        } catch (err) {
          ui.notify(err?.message || "重建失败", "error");
        }
        return;
      }
      case "book-rebind": {
        try {
          await ui.engine.bookStudio.rebind();
          ui.notify("已重新绑定世界书。");
        } catch (err) {
          ui.notify(err?.message || "绑定失败", "error");
        }
        return;
      }
      case "book-unlink": {
        if (!await ui.confirm("停止世界书工坊同步？", "世界书本身与已写入的条目都会保留；手机不再自动同步。", "停止同步")) return;
        await ui.engine.bookStudio.unlink();
        ui.notify("已停止同步，世界书保留。");
        return;
      }
      case "book-autosync": {
        await ui.engine.bookStudio.setAutoSync(!!ui.data?.bookSync?.autoSync === false);
        return;
      }
      case "book-src": {
        const id2 = value;
        const on = !(ui.data?.bookSync?.sources?.[id2] !== false);
        await ui.engine.bookStudio.setSource(id2, on);
        ui.notify((BOOK_SOURCES[id2] || id2) + (on ? "：已开始写入世界书。" : "：已停止写入（世界书里已有条目保留，可点“清理已停用来源的条目”）。"));
        return;
      }
      case "book-options": {
        const b = ui.engine.bookStudio.info();
        const r = await ui.dialog("写入细节", field("条目前缀", "prefix", b.prefix, { max: 20 }) + field("最多写入条目数", "maxEntries", b.maxEntries, { type: "number" }) + select("世界书里的修改", "pullBack", [["1", "取回手机（推荐：日记、摘要、备忘、约定可回写）"], ["0", "只写不取回（手机数据优先）"]], b.pullBack ? "1" : "0") + select("人物档案条目", "constantPersona", [["0", "按关键词触发（推荐：省 token）"], ["1", "常驻（整本贯穿，语气与性格更稳）"]], b.constantPersona ? "1" : "0"), { submit: "保存" });
        if (!r) return;
        await ui.engine.bookStudio.setOptions({ prefix: r.prefix, maxEntries: Number(r.maxEntries), pullBack: r.pullBack !== "0", constantPersona: r.constantPersona === "1" });
        ui.notify("写入细节已保存。");
        return;
      }
      case "book-preview":
        download(ui, "小手机-世界书条目预览.json", ui.engine.bookStudio.preview());
        return;
      case "book-clean-orphans": {
        if (!await ui.confirm("清理已停用来源的条目？", "只删除世界书里由本工坊写入、但当前手机数据中已不存在或已关闭来源的条目。", "清理")) return;
        const res = await ui.engine.bookStudio.cleanOrphans();
        ui.notify(res.removed ? "已清理 " + res.removed + " 条。" : "没有需要清理的条目。");
        return;
      }
      case "book-accept-delete": {
        if (!await ui.confirm("按世界书删除对应条目？", "手机里的日记、记忆与心迹本身不会被删除；只是停止这次的世界书条目与手机记录的对应关系。", "继续")) return;
        await ui.engine.bookStudio.acceptMassDelete();
        ui.notify("已按世界书状态同步。");
        return;
      }
      case "soul-toggle": {
        const soul = engine.soul, on = !ui.data.soul.enabled;
        await change(ui, (s) => {
          s.soul.enabled = on;
          soulData(s).log = [...soulData(s).log || [], { ts: Date.now(), kind: "info", text: on ? "启用灵魂链接（内置）" : "关闭灵魂链接（内置）" }].slice(-200);
        }, "开关灵魂链接");
        if (on && !Object.keys(ui.data.soul.roster).length) ui.notify("灵魂链接已启用：先从通讯录登记角色，或手动添加。");
        else ui.notify(on ? "灵魂链接已启用。" : "灵魂链接已关闭（档案保留）。");
        return;
      }
      case "soul-auto-toggle":
        await change(ui, (s) => {
          s.soul.auto.enabled = !s.soul.auto.enabled;
        }, "灵魂链接自动维护");
        return;
      case "soul-roleplay-toggle":
        await change(ui, (s) => {
          s.soul.roleplay.enabled = !s.soul.roleplay.enabled;
          if (s.soul.roleplay.enabled && s.soul.roleplay.mode === "off") s.soul.roleplay.mode = "manual";
        }, "灵魂链接角色推演");
        engine.soul.installBarrier();
        return;
      case "soul-mode": {
        const pick = await ui.dialog("发送前推演方式", hint("「拦截发送按钮」会在你点发送时先跑一遍推演，最多等设定秒数，失败就照常发送。"), { choices: [["manual", "仅手动 / 手机内发送时推演"], ["barrier", "拦截酒馆发送按钮，先推演再发"], ["off", "关闭推演"], ["cancel", "取消"]] });
        if (!pick || pick.choice === "cancel") return;
        await change(ui, (s) => {
          s.soul.roleplay.mode = pick.choice;
          if (pick.choice !== "off") s.soul.roleplay.enabled = true;
        }, "设置推演方式");
        engine.soul.installBarrier();
        return;
      }
      case "soul-gate-mode": {
        const pick = await ui.dialog("档案预筛方式", hint("本地关键词：不消耗调用，只看最近正文里出现的名字。模型预筛：更准，但每轮多一次调用。"), { choices: [["local", "本地关键词（省调用）"], ["ai", "模型预筛（更准）"], ["cancel", "取消"]] });
        if (!pick || pick.choice === "cancel") return;
        await change(ui, (s) => {
          s.soul.auto.gateMode = pick.choice;
        }, "设置预筛方式");
        return;
      }
      case "soul-analyze": {
        const soul = engine.soul;
        assert(soul.enabled(), "先启用灵魂链接");
        ui.notify("正在更新 " + value + " 的档案…");
        const r = await soul.analyze(value);
        ui.notify(value + "：新增 " + r.added + " 条" + (r.skipped ? "，跳过重复 " + r.skipped + " 条" : "") + "。");
        return;
      }
      case "soul-analyze-all": {
        const soul = engine.soul;
        assert(soul.enabled(), "先启用灵魂链接");
        const names = Object.keys(ui.data.soul.roster);
        assert(names.length, "名单为空：先从通讯录登记角色");
        ui.notify("正在更新全部档案（并发 " + ui.data.soul.cfg.concurrency + "）…");
        const r = await soul.analyzeAll({ names });
        ui.notify("完成：新增 " + r.added + " 条" + (r.failed ? "，失败 " + r.failed + " 个（可重试）" : "") + "。");
        return;
      }
      case "soul-condense": {
        const r = await engine.soul.condense(value);
        ui.notify(value + "：精编 " + r.before + " → " + r.after + " 条。");
        return;
      }
      case "soul-roleplay": {
        assert(engine.soul.enabled(), "先启用灵魂链接");
        ui.notify("正在推演…");
        const r = await engine.soul.roleplay({ manual: true });
        ui.notify("推演完成：" + r.actors.map((x) => x.name).join("、") + (r.injected ? "，已注入下一次生成的正文提示。" : "，但注入接口未就绪。"));
        return;
      }
      case "soul-roleplay-clear":
        engine.soul.clearRoleplay();
        await change(ui, (s) => {
          soulData(s).last.actors = [];
        }, "清除推演注入");
        ui.notify("已清除推演注入。");
        return;
      case "soul-add-char": {
        const name = await askText(ui, "添加角色到灵魂链接", "角色名（与通讯录/正文一致）", { max: 40, multiline: false });
        if (!name) return;
        const aliases = await askText(ui, "别名（可选）", "用顿号或逗号分隔，可留空", { max: 200, multiline: false });
        await change(ui, (s) => {
          soulEnsure(soulData(s), name, { aliases: String(aliases || "").split(/[、,，\s]+/).filter(Boolean), source: "manual" });
        }, "添加灵魂链接角色");
        ui.go("soulChar", name);
        return;
      }
      case "soul-import-contacts": {
        let added = 0;
        await change(ui, (s) => {
          for (const c of s.contacts) {
            if (c.recognized !== true) continue;
            if (soulData(s).roster[c.name]) continue;
            soulEnsure(soulData(s), c.name, { aliases: c.aliases || [], source: "contact" });
            added++;
          }
        }, "灵魂链接 · 从通讯录登记");
        ui.notify(added ? "已登记 " + added + " 个角色。" : "没有可登记的新角色（未相认的联系人会跳过）。");
        return;
      }
      case "soul-char-del": {
        if (!await ui.confirm("从灵魂链接删除「" + value + "」？", "只删这份档案；联系人、记忆与世界书里的条目都不动。", "删除")) return;
        await change(ui, (s) => {
          delete s.soul.roster[value];
        }, "删除灵魂链接角色");
        ui.go("soul", "", { replace: true });
        ui.notify("已删除档案。");
        return;
      }
      case "soul-entry-del": {
        const [name, section, entryId] = String(value || "").startsWith("[") ? JSON.parse(value) : String(value || "").split("|");
        await change(ui, (s) => {
          soulRemoveEntry(soulData(s), name, section, entryId);
        }, "删除灵魂链接条目");
        return;
      }
      case "soul-pull-phone": {
        let added = 0;
        await change(ui, (s) => {
          const c = s.contacts.find((x) => x.name === value);
          assert(c, "联系人不存在");
          const lines = [];
          const t = s.threads.find((x) => x.kind === "direct" && x.members[0] === c.id);
          for (const m of (t?.messages || []).slice(-6)) lines.push("【小手机·交流】" + (m.role === "user" ? "我：" : "") + text(m.text, 80) + (m.story ? "（" + text(m.story, 30) + "）" : ""));
          for (const d of s.diary.filter((x) => x.author === c.id).slice(-4)) lines.push("【小手机·" + (d.kind === "heart" ? "心迹" : "日记") + "】" + text(d.text, 80));
          for (const a2 of s.agenda.filter((x) => String(x.title || "").includes(value)).slice(-4)) lines.push("【小手机·约定】" + text(a2.title, 60) + (a2.date ? "（" + a2.date + "）" : ""));
          assert(lines.length, "这个角色还没有可合入的手机记录");
          for (const line of lines) if (soulAddEntry(soulData(s), value, "记忆", line, { floor: ui.snapshot?.floor ?? -1, source: "phone" }).added) added++;
          soulData(s).stats.entries = Object.values(soulData(s).roster).reduce((n, row) => n + soulEntryCount(row), 0);
        }, "灵魂链接 · 合入手机记录");
        ui.notify(added ? "已合入 " + added + " 条手机记录。" : "没有新内容（已去重）。");
        return;
      }
      case "soul-export": {
        const r = engine.soul.exportRoster();
        download(ui, "灵魂链接名单-" + new Date().toISOString().slice(0, 10) + ".json", r);
        return;
      }
      case "soul-import": {
        const file = await ui.pickFile(".json,application/json", 8 * 1024 * 1024);
        if (!file) return;
        let raw = null;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          assert(false, "文件不是有效的 JSON");
        }
        let stats = null;
        await change(ui, (s) => {
          stats = soulRosterImport(soulData(s), raw);
        }, "导入灵魂链接名单");
        ui.notify("导入完成：新增/覆盖 " + stats.characters + " 个角色，新增 " + stats.entries + " 条（重复跳过 " + stats.skipped + "）。");
        return;
      }
      case "soul-preset": {
        const key = value, label = SOUL_PROMPT_LABELS[key] || key;
        const r = await ui.dialog("编辑预设 · " + label, field("提示词（≤8000 字）", "text", ui.data.soul.presets?.[key] || SOUL_DEFAULT_PROMPTS[key], { textarea: true, max: 8000 }), { submit: "保存" });
        if (!r) return;
        await change(ui, (s) => {
          s.soul.presets[key] = text(r.text, 8000);
        }, "保存灵魂链接预设");
        ui.notify(label + " 预设已保存。");
        return;
      }
      case "soul-preset-reset":
        await change(ui, (s) => {
          delete s.soul.presets[value];
        }, "恢复灵魂链接预设");
        ui.notify("已恢复默认。");
        return;
      case "soul-presets-export":
        download(ui, "灵魂链接提示词.json", { app: "tsukiyo-phone", kind: "soul-presets", version: VERSION, presets: clone(ui.data.soul.presets || {}) });
        return;
      case "soul-presets-import": {
        const file = await ui.pickFile(".json,application/json", 2 * 1024 * 1024);
        if (!file) return;
        let raw = null;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          assert(false, "文件不是有效的 JSON");
        }
        const presets = raw?.presets && isObject(raw.presets) ? raw.presets : raw;
        let n2 = 0;
        await change(ui, (s) => {
          for (const key of SOUL_PROMPT_KEYS) if (typeof presets[key] === "string" && presets[key].trim()) {
            s.soul.presets[key] = text(presets[key], 8000);
            n2++;
          }
        }, "导入灵魂链接预设");
        ui.notify(n2 ? "已导入 " + n2 + " 套预设。" : "文件里没有可用的预设字段（analyze / gate / roleplay / condense）。");
        return;
      }
      case "soul-log-clear":
        await change(ui, (s) => {
          soulData(s).log = [];
          soulData(s).lastError = "";
          soulData(s).stats.lastError = "";
        }, "清空灵魂链接日志");
        engine.soul.lastError = "";
        ui.notify("已清空日志。");
        return;
      /* ---------- 记忆工作台（v2.9） ---------- */
      case "ms-delegate-toggle": {
        const next = ui.data.ms.delegate.enabled === false;
        const active = ui.engine.ms.setDelegate(next);
        ui.notify(next ? active ? "已交给百宝月夜书管理楼层记忆：手机不再生成楼层摘要、不再注入楼层记忆。" : "开关已打开，但没检测到百宝月夜书「剧情剪辑台」，手机继续自己管理。" : "已改回手机自己管理楼层记忆。");
        return;
      }
      case "ms-delegate-phone-recall": {
        const cur = ui.data.ms.delegate.keepPhoneRecall === true;
        ui.engine.ms.setDelegate(ui.data.ms.delegate.enabled !== false, { keepPhoneRecall: !cur });
        ui.notify(cur ? "接管期间不再注入手机内记忆。" : "接管期间会继续注入手机内记忆（只含手机自己的记忆，不含楼层摘要）。");
        return;
      }
      case "ms-engine-sync": {
        const d = ui.engine.ms.syncMirror({ force: true });
        if (!d) ui.notify("没检测到百宝月夜书「剧情剪辑台」（需要挂在 window.STBaiBaiBook.memoryEditor）。");
        else if (d.closed) ui.notify("检测到「剧情剪辑台」，但它的总开关是关着的：手机继续自己管楼层记忆。到剪辑台里打开总开关就会自动接管。");
        else ui.notify("已读取百宝月夜书剪辑台镜像：摘要 " + ((d.counts && (d.counts.active ?? d.counts.summaries)) ?? 0) + " 条 · 缺口 " + ((d.coverage && (d.coverage.missing || []).length) || 0) + " 段。");
        return;
      }
      case "ms-engine-open": {
        // v2.9.5：反向打开百宝月夜书的剪辑台抽屉（它的 memoryEditor 暴露了 open()）
        const found = ui.engine.ms.engineEditor();
        const open = found && typeof found.api.open === "function" ? found.api.open : null;
        if (!open) {
          ui.notify(found ? "这个版本的剪辑台没提供 open()（需要百宝月夜书 1.4.2+）。先在魔杖菜单里点「剧情剪辑台」。" : "没检测到百宝月夜书「剧情剪辑台」。");
          return;
        }
        try {
          open.call(found.api);
          ui.notify("已打开百宝月夜书的「剧情剪辑台」。");
        } catch (e2) {
          ui.notify("打开剪辑台失败：" + text(e2 && e2.message ? e2.message : e2, 120));
        }
        return;
      }
      case "ms-engine-help":
        ui.notify("接线：百宝月夜书的「剧情剪辑台」挂在 window.STBaiBaiBook.memoryEditor，提供 capability() / mirror() 供手机只读；手机不改动它的记忆，也能用它的 open() 打开抽屉。");
        return;
      case "ms-tab":
        ui.go("ms", "", { tab: value || "overview", replace: true });
        return;
      case "ms-toggle":
        await change(ui, (s) => {
          msData(s).enabled = !msData(s).enabled;
        }, "记忆工作台开关");
        ui.notify(ui.data.ms.enabled ? "记忆工作台已启用。自动摘要走后台预算，召回注入随下一轮正文生效。" : "记忆工作台已关闭；摘要与账本仍保留。");
        return;
      case "ms-mode": {
        const order = ["extra", "manual", "reply"], cur = ui.data.ms.mode;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        await change(ui, (s) => {
          msData(s).mode = next;
        }, "记忆工作台摘要方式");
        ui.notify("摘要方式：" + MS_MODES[next] + "。");
        return;
      }
      case "ms-inject-toggle":
        await change(ui, (s) => {
          msData(s).inject.enabled = !msData(s).inject.enabled;
        }, "记忆工作台召回注入");
        ui.notify(ui.data.ms.inject.enabled ? "召回注入已打开：每次生成前会追加一个资料块。" : "召回注入已关闭（摘要与账本仍会维护）。");
        return;
      case "ms-options": {
        const v = ui.data.ms, c = v.cfg;
        const r = await ui.dialog("记忆工作台 · 召回与自动摘要", field("召回条数（摘要/账本类，0—20）", "recallTop", c.recallTop, { type: "number" }) + field("召回条数（手机记忆类，0—10）", "bodyTop", c.bodyTop, { type: "number" }) + field("相似度下限（0—1）", "minScore", c.minScore, { type: "number" }) + field("注入字数上限（600—12000）", "maxChars", c.maxChars, { type: "number" }) + field("注入深度（0—10）", "depth", c.depth, { type: "number" }) + field("自动摘要块大小（楼）", "every", v.auto.every, { type: "number" }) + field("自动摘要最短间隔（秒）", "minIntervalMs", Math.round((v.auto.minIntervalMs || 150000) / 1000), { type: "number" }) + checkbox("包含柏宝书生活细节", "includeLife", c.includeLife !== false) + checkbox("包含柏宝书历史剧情压缩", "includeBaibai", c.includeBaibai !== false) + checkbox("包含剧情状态账本", "includeLedger", c.includeLedger !== false) + hint("相似度用手机自己的本地词频向量算，不需要任何外部服务；下限调低会更爱召回，调高只留最像的。"), { submit: "保存" });
        if (!r) return;
        await change(ui, (s) => {
          const x = msData(s);
          x.cfg.recallTop = clamp(Math.round(Number(r.recallTop) || 0), 0, 20);
          x.cfg.bodyTop = clamp(Math.round(Number(r.bodyTop) || 0), 0, 10);
          x.cfg.minScore = clamp(Number(r.minScore) || 0, 0, 1);
          x.cfg.maxChars = clamp(Math.round(Number(r.maxChars) || 0) || 3600, 600, 12000);
          x.cfg.depth = clamp(Math.round(Number(r.depth) || 0), 0, 10);
          x.auto.every = clamp(Math.round(Number(r.every) || 0) || 6, 1, 40);
          x.auto.minIntervalMs = clamp(Math.round(Number(r.minIntervalMs) || 0) * 1000 || 150000, 3e4, 36e5);
          x.cfg.includeLife = r.includeLife !== false;
          x.cfg.includeBaibai = r.includeBaibai !== false;
          x.cfg.includeLedger = r.includeLedger !== false;
        }, "保存记忆工作台设置");
        ui.notify("已保存。");
        return;
      }
      case "ms-summarize-now": {
        const ms = engine.ms;
        assert(ui.data.ms.enabled, "先启用记忆工作台");
        const pending = ms.pendingBlocks();
        if (!pending) {
          const last = ui.data.ms.tree.length ? "最后一次摘要到 #" + (ms.coveredTo() + 1) + " 楼" : "还没有摘要";
          const yes = await ui.confirm("还不够一块", last + "；要现在为最近几楼生成一份剧情摘要吗？也可以先调小「自动摘要块大小」。");
          if (!yes) return;
        }
        const range = pending || [Math.max(0, ms.coveredTo() + 1), ui.snapshot.floor];
        if (range[0] > range[1]) {
          ui.notify("没有新的正文可以总结。");
          return;
        }
        ui.notify("正在生成 " + (range[0] + 1) + "—" + (range[1] + 1) + " 楼的剧情摘要…");
        await ms.block(range, { background: false });
        ui.notify("剧情摘要已进「待确认」：" + (range[0] + 1) + "—" + (range[1] + 1) + " 楼。");
        return;
      }
      case "ms-stage": {
        const ms = engine.ms, nodes = (ui.data.ms.tree || []).filter((n) => n.level === 0 && n.kept !== false);
        assert(nodes.length, "还没有剧情摘要可以合并");
        const from = Math.min(...nodes.map((n) => n.from)), to = Math.max(...nodes.map((n) => n.to));
        const r = await ui.dialog("阶段总结", field("起始楼层（1 起算，可留空）", "from", "", { type: "number" }) + field("结束楼层", "to", "", { type: "number" }) + hint("默认合并第 " + (from + 1) + "—" + (to + 1) + " 楼的所有剧情摘要，生成一条阶段总结草稿。"), { submit: "开始生成" });
        if (!r) return;
        const a2 = r.from ? clamp(Math.round(Number(r.from)) - 1, 0, 1e6) : from;
        const b = r.to ? clamp(Math.round(Number(r.to)) - 1, 0, 1e6) : to;
        assert(a2 <= b, "起始楼层大于结束楼层");
        ui.notify("正在生成阶段总结…");
        await ms.stage([a2, b], { background: false });
        ui.notify("阶段总结已进「待确认」。");
        return;
      }
      case "ms-longer": {
        const ms = engine.ms, nodes = (ui.data.ms.tree || []).filter((n) => n.level === 1 && n.kept !== false);
        assert(nodes.length >= 2, "至少要有两条阶段总结才能再压一层");
        ui.notify("正在生成多次总结…");
        await ms.longer([Math.min(...nodes.map((n) => n.from)), Math.max(...nodes.map((n) => n.to))], { background: false });
        ui.notify("多次总结已进「待确认」。");
        return;
      }
      case "ms-ledger-scan": {
        const ms = engine.ms, info = ms.info();
        const [a2, b] = info.floors;
        const r = await ui.dialog("核对剧情状态变化", field("起始楼层（1 起算）", "from", b > a2 ? Math.max(1, b + 1 - 12) : 1, { type: "number" }) + field("结束楼层", "to", b + 1, { type: "number" }) + hint("只记录材料里明确发生、且与已有账本不同的变化（人物、关系、约定、物品、地点、时间）。不确定的会进「待确认」，不会直接写进账本。"), { submit: "开始核对" });
        if (!r) return;
        const lo = clamp(Math.round(Number(r.from) || 1) - 1, 0, 1e6), hi = clamp(Math.round(Number(r.to) || 1) - 1, 0, 1e6);
        assert(lo <= hi, "起始楼层大于结束楼层");
        ui.notify("正在核对状态变化…");
        await ms.ledgerScan([lo, hi], { background: false });
        ui.notify("状态变化已进「待确认」。");
        return;
      }
      case "ms-ledger-phone": {
        const r = engine.ms.ledgerFromPhone();
        ui.notify("已汇入：新增 " + r.added + " 条，更新 " + r.updated + " 条" + (r.same ? "，无变化 " + r.same + " 条" : "") + "。");
        return;
      }
      case "ms-ledger-edit": {
        const row = ui.data.ms.ledger.find((x) => x.id === value);
        assert(row, "条目不存在");
        const r = await ui.dialog("修改状态 · " + MS_KINDS[row.kind] + " · " + row.subject, field("现在是（" + row.key + "）", "to", row.to, { max: 200 }) + field("依据（逐字引文）", "evidence", row.evidence || "", { textarea: true, max: 300 }) + hint("改动会记进这条的历史，随时可以看改动过程。"), { submit: "保存" });
        if (!r) return;
        engine.ms.ledgerEdit(value, { to: r.to, evidence: r.evidence });
        ui.notify("已保存。");
        return;
      }
      case "ms-draft-confirm":
        engine.ms.confirm(value);
        ui.notify("已确认并写进" + (ui.data.ms.ledger.some((x) => x.id === value) ? "账本" : "摘要树") + "。");
        return;
      case "ms-draft-reject":
        engine.ms.reject(value);
        ui.notify("已丢弃这条草稿。");
        return;
      case "ms-draft-edit": {
        const draft = ui.data.ms.drafts.find((d) => d.id === value);
        assert(draft, "草稿不存在");
        if (draft.kind === "ledger") {
          const rows = draft.rows || [];
          const r = await ui.dialog("编辑状态变化（" + ((draft.from ?? 0) + 1) + "—" + ((draft.to ?? 0) + 1) + " 楼）", rows.map((x, i) => field(MS_KINDS[x.kind] + " · " + x.subject + " ／ " + x.key, "row" + i, x.to, { max: 200 })).join("") + hint("留空表示这条不记。"), { submit: "保存" });
          if (!r) return;
          await change(ui, (s) => {
            const d = msData(s).drafts.find((x) => x.id === value);
            if (!d || !Array.isArray(d.rows)) return;
            const keep = [];
            d.rows.forEach((x, i) => {
              const next = text(r["row" + i], 200);
              if (next) keep.push({ ...x, to: next });
            });
            d.rows = keep;
          }, "编辑状态草稿");
          ui.notify("已更新草稿。");
          return;
        }
        const one = await askText(ui, "编辑" + (MS_LEVEL_NAME[draft.level] || "摘要") + "草稿", "摘要正文", { value: draft.text, max: 3e3 });
        if (one == null) return;
        engine.ms.editDraft(value, { text: one });
        ui.notify("已更新草稿。");
        return;
      }
      case "ms-drafts-confirm-all": {
        const n = engine.ms.draftsConfirmAll();
        ui.notify(n ? "已确认 " + n + " 条草稿。" : "没有待确认的草稿。");
        return;
      }
      case "ms-drafts-clear": {
        const n = ui.data.ms.drafts.length;
        if (!n) return;
        if (!await ui.confirm("丢弃全部待确认（" + n + " 条）", "丢弃的只是还没确认的草稿；已经确认的摘要与账本不受影响。")) return;
        engine.ms.draftsClear();
        ui.notify("已清空待确认。");
        return;
      }
      case "ms-undo": {
        const label = engine.ms.undo();
        ui.notify(label ? "已撤回：" + label + "。" : "没有可以撤回的操作。");
        return;
      }
      case "ms-node-toggle": {
        const node = ui.data.ms.tree.find((x) => x.id === value);
        assert(node, "摘要不存在");
        engine.ms.nodeKept(value, node.kept === false);
        ui.notify(node.kept === false ? "已重新启用这条摘要。" : "已停用这条摘要（内容保留）。");
        return;
      }
      case "ms-node-edit": {
        const node = ui.data.ms.tree.find((x) => x.id === value);
        assert(node, "摘要不存在");
        const r2 = await askText(ui, "编辑" + (MS_LEVEL_NAME[node.level] || "摘要") + " · " + (node.from + 1) + "—" + (node.to + 1) + " 楼", "摘要正文", { value: node.text, max: 3e3 });
        if (r2 == null) return;
        engine.ms.nodeEdit(value, r2);
        ui.notify("已保存。");
        return;
      }
      case "ms-node-del": {
        const node = ui.data.ms.tree.find((x) => x.id === value);
        assert(node, "摘要不存在");
        if (!await ui.confirm("删除这条摘要？", (MS_LEVEL_NAME[node.level] || "摘要") + " · " + (node.from + 1) + "—" + (node.to + 1) + " 楼\n删除后可以用「撤回上一步」找回。")) return;
        engine.ms.nodeDelete(value);
        ui.notify("已删除（可撤回）。");
        return;
      }
      case "ms-preview-recall": {
        const r = engine.ms.picks();
        const lines = r.picks.map((x) => "· " + x.label + "（" + x.score.toFixed(2) + "）—— " + x.why.join("、"));
        await ui.dialog("这一轮会注入什么（只预览）", hint("共 " + r.picks.length + " 条 / " + r.chars + " 字（上限 " + r.budget + "）· 关键词：" + (r.keywords.join("、") || "无")) + `<pre>${e(r.picks.map((x) => "【" + x.label + "】\n" + x.text).join("\n\n") || "当前没有条目入选：可以调低相似度下限，或先补摘要。")}</pre>` + (lines.length ? `<details class="details"><summary>命中理由</summary><p class="tiny">${e(lines.join("\n"))}</p></details>` : ""), { choices: [["ok", "关闭", "primary"]] });
        return;
      }
      case "ms-keywords": {
        const r = await ui.dialog("常驻检索关键词", field("关键词（顿号 / 逗号 / 换行分隔，最多 20 个）", "words", (ui.data.ms.cfg.keywords || []).join("、"), { textarea: true, max: 400 }) + hint("常驻关键词会在召回时额外加权；也可以用「让模型挑关键词」按最近几楼自动挑一次。"), { submit: "保存" });
        if (!r) return;
        const words = String(r.words || "").split(/[、,，\s\n]+/).map((x) => text(x, 20)).filter(Boolean).slice(0, 20);
        await change(ui, (s) => {
          msData(s).cfg.keywords = words;
        }, "保存检索关键词");
        ui.notify(words.length ? "已保存 " + words.length + " 个关键词。" : "已清空关键词。");
        return;
      }
      case "ms-backfill": {
        const ms = engine.ms, info = ms.info();
        const gaps = info.coverage?.missing || [];
        assert(gaps.length, "当前范围没有缺口");
        const est = gaps.length;
        if (!await ui.confirm("补课全部缺口？", "会为 " + est + " 段（每段 " + (info.coverage.step || 6) + " 楼）各调用一次模型，全部先进「待确认」。\n后台生成不会打断你，中途切聊天会自动停止。")) return;
        ui.notify("开始补课：共 " + est + " 段…");
        const r = await ms.backfill({ onProgress: (p) => ui.notify("补课 " + (p.done + 1) + "/" + p.total + "：" + (p.range[0] + 1) + "—" + (p.range[1] + 1) + " 楼…") });
        ui.notify("补课完成：" + r.blocks + " 份摘要草稿在「待确认」里。");
        return;
      }
      case "ms-backfill-range": {
        const ms = engine.ms, info = ms.info();
        const r = await ui.dialog("指定范围补课", field("起始楼层（1 起算）", "from", info.floors[0] + 1, { type: "number" }) + field("结束楼层", "to", info.floors[1] + 1, { type: "number" }) + field("每块楼数（1—40，默认 " + (ui.data.ms.auto.every || 6) + "）", "batch", ui.data.ms.auto.every || 6, { type: "number" }) + hint("只会补没有摘要覆盖的楼层段；已经有摘要的不会被重做。"), { submit: "开始" });
        if (!r) return;
        const lo = clamp(Math.round(Number(r.from) || 1) - 1, 0, 1e6), hi = clamp(Math.round(Number(r.to) || 1) - 1, 0, 1e6);
        assert(lo <= hi, "起始楼层大于结束楼层");
        const batch = clamp(Math.round(Number(r.batch) || 6), 1, 40);
        const gaps = msCoverage(ui.data.ms.tree, lo, hi, batch).missing;
        assert(gaps.length, "这个范围没有缺口");
        if (!await ui.confirm("补课 " + gaps.length + " 段？", "每段一次模型调用：" + gaps.slice(0, 8).map(([a2, b]) => (a2 + 1) + "—" + (b + 1) + " 楼").join("、") + (gaps.length > 8 ? " …" : ""))) return;
        ui.notify("开始补课…");
        const res = await ms.backfill({ from: lo, to: hi, batch, onProgress: (p) => ui.notify("补课 " + (p.done + 1) + "/" + p.total + "…") });
        ui.notify("补课完成：" + res.blocks + " 份草稿。");
        return;
      }
      case "ms-fill-gap": {
        const [a2, b] = String(value).split("|").map((x) => Number(x));
        assert(Number.isFinite(a2) && Number.isFinite(b), "范围无效");
        ui.notify("正在生成 " + (a2 + 1) + "—" + (b + 1) + " 楼的剧情摘要…");
        await engine.ms.block([a2, b], { background: false });
        ui.notify("已进「待确认」。");
        return;
      }
      case "ms-shelve": {
        const r = engine.ms.shelve({});
        ui.notify(r.hidden ? "已隐藏 " + r.hidden + " 个旧楼层（只隐藏，不删除；在酒馆里可以随时取消隐藏）。" : "没有可以收纳的楼层：需要先有阶段总结，且旧楼层超出保留范围。");
        return;
      }
      case "ms-unshelve": {
        const n = engine.ms.unshelve();
        ui.notify(n ? "已恢复 " + n + " 个楼层。" : "没有记录到需要恢复的楼层。");
        return;
      }
      case "ms-shelve-toggle": {
        const v = ui.data.ms;
        await change(ui, (s) => {
          msData(s).shelve.enabled = !msData(s).shelve.enabled;
        }, "楼层收纳开关");
        if (ui.data.ms.shelve.enabled && !engine.ms.canShelve()) ui.notify("已打开，但当前宿主没有检测到隐藏楼层的接口：这个开关在你的酒馆里暂时只做记录。");
        else ui.notify(ui.data.ms.shelve.enabled ? "已打开自动收纳（每 10 分钟检查一次）。" : "已关闭自动收纳。");
        return;
      }
      case "ms-shelve-options": {
        const r = await ui.dialog("楼层收纳设置", field("至少保留最近多少楼不隐藏（10—2000）", "keep", ui.data.ms.shelve.keepRecent, { type: "number" }) + hint("只有被「阶段总结」覆盖过、又超出这个保留范围的楼层才会被隐藏。"), { submit: "保存" });
        if (!r) return;
        await change(ui, (s) => {
          msData(s).shelve.keepRecent = clamp(Math.round(Number(r.keep) || 80), 10, 2e3);
        }, "保存收纳设置");
        ui.notify("已保存。");
        return;
      }
      case "ms-preset": {
        const key = value, label = MS_PROMPT_LABELS[key] || key;
        const r = await ui.dialog("编辑提示词 · " + label, field("提示词（≤8000 字）", "text", ui.data.ms.presets?.[key] || MS_DEFAULT_PROMPTS[key], { textarea: true, max: 8e3 }) + hint("这里的提示词只用于记忆工作台自己的生成；换掉后仍然要求模型只输出 JSON。"), { submit: "保存" });
        if (!r) return;
        await change(ui, (s) => {
          msData(s).presets[key] = text(r.text, 8e3);
        }, "保存记忆工作台提示词");
        ui.notify(label + " 已保存。");
        return;
      }
      case "ms-presets-reset":
        if (!await ui.confirm("恢复默认提示词？", "只影响记忆工作台的 5 套提示词，不影响手机其它模块。")) return;
        await change(ui, (s) => {
          msData(s).presets = { ...MS_DEFAULT_PROMPTS };
        }, "恢复记忆工作台提示词");
        ui.notify("已恢复默认。");
        return;
      case "ms-export":
        download(ui, "记忆档案-" + new Date().toISOString().slice(0, 10) + ".json", engine.ms.archiveExport());
        return;
      case "ms-import": {
        const file = await ui.pickFile(".json,application/json", 12 * 1024 * 1024);
        if (!file) return;
        let raw = null;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          assert(false, "文件不是有效的 JSON");
        }
        const r = engine.ms.archiveImport(raw);
        ui.notify("导入完成：新增 " + r.nodes + " 条摘要 / " + r.ledger + " 条状态" + (r.skipped ? "，跳过重复或无效 " + r.skipped + " 条" : "") + "。");
        return;
      }
      case "ms-config-export":
        download(ui, "记忆工作台配置.json", engine.ms.configExport());
        return;
      case "ms-config-import": {
        const file = await ui.pickFile(".json,application/json", 4 * 1024 * 1024);
        if (!file) return;
        let raw = null;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          assert(false, "文件不是有效的 JSON");
        }
        const r = engine.ms.configImport(raw);
        ui.notify("已导入 " + r.fields + " 项设置（摘要树与账本不受影响）。");
        return;
      }
      case "ms-diag": {
        const d = engine.ms.diag();
        await ui.dialog("记忆工作台 · 脱敏诊断", hint("只有版本、数量与开关：不含正文、角色名、API 端点或密钥，可以直接贴给别人看。") + `<pre>${e(JSON.stringify(d, null, 2))}</pre>`, { choices: [["ok", "关闭", "primary"], ["save", "导出为文件"]] }).then((r) => {
          if (r === "save") download(ui, "记忆诊断-" + new Date().toISOString().slice(0, 10) + ".json", d);
        });
        return;
      }
      case "ms-log-clear":
        await change(ui, (s) => {
          msData(s).log = [];
        }, "清空记忆工作台记录");
        engine.ms.lastError = "";
        ui.notify("已清空记录。");
        return;
      /* ---------- 百宝月夜书 · 公开 API 联动（v2.9） ---------- */
      case "memapi-toggle":
        await change(ui, (s) => {
          memApiData(s).enabled = !memApiData(s).enabled;
        }, "记忆联动开关");
        ui.notify(ui.data.memApi.enabled ? "公开 API 联动已启用：不会自动拉取，只有你点「拉取一次资料」或测试连接时才会请求。" : "公开 API 联动已关闭（已拉取的资料留在本机镜像里，可以导出）。");
        return;
      case "memapi-options": {
        const c = ui.engine.memApi.cfg();
        const r = await ui.dialog("百宝月夜书 · 公开 API 联动设置", select("读取方式", "transport", [["command", "酒馆指令（/bbs-get，最稳，推荐）"], ["http", "HTTP 地址（需要插件开放入口或你挂了反代）"]], c.transport) + field("HTTP 地址（选 HTTP 方式时生效）", "base", c.base, { max: 300 }) + field("访问令牌（可选，放 Authorization: Bearer）", "token", c.token, { max: 300 }) + field("超时（毫秒，800—20000）", "timeoutMs", c.timeoutMs, { type: "number" }) + hint("指令方式用的是你记忆引擎文档里的 /bbs-get resource=… format=json，不猜它的内部结构；HTTP 方式默认指向 " + MEMAPI_HTTP_DEFAULT + "，取不到就换回指令方式。"), { submit: "保存" });
        if (!r) return;
        await change(ui, (s) => {
          const m = memApiData(s);
          m.transport = r.transport === "http" ? "http" : "command";
          m.base = text(r.base, 300) || MEMAPI_HTTP_DEFAULT;
          m.token = text(r.token, 300);
          m.timeoutMs = clamp(Math.round(Number(r.timeoutMs) || 4000), 800, 2e4);
        }, "保存记忆联动设置");
        ui.notify("已保存。");
        return;
      }
      case "memapi-test": {
        const link = engine.memApi;
        assert(link.on(), "先启用公开 API 联动");
        ui.notify("正在测试连接…");
        const info = await link.test();
        ui.notify("连接成功：API 版本 " + (info.apiVersion || "未报告") + (info.pluginVersion ? " · 插件 " + info.pluginVersion : "") + (info.character ? " · 主角 " + info.character : "") + " · 人物 " + info.npcs + " · 物品 " + info.items + " · 生活细节 " + info.life + "。");
        return;
      }
      case "memapi-pull": {
        const link = engine.memApi;
        assert(link.on(), "先启用公开 API 联动");
        ui.notify("正在拉取…");
        const out = await link.pull();
        ui.notify(out.ok ? "已拉取：历史 " + out.history.length + " 字 · 人物 " + out.npcs.length + " · 物品 " + out.items.length + " · 生活细节 " + out.life.length + "。" : "没有取到资料：" + out.note);
        return;
      }
      case "memapi-preview": {
        const m = engine.memApi.mirror();
        assert(m?.at, "还没有拉取过资料");
        const blocks = [
          m.history ? "【历史剧情（压缩）】\n" + text(m.history, 4000) : "",
          (m.npcs || []).length ? "【人物】\n" + m.npcs.slice(0, 20).map((n) => [n.name, n.relation, n.affinity, n.note].filter(Boolean).join(" · ")).join("\n") : "",
          (m.items || []).length ? "【物品】\n" + m.items.slice(0, 20).map((x) => x.name + " ×" + x.qty + (x.location ? "（在 " + x.location + "）" : "")).join("\n") : "",
          (m.life || []).length ? "【生活细节】\n" + m.life.slice(0, 20).map((x) => (x.subject === "user" ? "玩家" : x.subject) + "：" + x.text).join("\n") : ""
        ].filter(Boolean);
        await ui.dialog("拉到的资料（本机只读镜像）", hint(autoAgo(m.at) + " 拉取 · " + (m.ok ? "可用" : "上次没取到") + (m.coverage ? " · 它报告的缺口 " + (m.coverage.missingAiFloors || []).length + " 楼" : "")) + `<pre>${e(blocks.join("\n\n") || "没有内容")}</pre>`, { choices: [["ok", "关闭", "primary"]] });
        return;
      }
      case "memapi-import": {
        const m = engine.memApi.mirror();
        assert(m?.ok && m.history, "还没有可导入的历史摘要：先拉取一次资料");
        const floor = m.historyFloor;
        const rows = String(m.history).split(/\n+/).map((x) => text(x, 400)).filter((x) => x.length > 6).slice(0, 20);
        assert(rows.length, "历史摘要内容太短，没有可导入的段落");
        const snapNow = snapshot(ui);
        const have = new Set(ui.data.memories.map((x) => x.id));
        const fresh = rows.map((line) => ({ id: "baibai-api-" + fingerprint(line), kind: "narrative_fact", title: "柏宝书·历史摘要（API）", text: line, keys: [], enabled: true, audience: ["user"], visibility: "private", sources: [{ note: "百宝月夜书 · 公开 API getHistory" + (floor === null ? "" : " · 覆盖到 #" + (floor + 1) + " 楼") }], bb: { kind: "history-api" } })).filter((x) => !have.has(x.id));
        if (!fresh.length) {
          ui.notify("柏宝书的历史摘要已经导入过，没有新的段落。");
          return;
        }
        if (!await ui.confirm("导入柏宝书的历史摘要？", "将把 " + fresh.length + " 段历史摘要存为手机记忆，并带上「柏宝书」标记：不会同步进记忆世界书、也不会重复注入正文（避免和记忆工作台的召回打架），只作为资料与检索候选。\n只有玩家自己知道这些内容。")) return;
        let count = 0;
        await change(ui, (s) => {
          const ids = new Set(s.memories.map((x) => x.id));
          for (const c of fresh) {
            if (ids.has(c.id) || s.memories.length >= 1e3) continue;
            s.memories.push(c);
            ids.add(c.id);
            count += 1;
          }
          log(s, "info", "从百宝月夜书公开 API 导入 " + count + " 段历史摘要", "memory");
        }, "导入柏宝书历史摘要", snapNow);
        ui.notify("已导入 " + count + " 段历史摘要。");
        return;
      }
      case "memapi-export": {
        const m = engine.memApi.mirror();
        assert(m?.at, "还没有拉取过资料");
        download(ui, "百宝月夜书资料镜像-" + new Date().toISOString().slice(0, 10) + ".json", { app: "tsukiyo-phone", kind: "baibai-mirror", version: VERSION, exportedAt: new Date().toISOString(), mirror: m });
        return;
      }

      case "export-readable": {
        const d = phoneReadableDump(ui.data);
        downloadText(ui, d.filename, d.text);
        return;
      }
      case "contact-pack-export": {
        const pack = contactPackFrom(ui.data, value);
        download(ui, "月夜来信-档案包-" + text(pack.contact.name, 20) + ".json", pack);
        return;
      }
      case "contact-pack-import": {
        const file = await ui.pickFile(".json,application/json", 8 * 1024 * 1024);
        if (!file) return;
        let raw = null;
        try {
          raw = JSON.parse(await file.text());
        } catch {
          assert(false, "文件不是有效的 JSON");
        }
        const pack = raw?.kind === "contact-pack" ? raw : raw?.pack?.kind === "contact-pack" ? raw.pack : null;
        assert(pack, "这不是联系人档案包（应为 kind=contact-pack 的 JSON）");
        const ok = await ui.dialog("导入联系人档案包", `<p class="copy">${e(pack.contact.name)}：记忆 ${(pack.memories || []).length} · 日记/心迹 ${(pack.diary || []).length} · 约定 ${(pack.agenda || []).length} · 私聊记录 ${(pack.threads || []).length} 段</p><p class="tiny muted">同名联系人不会被重复创建：资料、记忆与消息按内容去重合并；不会搬来来源卡的世界书链接。</p>`, { submit: "导入", cancel: "取消" });
        if (!ok) return;
        let stats = null;
        await change(ui, (s) => {
          stats = applyContactPack(s, pack);
        }, "导入联系人档案包");
        ui.notify((stats.contact ? "已新建联系人 " + stats.name : "已并入现有联系人 " + stats.name) + `：记忆 +${stats.memories} · 日记/心迹 +${stats.diary} · 约定 +${stats.agenda} · 消息 +${stats.messages}`);
        return;
      }
      case "proactive-log-clear": {
        if (!await ui.confirm("清空主动来信记录？", "只清掉“避免重复话题”用的记录，不影响消息、记忆、世界书或柏宝书。", "清空")) return;
        await change(ui, (s) => {
          s.automation.proactiveLog = [];
        }, "清空主动来信记录");
        ui.notify("已清空主动来信记录。");
        return;
      }
      case "export-backup":
      case "export-records": {
        const b = await exportBackup(engine.repo, engine.media, { includeMedia: action === "export-backup" });
        download(ui, "月夜来信-" + (action === "export-backup" ? "完整备份" : "仅记录备份") + ".json", b);
        return;
      }
      case "restore-backup":
        return restore(ui);
    }
    throw Error("这个操作当前不可用");
  }
  async function handleForm(ui, type, values, form) {
    if (type === "api") {
      const p = ui.engine.settings.saveProfile({ ...values, type: "openai", id: values.id || void 0, temperature: Number(values.temperature), maxTokens: Number(values.maxTokens) });
      ui.go("api", "", { replace: true });
      ui.notify("方案已保存；现在可以把各模块分配给它。");
      return;
    }
    if (type === "automation") {
      await ui.engine.saveAuto(values);
      ui.notify("后台规则已保存。");
      return;
    }
    if (type === "soul") {
      if (!ui.data) return;
      await change(ui, (s) => {
        const cfg = soulData(s).cfg;
        cfg.concurrency = Math.round(clamp(values.concurrency, 1, 8, cfg.concurrency));
        cfg.timeoutMs = Math.round(clamp(values.timeoutSec, 5, 180, Math.round(cfg.timeoutMs / 1000))) * 1000;
        cfg.contextMessages = Math.round(clamp(values.contextMessages, 1, 20, cfg.contextMessages));
        cfg.maxChars = Math.round(clamp(values.maxChars, 80, 800, cfg.maxChars));
        cfg.injectDepth = Math.round(clamp(values.injectDepth, 0, 10, cfg.injectDepth));
        cfg.maxEntriesPerSection = Math.round(clamp(values.maxEntriesPerSection, 10, 60, cfg.maxEntriesPerSection));
      }, "保存灵魂链接参数");
      ui.notify("灵魂链接参数已保存。");
      return;
    }
    if (type === "soul-entry") {
      if (!ui.data) return;
      const name = text(values.name, 40);
      assert(name, "缺少角色名");
      await change(ui, (s) => {
        soulAddEntry(soulData(s), name, values.section, values.text, { source: "manual" });
      }, "灵魂链接 · 新增条目");
      ui.notify("已添加条目。");
      return;
    }
  }

