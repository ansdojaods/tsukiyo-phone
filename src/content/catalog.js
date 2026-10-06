  // src/content/catalog.js
  function seedFromHost(snapshot2) {
    const s = freshPhone();
    const stat = snapshot2.stat || {};
    if (stat.系统?.作品 === "臭小鬼") {
      const unlockAll = s.settings.unlockAll !== false;
      for (const [name, p] of Object.entries(kusogaki_default.people)) {
        const r = stat.关系?.[name] || {};
        addContact(s, { id: "kg-" + fingerprint(name), name, age: r.年龄 ?? p.age, bio: [kusogaki_default.calibration, kusogaki_personas_default[name], kusogaki_default.additions[name] || p.role].filter(Boolean).join("\n\n"), status: r.当前状态 || p.routine, recognized: unlockAll || r.相认 === true, reachable: unlockAll || r.可联系 === true, story: { recognized: r.相认 === true, reachable: r.可联系 === true }, source: "kusogaki", history: kusogaki_default.histories[name]?.entries || [], allowNarrative: false, color: kusogaki_default.heroes.indexOf(name) === 0 ? "sage" : kusogaki_default.heroes.indexOf(name) === 1 ? "amber" : "rose" });
      }
      s.canonicalSeeded = true;
      s.tasks = kusogaki_default.wishes.map((w) => {
        const record = w.kind === "wish" ? stat.日记?.已完成?.[w.key] : stat.课题?.已完成?.[w.category]?.[w.number];
        return { id: "wish-" + fingerprint(w.key), title: w.title, category: w.category, kind: w.kind, done: !!record, progress: record ? 1 : 0, target: 1, source: record ? "原卡完成记录副本" : "生活清单 · 尚未完成", originalRecord: record ? clone(record) : null };
      });
      const wishKeys = new Set(kusogaki_default.wishes.filter((w) => w.kind === "wish").map((w) => w.key));
      s.diary = Object.entries(stat.日记?.已完成 || {}).filter(([key]) => !wishKeys.has(key)).map(([key, r]) => ({ id: "original-diary-" + fingerprint(key), title: text(r.标题 || key, 80), text: text(r.内容 || "", 6e3), date: String(r.完成时间 || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || "", status: "confirmed", ts: Date.now(), source: "原卡日记副本（原件不变）", originalRecord: clone(r) }));
    } else if (PRESET) {
      for (const p of PRESET.contacts) {
        try {
          addContact(s, { id: p.id, name: p.name, age: p.age ?? null, bio: p.bio || "", status: p.status || "最近有自己的事在忙", recognized: true, reachable: true });
          const c = s.contacts[s.contacts.length - 1];
          c.source = "preset";
          if (p.tags) c.tags = p.tags;
        } catch {}
      }
    } else if (snapshot2.character?.name && !snapshot2.character.name.includes("臭小鬼")) {
      addContact(s, { id: "main-" + fingerprint(snapshot2.character.avatar || snapshot2.character.name), name: snapshot2.character.name, age: null, bio: text([snapshot2.character.description, snapshot2.character.personality, snapshot2.character.scenario].filter(Boolean).join("\n"), 12e3), source: "current-card", allowNarrative: true, status: "当前角色卡人物" });
    }
    return s;
  }
  function syncHostContacts(s, snapshot2) {
    if (PRESET && snapshot2.stat?.系统?.作品 !== "臭小鬼") {
      const removed = new Set((s.removedContacts || []).map((r) => r.id));
      const seeded = seedFromHost(snapshot2);
      for (const c of seeded.contacts) if (!removed.has(c.id) && s.contacts.length < 200 && !s.contacts.some((x) => x.id === c.id || nameKey(x.name) === nameKey(c.name))) s.contacts.push(c);
      return s;
    }
    if (snapshot2.stat?.系统?.作品 !== "臭小鬼") return s;
    const seeded = seedFromHost(snapshot2);
    if (!s.canonicalSeeded) {
      for (const t of seeded.tasks) if (!s.tasks.some((x) => x.id === t.id)) s.tasks.push(t);
      for (const d of seeded.diary) if (!s.diary.some((x) => x.id === d.id)) s.diary.push(d);
      s.canonicalSeeded = true;
    }
    const removed = new Set((s.removedContacts || []).map((r) => r.id));
    for (const c of seeded.contacts) if (!removed.has(c.id) && !s.contacts.some((x) => x.id === c.id || nameKey(x.name) === nameKey(c.name))) s.contacts.push(c);
    const unlockAll = s.settings?.unlockAll !== false;
    for (const c of s.contacts.filter((c2) => c2.source === "kusogaki")) {
      const r = snapshot2.stat.关系?.[c.name];
      if (r) {
        c.age = r.年龄 ?? c.age;
        c.status = text(r.当前状态 || c.status, 240);
      }
      c.story = { recognized: r?.相认 === true, reachable: r?.可联系 === true };
      c.recognized = unlockAll || c.story.recognized;
      c.reachable = (unlockAll || c.story.reachable) && (c.age === null || c.age >= 12);
    }
    return s;
  }
  function demoData() {
    const s = freshPhone();
    const names3 = ["春山未夜", "龙石真昼", "源道寺朝华"];
    for (const [i, name] of names3.entries()) addContact(s, { id: ["miya", "mahiru", "asaka"][i], name, age: 21, bio: kusogaki_default.additions[name], status: ["正在修改推理研的稿子", "训练结束后才有空", "寄宿学校 · 晚间可联系"][i], color: ["sage", "amber", "rose"][i], source: "demo", allowNarrative: i < 2, history: kusogaki_default.histories[name]?.entries || [] });
    const base = Date.now() - 18e5;
    for (const c of s.contacts) ensureThread(s, [c.id]);
    s.threads[0].messages = [{ id: "demo-m1", author: "user", role: "user", text: "你说的那篇稿子，我想再看一遍。", kind: "text", ts: base, story: "2019-05-12 16:10", read: true, source: "demo" }, { id: "demo-m2", author: "miya", role: "character", text: "我把最后一行圈出来了。\n不是谜底的问题，是他前面不该知道那件事。", kind: "text", ts: base + 6e4, story: "2019-05-12 16:10", read: true, source: "demo" }];
    s.threads[1].messages = [{ id: "demo-m3", author: "mahiru", role: "character", text: "伞收好了。先说好，我今天只能坐半小时哦。", kind: "text", ts: base + 18e4, story: "2019-05-12 16:10", read: false, source: "demo" }];
    s.threads[2].messages = [{ id: "demo-m4", author: "asaka", role: "character", text: "今天学校这边也下雨。你们在店里吗？", kind: "text", ts: base + 3e5, story: "2019-05-12 16:10", read: false, source: "demo" }];
    s.feed = [{ id: "demo-post", author: "miya", text: "把看似合理的地方再检查一遍。\n窗边的位置，今天刚好。", mediaId: "", theme: "rain", ts: base, story: "2019-05-12", likes: ["mahiru"], comments: [{ id: "demo-comment", author: "mahiru", text: "我只负责带点心，可以吗？", ts: base + 1e4 }], source: "demo" }];
    s.notes = [{ id: "demo-note", title: "今天的小事", text: "给窗边那株植物换一点水。\n不要把“下次再说”变成忘记。", ts: base }];
    s.tasks = [{ id: "task-coffee", title: "一起试一杯新的手冲", category: "日常", done: false, progress: 0, target: 1, source: "生活心愿" }, { id: "task-story", title: "把稿子里的线索重新排一遍", category: "合作", done: false, progress: 1, target: 3, source: "生活项目" }];
    s.agenda = [{ id: "demo-agenda", title: "和大家商量周末的安排", date: "2019-05-18", time: "14:00", status: "proposed", members: ["miya", "mahiru"], note: "只是待商量，尚未约定", source: "演示数据" }];
    s.places = kusogaki_default.places.slice(0, 6).map((p) => ({ id: p.id, title: p.name, note: p.teaser + " " + p.use }));
    s.items = [{ id: "demo-item", title: "折叠伞", quantity: 1, note: "从家里带来的，记得晾干。", source: "演示记录" }];
    return s;
  }
  function availableSeeds(snapshot2, s) {
    const stat = snapshot2.stat;
    return kusogaki_default.events.filter((e2) => {
      if (stat?.系统?.作品 !== "臭小鬼") return false;
      if (e2.known?.some((name) => !stat.关系?.[name]?.相认) || e2.flags?.some((flag) => !stat.标记?.[flag])) return false;
      if (stat.剧情?.待处理事件?.[e2.id]?.状态 === "已完成") return false;
      return true;
    }).slice(0, 12).map((e2) => ({ id: e2.id, title: e2.title, hook: e2.hook, place: e2.place, cast: e2.cast, choices: e2.choices, finish: e2.finish }));
  }
  function visibleHistory(contact, snapshot2) {
    return (contact.history || []).filter((row) => {
      const w = row.when || {}, s = snapshot2.stat || {};
      return !(w.year && (s.世界?.年份 || 0) < w.year || w.chapter && (s.剧情?.当前章节 || 0) < w.chapter || w.nodes?.some((k) => !s.剧情?.已完成节点?.[k]) || w.flags?.some((k) => !s.标记?.[k]) || w.openings && !w.openings.includes(s.开场经历?.起始开场));
    });
  }
  function restoreCardContacts(s, snapshot2, ids) {
    const want = new Set(ids);
    s.removedContacts = (s.removedContacts || []).filter((r) => !want.has(r.id));
    const seeded = seedFromHost(snapshot2);
    for (const c of seeded.contacts) if (want.has(c.id) && !s.contacts.some((x) => x.id === c.id)) s.contacts.push(c);
    return syncHostContacts(s, snapshot2);
  }

