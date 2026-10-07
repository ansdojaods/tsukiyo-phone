  // src/services/soul.js — v2.8 内置灵魂链接（NPC 档案与发送前角色推演）
  // ===== 灵魂链接（内置）：NPC 档案系统 + 发送前角色推演 =====
  // 说明：按 SoulLink 的功能模型原生实现（角色档案五节 / AI 增量维护 / 精编 / 发送前推演 / 名单导入导出），
  // 数据与调用全部走小手机自己的存档、API 方案与世界书工坊，不依赖也不复制第三方扩展代码。
  var SOUL_SECTIONS = ["性格", "世界观", "家庭背景", "人际关系", "记忆"];
  var SOUL_KEYS = { roleplay: "tsukiyo-phone:soul-roleplay" };
  var SOUL_PROMPT_KEYS = ["analyze", "gate", "roleplay", "condense"];
  var SOUL_PROMPT_LABELS = { analyze: "档案更新", gate: "档案预筛", roleplay: "角色推演", condense: "档案精编" };
  var SOUL_DEFAULT_PROMPTS = {
    analyze: [
      "你是角色档案维护员。只依据给定材料（最近正文、当前档案、人物设定、世界书片段）更新档案，不臆造材料里没有的事实。",
      "规则：① 每条 80 字内，写可复用的事实（性格倾向、世界观认知、家世、人际关系、值得记住的经历）；② 与现有条目重复或只是换说法的不写；③ 只在材料里出现或明确相关时才写；④ 记忆条目写「发生了什么」，不写猜测与心理活动。",
      '只输出 JSON，形如 {"性格":["…"],"世界观":["…"],"家庭背景":["…"],"人际关系":["…"],"记忆":["…"]}。没有新增就省略该分节或给空数组。不要输出解释。'
    ].join("\n"),
    gate: [
      "你在做档案预筛：判断最近这几条消息里，哪些角色出现了新事实、关系变化或重要经历，值得更新档案。",
      "只从给定名单里选人；只是被提到名字、或没有新信息的不要选。最多选 6 人。",
      '只输出 JSON：{"characters":["角色名"]}。都不需要就输出 {"characters":[]}。'
    ].join("\n"),
    roleplay: [
      "你是角色内心中枢。为指定角色写一段第一人称内心独白，供正文生成参考。",
      "规则：① 只能使用该角色自己的档案与最近消息；② 写他现在在想什么、在意什么、打算怎么做，200—400 字；③ 不替玩家行动，不制造未发生的事实，不写成旁白或对白清单；④ 与档案一致，语气贴合角色性格。",
      '只输出 JSON：{"name":"角色名","text":"独白"}。'
    ].join("\n"),
    condense: [
      "你在做档案精编：把同一个分节里重复、啰嗦、互相矛盾的条目合并成简洁事实，保留最新与最具体的版本。",
      "规则：① 只删改重复与冗余，不新增材料里没有的事实；② 条数控制在原来的 60% 以内，每条 60 字内；③ 五个分节都要输出（哪怕为空数组）。",
      '只输出 JSON，形如 {"性格":["…"],"世界观":["…"],"家庭背景":["…"],"人际关系":["…"],"记忆":["…"]}。'
    ].join("\n")
  };
  function soulFresh() {
    return {
      enabled: false,
      roster: {},
      cfg: { concurrency: 3, timeoutMs: 45000, contextMessages: 4, maxChars: 400, injectDepth: 4, maxEntriesPerSection: 60 },
      auto: { enabled: false, analyze: true, roleplay: false, minIntervalMs: 120000, maxPerTurn: 2, gateMode: "local" },
      roleplay: { enabled: false, mode: "manual", contextMessages: 4, maxActors: 3, clearAfterGeneration: true },
      presets: { ...SOUL_DEFAULT_PROMPTS },
      last: { analyzedAt: 0, roleplayAt: 0, floor: -1, sig: "", actors: [] },
      history: [],
      log: [],
      stats: { runs: 0, analyzed: 0, entries: 0, roleplays: 0, lastError: "" }
    };
  }
  function soulData(s) {
    return s?.soul || soulFresh();
  }
  function soulNorm(v) {
    return String(v ?? "").replace(/[\s\u3000，。、；：！？…—·“”‘’"'()（）【】\[\]<>《》~～]+/g, "").toLowerCase();
  }
  function soulSection(name) {
    return SOUL_SECTIONS.includes(name) ? name : null;
  }
  function soulEntryCount(row) {
    return SOUL_SECTIONS.reduce((n, k) => n + (row?.sections?.[k]?.length || 0), 0);
  }
  function soulEnsure(v, name, { aliases = [], source = "manual" } = {}) {
    const key = text(name, 40);
    assert(key && !["__proto__", "prototype", "constructor"].includes(key), "角色名为空或为保留名称");
    if (!Object.prototype.hasOwnProperty.call(v.roster, key)) v.roster[key] = { name: key, aliases: [], sections: Object.fromEntries(SOUL_SECTIONS.map((k) => [k, []])), enabled: true, source, updatedAt: 0, floor: -1 };
    const row = v.roster[key];
    for (const a2 of aliases) if (a2 && !row.aliases.includes(text(a2, 40))) row.aliases.push(text(a2, 40));
    for (const k of SOUL_SECTIONS) if (!Array.isArray(row.sections[k])) row.sections[k] = [];
    return row;
  }
  function soulAddEntry(v, name, section, raw, { floor = -1, source = "manual", ts = Date.now() } = {}) {
    const key = soulSection(section);
    assert(key, "未知的档案分节");
    const row = soulEnsure(v, name), value = text(raw, 600);
    assert(value, "档案条目不能为空");
    const norm = soulNorm(value);
    if (row.sections[key].some((x) => soulNorm(x.text) === norm)) return { added: false, id: "", row };
    const entry = { id: id("soul"), text: value, floor: Number.isInteger(floor) ? floor : -1, source, ts };
    row.sections[key].push(entry);
    const max = v.cfg?.maxEntriesPerSection || 60;
    if (row.sections[key].length > max) row.sections[key] = row.sections[key].slice(-max);
    row.updatedAt = ts;
    row.source = row.source === "manual" && source !== "manual" ? source : row.source;
    return { added: true, id: entry.id, row };
  }
  function soulRemoveEntry(v, name, section, entryId) {
    const row = v.roster[text(name, 40)], key = soulSection(section);
    if (!row || !key) return 0;
    const before = row.sections[key].length;
    row.sections[key] = row.sections[key].filter((x) => x.id !== entryId);
    return before - row.sections[key].length;
  }
  function soulMerge(v, name, delta, { floor = -1, source = "ai" } = {}) {
    const stats = { added: 0, updated: 0, skipped: 0 };
    if (!isObject(delta)) return stats;
    for (const key of SOUL_SECTIONS) {
      const rows = Array.isArray(delta[key]) ? delta[key] : delta[key] === void 0 ? [] : [delta[key]];
      for (const item of rows) {
        const value = typeof item === "string" ? item : item?.text ?? item?.content ?? "";
        const value2 = text(value, 600);
        if (!value2) continue;
        const r = soulAddEntry(v, name, key, value2, { floor, source });
        if (r.added) stats.added++;
        else stats.skipped++;
      }
    }
    return stats;
  }
  function soulRender(v, name, { max = 2400 } = {}) {
    const row = v.roster[text(name, 40)];
    if (!row) return "";
    const parts = [];
    for (const key of SOUL_SECTIONS) {
      const rows = (row.sections[key] || []).map((x) => (x.floor >= 0 ? x.text + "（#" + (x.floor + 1) + "楼）" : x.text));
      if (rows.length) parts.push("【" + key + "】\n" + rows.map((t2) => "· " + t2).join("\n"));
    }
    return text(parts.join("\n\n"), max);
  }
  function soulJson(raw) {
    const s = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const a2 = s.indexOf("{"), b = s.lastIndexOf("}");
    assert(a2 >= 0 && b > a2, "模型没有返回可用的 JSON");
    const value = JSON.parse(s.slice(a2, b + 1));
    safeJson(value);
    return value;
  }
  function soulRosterExport(v, { chatKey = "", chatLabel = "" } = {}) {
    const roster = {};
    for (const row of Object.values(v.roster)) {
      const out = { 姓名: row.name };
      if (row.aliases?.length) out.别名 = [...row.aliases];
      for (const key of SOUL_SECTIONS) {
        out[key] = (row.sections[key] || []).map((x) => (x.floor >= 0 ? x.text + "（#" + (x.floor + 1) + "楼）" : x.text));
      }
      roster[row.name] = out;
    }
    return { app: "SoulLink", kind: "roster", version: "1.7.5", exportedAt: new Date().toISOString(), chatKey, chatLabel, count: Object.keys(roster).length, roster };
  }
  function soulRosterImport(v, raw) {
    assert(isObject(raw), "名单文件必须是 JSON 对象");
    const reserved = /^(app|kind|version|exportedAt|chatKey|chatLabel|count|roster|archives|characters|data)$/;
    const isChar = (value) => isObject(value) && (value.姓名 !== void 0 || value.name !== void 0 || value.别名 !== void 0 || SOUL_SECTIONS.some((k) => value[k] !== void 0));
    const walk = (obj, depth, out) => {
      for (const [name, value] of Object.entries(obj)) {
        if (!isObject(value) || reserved.test(name)) continue;
        if (isChar(value)) out.push([name, value]);
        else if (depth < 3) walk(value, depth + 1, out);
      }
      return out;
    };
    const stats = { characters: 0, entries: 0, skipped: 0 };
    for (const [name, value] of walk(isObject(raw.roster) ? raw.roster : isObject(raw.archives) ? raw.archives : isObject(raw.characters) ? raw.characters : isObject(raw.data) ? raw.data : raw, 0, [])) {
      const real = text(value.姓名 || value.name || name, 40);
      if (!real) continue;
      const before = soulEntryCount(soulEnsure(v, real, { source: "import" }));
      for (const key of SOUL_SECTIONS) {
        const rows = value[key];
        if (rows === void 0) continue;
        const list = Array.isArray(rows) ? rows : [rows];
        for (const item of list) {
          const line = typeof item === "string" ? item : item?.text ?? "";
          const m = String(line).match(/^(.*)（#(\d+)楼）$/);
          const body = m ? m[1] : String(line);
          const floor = m ? Number(m[2]) - 1 : -1;
          const e2 = text(body, 600);
          if (!e2) continue;
          const r = soulAddEntry(v, real, key, e2, { floor, source: "import" });
          if (r.added) stats.entries++;
          else stats.skipped++;
        }
      }
      const after = soulEntryCount(soulEnsure(v, real));
      if (after > before) stats.characters++;
    }
    return stats;
  }
  function soulValidate(v) {
    if (v === void 0) return;
    assert(isObject(v) && typeof v.enabled === "boolean", "灵魂链接配置错误");
    assert(isObject(v.roster) && Object.keys(v.roster).length <= 200, "灵魂链接角色过多（上限 200）");
    for (const [name, row] of Object.entries(v.roster)) {
      assert(!["__proto__", "constructor", "prototype"].includes(name) && isObject(row) && row.name === name && typeof row.name === "string" && row.name.length <= 40, "灵魂链接角色名错误");
      assert(Array.isArray(row.aliases) && row.aliases.length <= 12, "灵魂链接别名过多");
      for (const key of SOUL_SECTIONS) {
        const rows = row.sections?.[key];
        assert(Array.isArray(rows) && rows.length <= 60, "灵魂链接分节错误：" + name + " · " + key);
        for (const x of rows) assert(x && typeof x.text === "string" && x.text.length <= 600 && Number.isInteger(x.floor) && x.floor >= -1, "灵魂链接条目错误：" + name + " · " + key);
      }
    }
    const c = v.cfg || {};
    assert(Number.isInteger(c.concurrency) && c.concurrency >= 1 && c.concurrency <= 8, "灵魂链接并发数需为 1—8");
    assert(Number.isInteger(c.timeoutMs) && c.timeoutMs >= 5000 && c.timeoutMs <= 180000, "灵魂链接超时需为 5—180 秒");
    assert(Number.isInteger(c.contextMessages) && c.contextMessages >= 1 && c.contextMessages <= 20, "灵魂链接上下文条数需为 1—20");
    assert(isObject(v.presets), "灵魂链接预设错误");
    for (const key of SOUL_PROMPT_KEYS) if (v.presets[key] !== void 0) assert(typeof v.presets[key] === "string" && v.presets[key].length <= 8000, "灵魂链接预设文本过长：" + key);
    assert(Array.isArray(v.history) && v.history.length <= 20, "灵魂链接推演记录过多");
    assert(Array.isArray(v.log) && v.log.length <= 200, "灵魂链接日志过多");
  }
  async function soulPool(items, limit, worker) {
    const list = [...items], out = [];
    let cursor = 0;
    const size = Math.max(1, Math.min(limit || 1, list.length || 1));
    await Promise.all(Array.from({ length: size }, async () => {
      while (cursor < list.length) {
        const i = cursor++;
        try {
          out[i] = { ok: true, value: await worker(list[i], i) };
        } catch (e2) {
          out[i] = { ok: false, error: redactError(e2, []) };
        }
      }
    }));
    return out;
  }
  var SoulStudio = class {
    constructor(eng) {
      this.eng = eng;
      this.settings = eng.settings;
      this.events = new Emitter();
      this.timer = null;
      this.busy = false;
      this.running = false;
      this.phase = "idle";
      this.status = "";
      this.lastError = "";
      this.preparedSig = "";
      this.barrier = null;
    }
    data() {
      return this.eng.repo.data;
    }
    view() {
      return soulData(this.data());
    }
    cfg() {
      return { ...soulFresh().cfg, ...(this.view().cfg || {}) };
    }
    auto() {
      return { ...soulFresh().auto, ...(this.view().auto || {}) };
    }
    roles() {
      return { ...soulFresh().roleplay, ...(this.view().roleplay || {}) };
    }
    enabled() {
      return !!this.view().enabled && this.settings.isEnabled("soul");
    }
    prompt(key) {
      const v = this.view();
      return text(v.presets?.[key] || SOUL_DEFAULT_PROMPTS[key], 8000);
    }
    info() {
      const v = this.view(), rows = Object.values(v.roster);
      return {
        enabled: !!v.enabled, moduleOn: this.settings.isEnabled("soul"),
        characters: rows.length, entries: rows.reduce((n, r) => n + soulEntryCount(r), 0),
        roleplay: !!v.roleplay?.enabled, mode: v.roleplay?.mode || "manual",
        lastError: this.lastError || v.stats?.lastError || "",
        stats: { ...v.stats }, lastAt: v.last?.analyzedAt || 0, busy: this.busy
      };
    }
    supported() {
      return this.eng.bridge.mode === "demo" || !!this.eng.router;
    }
    start() {
      this.installBarrier();
      if (this.timer) return;
      this.timer = setInterval(() => this.tick().catch(() => {
      }), 60000);
    }
    stop() {
      clearInterval(this.timer);
      this.timer = null;
      this.removeBarrier();
      if (this.data()) this.clearRoleplay();
    }
    dispose() {
      this.stop();
      this.events.clear();
    }
    log(text2, kind = "info") {
      const ts = Date.now();
      this.events.emit({ type: "log", text: text2, kind, ts });
      const s = this.data();
      if (!s) return;
      try {
        s.soul.log = [...s.soul.log || [], { ts, kind, text: text(text2, 300) }].slice(-200);
      } catch {
      }
    }
    snapshotText(snap, data, names) {
      const n = this.cfg().contextMessages, rows = [];
      const history = (snap.history || []).slice(-Math.max(2, n));
      for (const m of history) rows.push((m.role === "user" ? "玩家" : snap.character?.name || "角色") + "：" + text(m.text, 800));
      for (const c of names || []) {
        const t = data.threads.find((x) => x.kind === "direct" && (x.title === c || x.members?.some((id2) => data.contacts.find((y) => y.id === id2)?.name === c)));
        if (!t) continue;
        for (const m of (t.messages || []).slice(-4)) rows.push("手机·" + t.title + "：" + text(m.text, 400));
      }
      return rows;
    }
    sigNow(snap = this.eng.repo.snapshot) {
      if (!snap) return "";
      const rows = (snap.history || []).slice(-6).map((m) => text(m.text, 200));
      return fingerprint([snap.owner, snap.floor, rows]);
    }
    candidates(snap, data, limit = 6) {
      const present = Array.isArray(snap.present) ? snap.present : [];
      const recent = (snap.history || []).slice(-6).map((m) => String(m.text || "")).join("\n");
      const names = Object.keys(soulData(data).roster);
      const hit = names.filter((n) => present.includes(n) || recent.includes(n));
      const others = names.filter((n) => !hit.includes(n));
      return [...hit, ...others].slice(0, Math.max(1, limit));
    }
    async ask(system, payload, { timeoutMs, origin } = {}) {
      const snap = origin || this.eng.repo.snapshot;
      reviewAssert(this.eng, snap);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort("timeout"), Math.max(5000, timeoutMs || this.cfg().timeoutMs));
      try {
        const raw = await this.eng.router.call("soul", { system, user: JSON.stringify(payload) }, { signal: ctrl.signal });
        reviewAssert(this.eng, snap);
        return raw;
      } finally {
        clearTimeout(timer);
      }
    }
    async mutate(fn, label, origin = null) {
      const snap = origin || this.eng.repo.snapshot;
      reviewAssert(this.eng, snap);
      return this.eng.repo.mutate(fn, { label, snapshot: snap });
    }
    /** 档案更新：单角色。includeBook 时额外读取该角色相关的世界书条目作为材料。 */
    async analyze(name, { signal: outer } = {}) {
      const s = this.data();
      assert(this.enabled(), "灵魂链接已关闭（或在模块开关里停用）");
      assert(soulData(s)?.roster?.[name], "角色不在灵魂链接名单里");
      const snap = this.eng.repo.snapshot;
      const rowSig = fingerprint(soulData(s).roster[name]);
      const before = soulEntryCount(soulData(s).roster[name]);
      const payload = {
        角色: name,
        别名: soulData(s).roster[name].aliases,
        当前档案: SOUL_SECTIONS.reduce((o, k) => ({ ...o, [k]: (soulData(s).roster[name].sections[k] || []).map((x) => x.text) }), {}),
        最近消息: this.snapshotText(snap, s, [name]),
        手机记录: (() => {
          const c = s.contacts.find((x) => x.name === name);
          return c ? { 设定: text(c.bio, 600), 补充: text(c.extraNotes, 300), 近况: text(c.status, 120) } : null;
        })(),
        世界书片段: await this.bookSnippets(name).catch(() => []),
        楼层: snap.floor
      };
      const raw = await this.ask(this.prompt("analyze"), payload, { origin: snap });
      const delta = soulJson(raw);
      let stats = { added: 0, skipped: 0 };
      await this.mutate((d) => {
        assert(soulData(d).roster[name] && fingerprint(soulData(d).roster[name]) === rowSig, "角色已删除或档案已修改，旧结果未写入");
        stats = soulMerge(soulData(d), name, delta, { floor: snap.floor, source: "ai" });
        const v = soulData(d);
        v.stats.analyzed++;
        v.stats.entries += stats.added;
        v.stats.runs++;
        v.last.analyzedAt = Date.now();
        v.last.floor = snap.floor;
        v.last.sig = fingerprint([name, snap.owner, snap.floor]);
        d.soul.log = [...v.log, { ts: Date.now(), kind: "info", text: name + "：档案 +" + stats.added + " 条" }].slice(-200);
      }, "灵魂链接 · 档案更新", snap);
      this.log(name + "：新增 " + stats.added + " 条" + (stats.skipped ? "，跳过重复 " + stats.skipped + " 条" : ""), "ok");
      this.eng.bookStudio?.notePhoneChange?.();
      return { name, added: stats.added, skipped: stats.skipped, before, after: before + stats.added };
    }
    async bookSnippets(name) {
      if (!this.eng.bridge.wbSupported?.()) return [];
      const bindings = await this.eng.bridge.wbBindings();
      const books = [bindings.primary, ...bindings.additional || [], bindings.chat].filter(Boolean);
      const out = [];
      for (const book of [...new Set(books)].slice(0, 6)) {
        const rows = await this.eng.bridge.wbRead(book).catch(() => []);
        for (const r of rows || []) {
          if (r.enabled === false) continue;
          const label = String(r.name || r.comment || "");
          const keys = r.strategy?.keys || r.keys || [];
          if (label.includes(name) || keys.some((k) => k === name)) out.push(text(r.content, 500));
          if (out.length >= 6) break;
        }
        if (out.length >= 6) break;
      }
      return out;
    }
    /** 档案预筛：本地优先（不耗调用），可选交给模型。 */
    async gate(snap, data, names) {
      const a = this.auto();
      const recent = (snap.history || []).slice(-(this.cfg().contextMessages + 2)).map((m) => text(m.text, 400));
      const local = names.filter((n) => recent.some((t2) => String(t2).includes(n)));
      const picked = local.length ? local : names.slice(0, 1);
      if (a.gateMode !== "ai" || picked.length <= 1) return picked.slice(0, Math.max(1, a.maxPerTurn));
      try {
        const raw = await this.ask(this.prompt("gate"), { 名单: names, 最近消息: recent });
        const value = soulJson(raw);
        const chosen = (Array.isArray(value.characters) ? value.characters : []).map((x) => text(x, 40)).filter((x) => names.includes(x));
        return (chosen.length ? chosen : picked).slice(0, Math.max(1, a.maxPerTurn));
      } catch {
        return picked.slice(0, Math.max(1, a.maxPerTurn));
      }
    }
    /** 档案更新：全部（并发 + 45 秒超时 + 每个角色各自独立调用）。 */
    async analyzeAll({ names = null, background = false } = {}) {
      const data = this.data(), snap = this.eng.repo.snapshot;
      const list = names?.length ? names.filter((n) => soulData(data).roster[n]) : await this.gate(snap, data, Object.keys(soulData(data).roster));
      assert(list.length, "没有需要更新的角色（名单为空，或预筛认为没有新信息）");
      if (this.busy) throw Error("灵魂链接已有任务在执行");
      this.busy = true;
      this.phase = "analyze";
      this.status = "正在更新 " + list.length + " 个角色的档案…";
      try {
        const results = await soulPool(list, this.cfg().concurrency, async (name) => this.analyze(name));
        const added = results.reduce((n, r) => n + (r.ok ? r.value.added : 0), 0);
        const failed = results.filter((r) => !r.ok);
        this.status = "完成：新增 " + added + " 条" + (failed.length ? "，失败 " + failed.length + " 个" : "");
        if (failed.length) this.lastError = String(failed[0].error).slice(0, 160);
        return { count: list.length, added, failed: failed.length, details: results.map((r) => r.ok ? r.value : { error: r.error }) };
      } finally {
        this.busy = false;
        this.phase = "idle";
        this.emit();
      }
    }
    /** 档案精编：合并重复与冗余。 */
    async condense(name) {
      assert(this.enabled(), "灵魂链接已关闭");
      const s = this.data(), row = soulData(s).roster[name];
      assert(row, "角色不在名单里");
      const origin = this.eng.repo.snapshot, rowSig = fingerprint(row);
      const before = soulEntryCount(row);
      const payload = { 角色: name, 档案: SOUL_SECTIONS.reduce((o, k) => ({ ...o, [k]: (row.sections[k] || []).map((x) => x.text) }), {}) };
      const raw = await this.ask(this.prompt("condense"), payload, { origin });
      const value = soulJson(raw);
      let after = 0;
      await this.mutate((d) => {
        const v = soulData(d), target = v.roster[name];
        assert(target && fingerprint(target) === rowSig, "角色已删除或档案已修改，旧精编结果未写入");
        for (const key of SOUL_SECTIONS) {
          const rows = Array.isArray(value[key]) ? value[key] : null;
          if (!rows) continue;
          const kept = (target.sections[key] || []).filter((x) => x.source === "manual");
          target.sections[key] = [...kept, ...rows.map((t2) => ({ id: id("soul"), text: text(t2, 600), floor: -1, source: "condense", ts: Date.now() })).filter((x) => x.text)];
        }
        target.updatedAt = Date.now();
        after = soulEntryCount(target);
        v.stats.runs++;
        v.stats.entries = Object.values(v.roster).reduce((n, r) => n + soulEntryCount(r), 0);
      }, "灵魂链接 · 档案精编", origin);
      this.log(name + "：精编 " + before + " → " + after + " 条", "ok");
      return { name, before, after };
    }
    /** 发送前角色推演：并发调用，产出第一人称独白并注入到指定深度。 */
    async roleplay({ names = null, snap = null, manual = true } = {}) {
      const s = this.data(), view = this.view();
      assert(s && this.enabled(), "灵魂链接已关闭");
      const cfg = this.cfg(), roles = this.roles();
      const target = snap || this.eng.repo.snapshot;
      const list = (names?.length ? names : this.candidates(target, s, roles.maxActors)).filter((n) => soulData(s).roster[n]).slice(0, Math.max(1, roles.maxActors));
      assert(list.length, "名单里还没有可推演的角色");
      const rosterSig = fingerprint(list.map(n => soulData(s).roster[n]));
      if (this.busy) throw Error("灵魂链接已有任务在执行（稍后再试）");
      this.busy = true;
      this.phase = "roleplay";
      this.status = "正在推演 " + list.join("、") + " …";
      this.emit();
      try {
        const ctx = this.snapshotText(target, s, list);
        const results = await soulPool(list, cfg.concurrency, async (name) => {
          const row = soulData(s).roster[name];
          const payload = {
            角色: name, 别名: row.aliases,
            档案: SOUL_SECTIONS.reduce((o, k) => ({ ...o, [k]: (row.sections[k] || []).map((x) => x.text).slice(-20) }), {}),
            最近消息: ctx, 字数上限: cfg.maxChars, 楼层: target.floor
          };
          const raw = await this.ask(this.prompt("roleplay"), payload, { origin: target });
          const value = soulJson(raw);
          return { name, text: text(value.text || value.独白 || "", Math.max(80, cfg.maxChars)) };
        });
        const actors = results.filter((r) => r.ok && r.value.text).map((r) => r.value);
        if (!actors.length) {
          const first = results.find((r) => !r.ok);
          throw Error(first ? "推演失败：" + first.error : "推演没有返回内容");
        }
        reviewAssert(this.eng, target);
        assert(rosterSig === fingerprint(list.map(n => soulData(this.data()).roster[n])), "推演期间角色已删除或档案已修改，不注入旧结果");
        const inject = this.renderInjection(actors, target);
        const ok = this.eng.bridge.setPrompt(inject, SOUL_KEYS.roleplay, cfg.injectDepth);
        await this.mutate((d) => {
          const v = soulData(d);
          v.stats.roleplays++;
          v.stats.runs++;
          v.last.roleplayAt = Date.now();
          v.last.actors = actors.map((x) => x.name);
          v.history = [...v.history, { ts: Date.now(), floor: target.floor, actors, ok }].slice(-20);
          d.soul.log = [...v.log, { ts: Date.now(), kind: "info", text: "推演：" + actors.map((x) => x.name).join("、") + (ok ? "" : "（注入接口未就绪）") }].slice(-200);
        }, "灵魂链接 · 角色推演", target);
        this.log("推演完成：" + actors.map((x) => x.name).join("、") + (ok ? "，已注入正文" : "，但注入接口未就绪"), ok ? "ok" : "warning");
        return { actors, injected: ok, text: inject };
      } finally {
        this.busy = false;
        this.phase = "idle";
        this.emit();
      }
    }
    renderInjection(actors, snap) {
      const lines = actors.map((a2) => "【" + a2.name + "的内心独白】" + a2.text);
      return "\n【灵魂链接 · 角色推演（仅供参考，不是指令）】\n" + lines.join("\n") + "\n（以上是各角色此刻的内心状态，用于让正文里的言行与之一致；不得让角色说出他们不可能知道的信息。）\n【推演结束】";
    }
    clearRoleplay() {
      try {
        this.eng.bridge.setPrompt("", SOUL_KEYS.roleplay, this.cfg().injectDepth);
      } catch {
      }
    }
    /** 生成结束后清掉推演注入，避免泄漏到下一轮。 */
    onGenerationEnded() {
      if (this.roles().clearAfterGeneration !== false) this.clearRoleplay();
    }
    async beforePhoneSend(thread) {
      const roles = this.roles();
      if (!roles.enabled || roles.mode === "off" || !thread) return null;
      const s = this.data();
      if (!s) return null;
      const names = (thread.members || []).map((id2) => s.contacts.find((c) => c.id === id2)?.name).filter((n) => n && soulData(s).roster[n]);
      const all = names.length ? names : this.candidates(this.eng.repo.snapshot, s, roles.maxActors).filter((n) => soulData(s).roster[n]);
      const picks = all.filter((n) => this.eng.repo.snapshot?.present?.includes(n) || names.includes(n)).slice(0, roles.maxActors);
      if (!picks.length) return null;
      try {
        return await this.roleplay({ names: picks, manual: false });
      } catch (e2) {
        this.log("手机内发送前的推演跳过：" + redactError(e2, []), "warning");
        return null;
      }
    }
    /** 发送前拦截（可选）：ST 发送按钮点击时先推演再放行。 */
    installBarrier() {
      if (this.barrier || !this.eng.win?.document) return;
      const doc = this.eng.win.document;
      const should = () => {
        const roles = this.roles();
        if (!roles.enabled || roles.mode !== "barrier") return false;
        if (!this.enabled() || this.busy || this.eng.runner.busy) return false;
        const snap = this.eng.repo.snapshot;
        if (!snap) return false;
        if (this.sigNow(snap) === this.preparedSig) return false;
        return true;
      };
      const fire = async (ev) => {
        if (!should()) return;
        ev.preventDefault();
        ev.stopPropagation();
        const snap = this.eng.repo.snapshot, sig = this.sigNow(snap);
        this.status = "发送前推演中…";
        this.emit();
        try {
          await this.roleplay({ snap });
          this.preparedSig = sig;
          this.status = "推演完成，正在发送";
        } catch (e2) {
          this.lastError = redactError(e2, []);
          this.status = "推演失败，本次直接发送";
          this.preparedSig = sig;
        }
        this.emit();
        this.eng.events?.emit?.({ type: "status" });
        const btn = doc.querySelector("#send_but");
        if (btn) this.eng.win.setTimeout(() => btn.click(), 30);
      };
      const onClick = (ev) => {
        if (ev.target?.closest?.("#send_but")) fire(ev);
      };
      const onKey = (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey && ev.target?.id === "send_textarea") fire(ev);
      };
      doc.addEventListener("click", onClick, true);
      doc.addEventListener("keydown", onKey, true);
      this.barrier = () => {
        doc.removeEventListener("click", onClick, true);
        doc.removeEventListener("keydown", onKey, true);
      };
    }
    removeBarrier() {
      if (this.barrier) this.barrier();
      this.barrier = null;
    }
    /** 后台自动维护：主线回复结束后按预筛增量更新档案。 */
    async tick() {
      if (!this.enabled() || this.busy || this.running) return;
      const s = this.data();
      if (!s || !s.settings.auto.enabled || !this.auto().enabled) return;
      if (this.eng.bridge.isBusy() || this.eng.bridge.isTyping()) return;
      const snap = this.eng.repo.snapshot;
      if (!snap) return;
      const sig = this.sigNow(snap);
      if (sig === this.view().last.sig) return;
      const a = this.auto();
      if (Date.now() - (this.view().last.analyzedAt || 0) < Math.max(30000, a.minIntervalMs)) return;
      this.running = true;
      try {
        await this.eng.gate.run(async (owns) => {
          if (!owns() || !this.eng.bridge.same(snap)) return;
          const limits = s.settings.auto;
          const usage = this.eng.gate.counts();
          if (usage.hour >= limits.maxHourly || usage.day >= limits.maxDaily) return;
          this.eng.gate.reserve("soul", snap.owner, limits);
          const names = await this.gate(snap, s, Object.keys(soulData(s).roster));
          if (names.length) await this.analyzeAll({ names });
        });
        await this.mutate((d) => {
          soulData(d).last.sig = sig;
        }, "灵魂链接 · 自动维护标记");
      } catch (e2) {
        this.lastError = redactError(e2, this.settings.secrets());
        this.log("自动维护跳过：" + this.lastError, "warning");
      } finally {
        this.running = false;
      }
    }
    emit() {
      this.events.emit({ type: "change" });
      this.eng.events?.emit?.({ type: "status" });
    }
    /** 手机事件（交流 / 约定 / 心迹 / 日记）→ 该角色「记忆」分节。 */
    /** 导出名单 JSON（「导出名单」按钮走这里；字段与旧版 SoulLink 名单一致，方便迁移） */
    exportRoster() {
      const snap = this.eng?.repo?.snapshot || {};
      let chatKey = "", chatLabel = "";
      try {
        const parts = JSON.parse(snap.owner || "[]");
        if (Array.isArray(parts)) {
          chatKey = String(parts[2] ?? "");
          chatLabel = String(parts[1] ?? "");
        }
      } catch {
        chatKey = "";
      }
      return soulRosterExport(this.view(), { chatKey, chatLabel });
    }
    pushPhoneLines(name, lines, { floor = -1 } = {}) {
      const s = this.data();
      if (!s) return 0;
      const v = soulData(s);
      if (!v.roster[name]) return 0;
      let added = 0;
      for (const line of lines) {
        const r = soulAddEntry(v, name, "记忆", line, { floor, source: "phone" });
        if (r.added) added++;
      }
      if (added) {
        v.stats.entries += added;
        v.log = [...v.log || [], { ts: Date.now(), kind: "info", text: name + "：手机记录 +" + added + " 条" }].slice(-200);
      }
      return added;
    }
  };

