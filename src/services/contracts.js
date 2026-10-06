  // src/services/contracts.js
  function repliesFrom(raw, thread, data) {
    const body = parseModelJson(raw, 16e3);
    assert(Array.isArray(body.replies) && body.replies.length <= 8, "回复需要 replies 数组，最多8条");
    if (thread.kind === "direct") assert(body.replies.length > 0, "对方没有返回可用回复，待发保留");
    return body.replies.map((r) => {
      assert(isObject(r), "回复格式错误");
      const author = r.contactId || r.author || (thread.kind === "direct" ? thread.members[0] : "");
      assert(thread.members.includes(author) && contactAvailable(data.contacts.find((c) => c.id === author)), "回复来自不在会话中的角色");
      const value = text(r.text, 1200);
      assert(value, "回复内容为空");
      return { author, text: value, kind: "text" };
    });
  }
  function incomingFrom(raw, contact) {
    const x = parseModelJson(raw, 12e3);
    assert(typeof x.send === "boolean", "主动来信必须明确 send");
    if (!x.send) return { send: false, reason: text(x.reason || "现在没有合适的话题", 180) };
    assert(!x.contactId || x.contactId === contact.id, "主动来信说话者错误");
    const texts = (Array.isArray(x.texts) ? x.texts : [x.text]).map((t) => text(t, 800)).filter(Boolean).slice(0, 5);
    assert(texts.length, "来信内容为空");
    return { send: true, contactId: contact.id, text: texts[0], texts, reason: text(x.reason, 180) };
  }
  function plansFrom(raw, data, baseDate = "") {
    const body = parseModelJson(raw, 5e4);
    assert(Array.isArray(body.directions) && body.directions.length >= 1 && body.directions.length <= 3, "规划需要1—3个完整方向");
    const eligible = new Set(data.contacts.filter(contactAvailable).map((c) => c.id));
    return body.directions.map((p) => {
      assert(text(p.title, 80) && text(p.summary, 500) && Array.isArray(p.members) && p.members.length <= 6, "方向缺少标题、摘要或参与者");
      assert(p.members.every((n) => eligible.has(n) || n === "user"), "规划使用了尚未建立联系的角色");
      assert(Array.isArray(p.beats) && p.beats.length >= 2 && p.beats.length <= 4, "每个方向需要2—4步");
      const members = [...new Set(p.members.filter((n) => n !== "user"))];
      return { id: id("plan"), title: text(p.title, 60), summary: text(p.summary, 360), tone: text(p.tone || "日常", 30), reason: text(p.reason || "基于当前场景", 250), members, baseDate, status: "candidate", createdAt: Date.now(), source: "model-proposal", beats: p.beats.map((b) => {
        assert(Number.isInteger(b.day) && b.day >= 0 && b.day <= 6, "规划只能在未来七日的相对范围0—6内");
        assert(text(b.title, 80) && text(b.scene, 350) && text(b.finish, 250), "步骤缺少场景或完成依据");
        assert(Array.isArray(b.choices) && b.choices.length >= 2 && b.choices.length <= 4, "每步需要2—4个可选意向");
        return { id: id("beat"), day: b.day, title: text(b.title, 60), scene: text(b.scene, 250), trigger: text(b.trigger || "先核对时间、地点和意愿", 200), choices: b.choices.map((x) => text(x, 100)), finish: text(b.finish, 220), done: false };
      }) };
    });
  }
  function postFrom(raw, contact) {
    const x = parseModelJson(raw, 12e3);
    assert(text(x.text, 1200), "动态没有正文");
    assert(!x.authorId || x.authorId === contact.id, "动态作者不匹配");
    return { id: id("post"), author: contact.id, text: text(x.text, 1e3), theme: ["rain", "coffee", "sky", "none"].includes(x.theme) ? x.theme : "none", mediaId: "", likes: [], comments: [], ts: Date.now(), story: "", source: "generated" };
  }
  function diaryFrom(raw) {
    const x = parseModelJson(raw, 18e3);
    assert(text(x.title, 80) && text(x.text, 6e3), "日记草稿缺少标题或正文");
    return { title: text(x.title, 80), text: text(x.text, 6e3) };
  }
  function memoryFrom(raw, thread, snapshot2) {
    const x = parseModelJson(raw, 26e3);
    assert(typeof x.summary === "string" && x.summary.length <= 1500 && Array.isArray(x.facts) && x.facts.length <= 8, "记忆结果需要summary与facts");
    const allowed = /* @__PURE__ */ new Set(["user", ...thread.members]);
    const facts = x.facts.map((f) => {
      assert(text(f.text, 500) && Array.isArray(f.sourceIds) && f.sourceIds.length > 0 && f.sourceIds.length <= 5, "记忆必须指向已有消息");
      const source = thread.messages.filter((m) => f.sourceIds.includes(m.id));
      assert(source.length === new Set(f.sourceIds).size, "记忆引用了其他会话或不存在的消息");
      assert(typeof f.quote === "string" && f.quote.trim().length >= 2 && source.some((m) => m.text.includes(f.quote.trim())), "记忆缺少可核对的消息原句");
      const readAll = source.every((m) => m.role === "user" || m.read);
      const audience = thread.members.concat(readAll ? ["user"] : []);
      return { id: id("memory"), threadId: thread.id, kind: f.kind === "promise" ? "promise" : "phone_fact", text: text(f.text, 500), audience, visibility: thread.kind === "group" ? "group" : "private", sources: source.map((m) => ({ messageId: m.id, quote: m.text.includes(f.quote) ? text(f.quote, 300) : "", type: "phone" })), resolved: false, ts: Date.now() };
    });
    let progress = null;
    if (x.progress?.done) {
      const q = x.progress;
      assert(Number.isInteger(q.floor) && typeof q.quote === "string" && q.quote.trim().length >= 4, "进展缺少楼层与原句");
      assert(snapshot2.history.some((m) => m.floor === q.floor && m.text.includes(q.quote.trim())), "进展依据不在实际正文中");
      progress = { done: true, floor: q.floor, quote: text(q.quote, 500), planId: text(q.planId, 120), beatId: text(q.beatId, 120) };
    }
    return { summary: text(x.summary, 1200), facts, progress };
  }
  function nameToId(s, name) {
    const n = text(name, 40);
    if (!n) return "";
    if (/^(我|玩家|user|\{\{user\}\})$/i.test(n)) return "user";
    return s.contacts.find((c) => c.id === n || c.name === n || c.name.includes(n) || n.includes(c.name))?.id || "";
  }
  function festivalsFrom(raw, s, base, end) {
    const body = parseModelJson(raw, 6e4);
    assert(Array.isArray(body.events) && body.events.length >= 1, "节日生成需要 events 数组");
    const last = end || addDays(base, 60);
    return body.events.slice(0, 30).map((x) => {
      assert(isObject(x) && text(x.title, 160), "节日缺少标题");
      let date = text(x.date, 10);
      try {
        isoDay(date);
      } catch {
        date = "";
      }
      if (date && (date < base || date > last)) date = "";
      return { title: text(x.title, 80), date, time: text(x.time, 20), kind: CAL_KINDS.includes(x.kind) ? x.kind : "游玩", place: text(x.place, 80), note: text(x.note, 200), members: (Array.isArray(x.members) ? x.members : []).map((n) => nameToId(s, n)).filter((n) => n && n !== "user") };
    }).filter((x) => x.date);
  }
  function diariesFrom(raw, allowed) {
    const body = parseModelJson(raw, 4e4);
    const rows = Array.isArray(body.entries) ? body.entries : body.title ? [body] : [];
    assert(rows.length, "日记生成需要 entries 数组");
    return rows.slice(0, 8).map((x) => {
      assert(isObject(x) && text(x.title, 80) && text(x.text, 6e3), "日记缺少标题或正文");
      const author = allowed.find((a) => a.name === text(x.author, 40) || a.id === text(x.author, 40)) || (allowed.length === 1 ? allowed[0] : allowed.find((a) => text(x.author, 40).includes(a.name)));
      assert(author, "日记作者不在所选角色中：" + text(x.author, 40));
      return { title: text(x.title, 80), text: text(x.text, 6e3), author: author.id, authorName: author.name, mood: text(x.mood, 20) };
    });
  }
  function listFrom(raw, key, max) {
    const body = parseModelJson(raw, 2e4);
    assert(Array.isArray(body[key]) && body[key].length, "生成结果需要 " + key + " 数组");
    return body[key].slice(0, max).filter(isObject);
  }
  function postsFrom(raw, authors) {
    const body = parseModelJson(raw, 3e4);
    assert(Array.isArray(body.posts) && body.posts.length, "动态结果需要 posts 数组");
    const seen = /* @__PURE__ */ new Set(), rows = [];
    for (const x of body.posts.slice(0, 8)) {
      if (!isObject(x)) continue;
      const key = text(x.authorId || x.author, 60);
      const c = authors.find((a) => a.id === key) || authors.find((a) => nameKey(a.name) === nameKey(key));
      const value = text(x.text, 1e3);
      if (!c || !value || seen.has(c.id)) continue;
      seen.add(c.id);
      rows.push({ id: id("post"), author: c.id, text: value, theme: ["rain", "coffee", "sky", "none"].includes(x.theme) ? x.theme : "none", mediaId: "", likes: [], comments: [], ts: Date.now(), story: "", source: "generated" });
    }
    assert(rows.length, "没有一条动态属于指定人物，原动态没有被改动");
    return rows;
  }
  function memoryBookFrom(raw, { corpus, contacts }) {
    const x = parseModelJson(raw, 4e4);
    assert(Array.isArray(x.facts), "记忆结果需要 facts 数组");
    const idOf = (n) => {
      const k = nameKey(n);
      if (!k) return "";
      if (k === nameKey("玩家") || k === "user") return "user";
      return contacts.find((c) => nameKey(c.name) === k)?.id || (k.length >= 2 ? contacts.find((c) => nameKey(c.name).includes(k))?.id : "") || "";
    };
    const facts = [];
    for (const f of x.facts.slice(0, 14)) {
      if (!isObject(f)) continue;
      const value = text(f.text, 600);
      if (value.length < 6 || !arcQuoteOk(text(f.quote, 300), corpus)) continue;
      const audience = [...new Set((Array.isArray(f.audience) ? f.audience : []).map(idOf).filter(Boolean))];
      facts.push({ title: text(f.title, 40), text: value, keys: cleanKeys(f.keys), kind: ["narrative_fact", "phone_fact", "promise"].includes(f.kind) ? f.kind : "narrative_fact", audience: audience.length ? audience : ["user"], quote: text(f.quote, 300) });
    }
    const summary = text(x.summary, 800);
    assert(facts.length || summary, "模型没有给出带原句依据的记忆；没有写入任何内容");
    return { summary, facts };
  }

