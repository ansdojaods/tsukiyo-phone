  // src/services/focus.js
  var shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  function clampCount(n, lo = 1, hi = 6, fallback = 3) {
    const v = Math.trunc(Number(n));
    return Math.min(hi, Math.max(lo, Number.isFinite(v) && v > 0 ? v : fallback));
  }
  function autoPeople(s, snap, pool, max = 3) {
    const corpus = (snap.history || []).slice(-4).map((m) => m.text).join("\n");
    const scored = pool.map((c) => {
      let score = 0;
      if (snap.present?.includes(c.name)) score += 4;
      if (c.name && corpus.includes(c.name)) score += 3;
      const given = c.name.length > 2 ? c.name.slice(-2) : "";
      if (given && corpus.includes(given)) score += 2;
      const t = s.threads.find((x) => x.kind === "direct" && x.members[0] === c.id);
      if (t?.messages.length) score += Math.min(2, Math.ceil(t.messages.length / 8));
      return { c, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, max).map((x) => x.c);
    return picked.length ? picked : shuffle(pool).slice(0, Math.min(2, pool.length));
  }
  function resolveFocus(s, snap, focus = {}, { pool = s.contacts, max = 6, autoMax = 3 } = {}) {
    const mode = focus.mode === "pick" || focus.mode === "random" ? focus.mode : "auto";
    assert(pool.length, "通讯录里还没有可用的角色");
    if (mode === "pick") {
      const picked = [...new Set(focus.members || [])].map((id2) => pool.find((c) => c.id === id2)).filter(Boolean).slice(0, max);
      assert(picked.length, "请至少勾选一位角色（或改用随机 / 按正文自动）");
      return { mode, people: picked };
    }
    if (mode === "random") return { mode, people: shuffle(pool).slice(0, clampCount(focus.count, 1, max)) };
    return { mode, people: autoPeople(s, snap, pool, autoMax) };
  }
  function focusPayload(s, snap, people) {
    return people.map((c) => {
      const t = s.threads.find((x) => x.kind === "direct" && x.members[0] === c.id);
      return {
        id: c.id,
        姓名: c.name,
        年龄: c.age,
        人设: text(c.bio, 320),
        当前事务: c.status,
        与玩家的近期交流: (t?.messages || []).slice(-6).map((m) => ({ 说话人: m.author === "user" ? "玩家" : c.name, 内容: text(m.text, 120) })),
        相关约定: s.agenda.filter((a) => (a.members || []).includes(c.id)).slice(-4).map((a) => text(a.title, 80)),
        已知记忆: s.memories.filter((m) => m.enabled !== false && (m.audience || []).includes(c.id)).slice(-4).map((m) => text(m.text, 120))
      };
    });
  }
  function authorContexts(s, snap, people) {
    return people.map((c) => {
      const ctx = actorContext(s, snap, c, { social: true });
      if (ctx.本人) {
        ctx.本人.人设 = text(ctx.本人.人设, 900);
        if (Array.isArray(ctx.本人.过往)) ctx.本人.过往 = ctx.本人.过往.slice(-2);
      }
      if (Array.isArray(ctx.当前可见正文)) ctx.当前可见正文 = ctx.当前可见正文.slice(-1);
      return { id: c.id, 姓名: c.name, ...ctx, 最近动态: s.feed.filter((p) => p.author === c.id).slice(-2).map((p) => text(p.text, 120)) };
    });
  }
  function namesToIds(names3, people, fallback = []) {
    const out = [];
    for (const n of Array.isArray(names3) ? names3 : []) {
      const k = nameKey(n);
      const c = k && people.find((p) => nameKey(p.name) === k || k.length >= 2 && nameKey(p.name).includes(k));
      if (c && !out.includes(c.id)) out.push(c.id);
    }
    return out.length ? out : fallback;
  }

