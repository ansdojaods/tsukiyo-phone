/* 逻辑冒烟测试：在 Node 里加载 dist 里的 bundle，导出内部服务类，用桩环境跑世界书工坊、内置灵魂链接、记忆工作台（分层摘要 / 召回 / 收纳）、百宝月夜书公开 API 联动、导出/档案包与静态体检。
   用法：node tools/smoke_test.js [path/to/tsukiyo-phone.js]  （全绿即通过）*/
const fs = require("fs");
const path = require("path");
const FILE = process.argv[2] || path.join(__dirname, "..", "dist", "tsukiyo-phone-v2.9.2.js");
const src = fs.readFileSync(FILE, "utf8");
let code = src.replace(/TsukiyoPhoneBundle\.start\([^)]*\);?\s*$/, "");
// 测试用导出（不进入交付物）
code = code.replace("return __toCommonJS(index_exports);", "__export(index_exports, { BookStudio: () => BookStudio, freshPhone: () => freshPhone, planMemorySync: () => planMemorySync, normalizeEntry: () => normalizeEntry, phoneReadableDump: () => phoneReadableDump, contactPackFrom: () => contactPackFrom, applyContactPack: () => applyContactPack, proactiveCooldownNote: () => proactiveCooldownNote, SoulStudio: () => SoulStudio, soulFresh: () => soulFresh, soulData: () => soulData, soulEnsure: () => soulEnsure, soulAddEntry: () => soulAddEntry, soulMerge: () => soulMerge, soulRender: () => soulRender, soulRosterExport: () => soulRosterExport, soulRosterImport: () => soulRosterImport, soulValidate: () => soulValidate, soulView: () => soulView, soulCharView: () => soulCharView, SOUL_SECTIONS: () => SOUL_SECTIONS, SOUL_KEYS: () => SOUL_KEYS, MemoryStudio: () => MemoryStudio, msFresh: () => msFresh, msData: () => msData, msValidate: () => msValidate, msCoverage: () => msCoverage, msActive: () => msActive, msLedgerApply: () => msLedgerApply, msDraftPush: () => msDraftPush, msRecallBlock: () => msRecallBlock, msView: () => msView, msCard: () => msCard, msDelegateCard: () => msDelegateCard, MemoryApiLink: () => MemoryApiLink, memApiFresh: () => memApiFresh, memApiValidate: () => memApiValidate, memApiCard: () => memApiCard, memApiPreviewCard: () => memApiPreviewCard });\n  return __toCommonJS(index_exports);");
const mod = { exports: {} };
const bundle = new Function("module", "exports", code + "\n;return TsukiyoPhoneBundle;")(mod, mod.exports);
const { BookStudio, SoulStudio, soulFresh, soulData, soulEnsure, soulAddEntry, soulMerge, soulRender, soulRosterExport, soulRosterImport, soulValidate, soulView, soulCharView, SOUL_SECTIONS, SOUL_KEYS, freshPhone, planMemorySync, normalizeEntry, phoneReadableDump, contactPackFrom, applyContactPack, proactiveCooldownNote, MemoryStudio, msFresh, msData, msValidate, msCoverage, msActive, msLedgerApply, msDraftPush, msRecallBlock, msView, msCard, msDelegateCard, MemoryApiLink, memApiFresh, memApiValidate, memApiCard, memApiPreviewCard } = bundle;
console.log("exports:", Object.keys(bundle).join(","));

const soulEntryCountLite = (row) => ["性格", "世界观", "家庭背景", "人际关系", "记忆"].reduce((n, k) => n + (row?.sections?.[k]?.length || 0), 0);
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log("  ✗", msg); } else console.log("  ✓", msg); };

function makeWorld(entries = []) {
  return { names: ["测试书"], entries: { 测试书: entries.map((e, i) => ({ uid: "uid-" + i, ...e })) } };
}
function makeEngine(world) {
  const data = freshPhone();
  data.contacts = [{ id: "c1", name: "临安", aliases: ["二公主"], age: null, tags: ["皇室"], status: "可直接联系", bio: "二公主，娇蛮明亮。", extraNotes: "", references: [], recognized: true, reachable: true, proactive: true }];
  data.diary = [
    { id: "d1", kind: "diary", author: "c1", title: "宫里的一天", text: "今天她学做菜，没做成。", date: "1604-09-03", mood: "闷", ts: 1 },
    { id: "h1", kind: "heart", author: "c1", title: "心迹", text: "他今天没有回头。", floor: 4, ts: 2 }
  ];
  data.summaries = [{ id: "s1", threadId: "t1", text: "他们谈到了税银案。", ts: 3, coveredId: "m1" }];
  data.threads = [{ id: "t1", kind: "direct", title: "临安", members: ["c1"], messages: [{ id: "m1", author: "c1", role: "character", text: "你来啦。", ts: 4, read: true, story: "九月初三" }], pending: [] }];
  data.agenda = [{ id: "a1", title: "河灯埠看灯", date: "1604-09-05", status: "confirmed", members: ["c1"], detail: "约在傍晚", ts: 5 }];
  data.notes = [{ id: "n1", title: "买蜡烛", text: "记得买蜡烛", ts: 6 }];
  data.memories = [];
  data.bookSync = undefined;
  const bridge = {
    mode: "extension",
    wbSupported: () => true,
    wbWritable: () => true,
    wbNames: async () => world.names.slice(),
    wbRead: async (n) => JSON.parse(JSON.stringify(world.entries[n] || [])),
    wbCreate: async (n) => { world.names.push(n); world.entries[n] = []; return true; },
    wbUpdate: async (n, fn) => { world.entries[n] = fn(JSON.parse(JSON.stringify(world.entries[n] || [])).map((e, i) => ({ uid: "uid-new-" + i, ...e }))); return world.entries[n]; },
    wbBind: async () => true,
    wbUnbind: async () => true,
    isBusy: () => false,
    capture: () => ({ owner: JSON.stringify([null, "卡.png", "测试聊天"]), character: { name: "测试卡", avatar: "卡.png" }, history: [], present: [] }),
    same: () => true,
    context: () => ({ chat: [1, 2, 3], name: "测试聊天" })
  };
  const repo = { data, snapshot: { owner: bridge.capture().owner }, bridge, mutate: (fn) => { fn(data); return data; }, choose: () => data, clearView() {} };
  const engine = { bridge, repo, settings: { secrets: () => [], data: { ui: {} }, cloud: () => null, persist: (n) => { engine.settings.data = n; } }, emit: () => {}, win: {} };
  return { engine, data, world };
}

(async () => {
  console.log("\n[1] 世界书工坊：创建 / 写入 / 更新 / 取回 / 保险丝");
  const world = makeWorld();
  const { engine, data } = makeEngine(world);
  const studio = new BookStudio(engine);
  ok(studio.recordsFor(data, engine.bridge.capture()).length === 5, "默认来源收录 5 条（日记/心迹/摘要/人物/约定；备忘默认关）");
  const res = await studio.link({ name: "测试书", scope: "card" });
  ok(res?.stats?.created === 5, "首次同步写入 5 条：" + JSON.stringify(res?.stats));
  const book = world.entries["测试书"];
  ok(book.length === 5 && book.every((e) => e.extra.tsukiyo.source === "book-studio"), "条目都带 book-studio 标记");
  ok(book.some((e) => /日记/.test(e.name)) && book.some((e) => /心迹/.test(e.name)) && book.some((e) => /人物/.test(e.name)), "条目名称含类型前缀");

  data.diary[0].text = "今天她学做菜，做成了一道。";
  let r2 = await studio.sync({ reason: "manual", force: true });
  ok(r2.stats.updated === 1 && r2.stats.created === 0, "手机改动 → 只更新 1 条");

  const diaryEntry = world.entries["测试书"].find((e) => /日记/.test(e.name));
  diaryEntry.content = "【1604-09-03】宫里的一天\n世界书里改过的内容。\n（作者：临安 · 心情：闷）";
  let r3 = await studio.sync({ reason: "manual", force: true });
  ok(r3.stats.pulled === 1 && data.diary[0].text === "世界书里改过的内容。", "世界书改动 → 取回手机（正文已变）");
  let r4 = await studio.sync({ reason: "manual", force: true });
  ok(r4.stats.pulled === 0 && r4.stats.updated === 0 && r4.plan.pull === 0 && r4.plan.update === 0, "再次同步不再来回抖动（幂等）：" + JSON.stringify(r4.plan));

  // 保险丝：一次删掉大部分条目
  const keep = world.entries["测试书"].filter((e) => !/人物/.test(e.name)).slice(0, 1);
  world.entries["测试书"] = keep;
  data.diary = []; data.summaries = []; data.agenda = [];
  let r5 = await studio.sync({ reason: "manual", force: true });
  ok(r5.stats.created > 0 || studio.confirmNeeded, "手机数据被清空后触发重建/保险丝流程：" + JSON.stringify({ created: r5.stats.created, confirm: !!studio.confirmNeeded }));

  console.log("\n[3] 主动来信解除限制（静态检查）");
  const patched = src;
  ok(/proactiveUnlimited: true, proactiveIgnoreQuiet: true, proactiveUnreadCap: 3/.test(patched), "默认值已写入：不受上限、不受免打扰、未读上限 3");
  ok(/const exempt = !!limits\.proactiveUnlimited && next\.module === "proactive"/.test(patched), "调度器对主动来信免额");
  ok(/maxHourly: Infinity, maxDaily: Infinity/.test(patched), "额度检查对主动来信放行");
  ok(/a\.proactiveIgnoreQuiet !== false \|\| !quiet/.test(patched), "免打扰不再拦截主动来信");
  ok(!/if \(!quiet && a\.proactive && readyN\("proactive"/.test(patched), "旧的 quiet 拦截已移除");
  ok(/主动来信不受调用上限限制/.test(patched), "后台设置页出现新开关");

  console.log("\n[4] 与记忆模块的分工：世界书工坊条目不被记忆模块误导入");
  const bsEntry = { uid: "u1", name: "【小手机】[日记] 1604-09-03 宫里的一天", content: "内容", extra: { tsukiyo: { source: "book-studio", key: "diary:d1", hash: "h" } } };
  const memEntry = { uid: "u2", name: "记忆条目", content: "内容", extra: { tsukiyo: { id: "m1", kind: "manual", v: 1 } } };
  ok(normalizeEntry(bsEntry).foreign === true && normalizeEntry(memEntry).foreign === false, "标记识别正确");
  const plan = planMemorySync([], [bsEntry, memEntry], {});
  ok(plan.import.length === 1 && plan.import[0].uid === "u2", "记忆同步只吸收记忆条目，忽略工坊条目：" + JSON.stringify(plan.import.map((x) => x.uid)));

  console.log("\n[5] 删除保护（保险丝）");
  const w2 = makeWorld();
  const e3 = makeEngine(w2);
  const st2 = new BookStudio(e3.engine);
  await st2.link({ name: "测试书", scope: "card" });
  const before = w2.entries["测试书"].length;
  e3.data.diary = []; e3.data.summaries = []; e3.data.agenda = []; e3.data.contacts = [];
  const r6 = await st2.sync({ reason: "manual", force: true });
  ok(st2.confirmNeeded && st2.confirmNeeded.count >= 3 && r6.stats.deleted === 0, `一次性删除过多条目时先暂停：待删 ${before}，确认项 ${st2.confirmNeeded && st2.confirmNeeded.count}`);
  await st2.acceptMassDelete();
  ok((w2.entries["测试书"] || []).length === 0, "确认后按世界书状态清空工坊条目");

  console.log("\n[6] v2.7.0：可读导出 / 联系人档案包 / 话题冷却");
  const e6 = makeEngine(makeWorld());
  const data6 = e6.data;
  data6.memories = [{ id: "m9", kind: "manual", title: "临安 · 灯会", text: "她说过想去看河灯。", keys: ["临安"], audience: ["user"], visibility: "private", sources: [{ note: "手工记录" }], resolved: false, ts: 9 }];
  const dump = phoneReadableDump(data6);
  ok(/^# 月夜来信/m.test(dump.text) && dump.text.includes("## 一、联系人") && dump.text.includes("临安") && /## 四、日记与恋爱心迹/.test(dump.text), "可读导出包含联系人与日记章节：" + dump.filename);
  ok(!/api|key/i.test(dump.filename) && dump.text.includes("- 状态："), "导出正文含字段说明且文件名不含密钥提示");
  const pack = contactPackFrom(data6, "c1");
  ok(pack.kind === "contact-pack" && pack.contact.name === "临安" && pack.diary.length === 2 && pack.memories.length === 1 && pack.threads[0].messages.length === 1, "档案包导出：资料 + 日记 " + pack.diary.length + " 条 + 记忆 " + pack.memories.length + " 条 + 私聊 " + pack.threads[0].messages.length + " 条");
  const s2 = freshPhone();
  const st1 = applyContactPack(s2, pack);
  ok(st1.contact === true && st1.memories === 1 && st1.diary === 2 && st1.messages === 1, "档案包导入到空手机：" + JSON.stringify(st1));
  ok(s2.memories[0].keys.includes("临安") && s2.memories[0].wb === void 0, "导入的记忆不会带来源卡的世界书链接");
  const st2b = applyContactPack(s2, pack);
  ok(st2b.contact === false && st2b.memories === 0 && st2b.diary === 0 && st2b.messages === 0, "重复导入不会重复建人/重复记忆：" + JSON.stringify(st2b));
  const s3 = freshPhone();
  s3.settings.auto.proactiveCooldown = 6;
  s3.automation.proactiveLog = [{ name: "临安", text: "窗外的雨好像小了一点", reason: "本人小事", ts: Date.now() }];
  const note = proactiveCooldownNote(s3);
  ok(note.includes("最近几次主动来信") && note.includes("窗外的雨好像小了一点"), "冷却提示词带出最近的主动来信话题");
  s3.settings.auto.proactiveCooldown = 0;
  ok(proactiveCooldownNote(s3) === "", "冷却设为 0 时不再注入");
  s3.settings.auto.proactiveCooldown = 6;
  s3.automation.proactiveLog = [];

  console.log("\n[7] v2.7.0 静态检查");
  ok(/proactiveUnlimited: true, proactiveIgnoreQuiet: true/.test(patched), "v2.6 的解除限制开关仍在（版本号见 [9]）");
  ok(/enqueue\(task\) \{[\s\S]{0,200}this\.wbQueue/.test(patched), "酒馆桥新增世界书串行队列");
  ok(/wbUpdate\(name, updater\) \{\s*return this\.enqueue\(/.test(patched) && /wbCreate\(name, entries = \[\]\) \{\s*return this\.enqueue\(/.test(patched), "世界书创建/更新都走队列");
  ok(/s\.automation\.proactiveLog = \[\.\.\.s\.automation\.proactiveLog/.test(patched), "主动来信写入话题记录");
  ok(/调度账本/.test(patched) && /最近主动来信（/.test(patched), "后台页出现调度账本与来信记录");
  for (const a of ["export-readable", "contact-pack-export", "contact-pack-import", "proactive-log-clear"]) ok(new RegExp('case "' + a + '"').test(patched), "动作分支存在：" + a);
  ok(/proactiveCooldown: 6/.test(patched) && /\["proactiveCooldown", 0, 30\]/.test(patched), "冷却默认值与取值范围已写入");


  console.log("\n[8] 灵魂链接（内置 v2.8）：档案 / 去重 / 渲染 / 名单互导 / 推演注入");
  function makeSoulEngine() {
    const data = freshPhone();
    data.contacts = [{ id: "c1", name: "临安", aliases: ["二公主"], status: "可直接联系", bio: "二公主，娇蛮明亮。", extraNotes: "", recognized: true, reachable: true, proactive: true }];
    data.threads = [{ id: "t1", kind: "direct", title: "临安", members: ["c1"], messages: [{ id: "m1", role: "character", author: "c1", text: "你来啦。", ts: 4, read: true }], pending: [] }];
    data.soul.enabled = true;
    const injected = [];
    const bridge = { mode: "extension", wbSupported: () => false, isBusy: () => false, isTyping: () => false, same: () => true, setPrompt: (v, k, d) => { injected.push({ v, k, d }); return true; } };
    const engine = {
      bridge,
      repo: { data, snapshot: { owner: "o1", floor: 12, present: ["临安"], character: { name: "测试卡" }, history: [{ role: "user", text: "临安推门进来" }, { role: "assistant", text: "她笑了笑" }] }, mutate: (fn) => { fn(data); return data; }, choose: () => data },
      settings: { secrets: () => [], data: { ui: {} }, isEnabled: () => true, route: () => ({ id: "tavern" }), key: () => "" },
      gate: { counts: () => ({ hour: 0, day: 0 }), run: async (fn) => fn(() => true), reserve: () => true },
      runner: { busy: false },
      events: { emit: () => {} },
      win: {},
      bookStudio: { notePhoneChange: () => {} },
      router: { call: async (m, payload) => { engine.lastCall = { m, payload }; return JSON.stringify(engine.reply ?? {}); } }
    };
    return { engine, data, injected };
  }
  const e9 = makeSoulEngine();
  const soul9 = new SoulStudio(e9.engine);
  e9.engine.soul = soul9;
  ok(typeof soulData(e9.data) === "object" && SOUL_SECTIONS.length === 5 && SOUL_SECTIONS.join("/") === "性格/世界观/家庭背景/人际关系/记忆", "存档带 soul 切片，五节定义与 SoulLink 一致：" + SOUL_SECTIONS.join("/"));
  ok(soul9.info().characters === 0 && soul9.info().enabled === true && soul9.enabled() && soul9.supported(), "服务可启动：info() 统计与模块开关都为真");
  soulEnsure(soulData(e9.data), "临安", { aliases: ["二公主"] });
  const row9 = soulData(e9.data).roster["临安"];
  ok(!!row9 && row9.aliases[0] === "二公主" && SOUL_SECTIONS.every((k) => Array.isArray(row9.sections[k])), "soulEnsure 建人：五节都是数组、别名已写入");
  const a1 = soulAddEntry(soulData(e9.data), "临安", "性格", "娇蛮明亮，嘴硬心软");
  const a2 = soulAddEntry(soulData(e9.data), "临安", "性格", "娇蛮明亮、嘴硬心软！");
  ok(a1.added === true && a2.added === false && soulEntryCountLite(row9) === 1, "同一句话换个标点不会重复入档（去重生效）");
  const merged = soulMerge(soulData(e9.data), "临安", { 性格: ["喜欢下厨"], 记忆: [{ text: "她记得税银案", floor: 3 }, "娇蛮明亮，嘴硬心软"] }, { floor: 8 });
  ok(merged.added === 3 && merged.skipped === 0 && soulEntryCountLite(row9) === 4, "soulMerge 字符串/对象混排都吃：+" + merged.added + " 条");
  ok(row9.sections["记忆"][0].floor === 8 && row9.sections["记忆"][0].source === "ai" && row9.updatedAt > 0, "模型写入的条目带楼层与来源标记");
  const rendered = soulRender(soulData(e9.data), "临安");
  ok(/【性格】/.test(rendered) && /【记忆】/.test(rendered) && rendered.includes("她记得税银案") && rendered.includes("（#9楼）"), "渲染档案：分节标题 + 楼层后缀正确");
  let bad = 0;
  try { soulValidate(soulFresh()); } catch (e) { bad++; }
  const broken = soulFresh(); broken.cfg.concurrency = 99;
  let bad2 = 0;
  try { soulValidate(broken); } catch (e) { bad2++; }
  ok(bad === 0 && bad2 === 1, "校验器：新档通过、并发 99 被拦下");
  e9.engine.reply = { 性格: ["她今日格外安静"], 记忆: [{ text: "她说想去看河灯" }] };
  const an = await soul9.analyze("临安");
  ok(an.added === 2 && e9.engine.lastCall.m === "soul" && soulData(e9.data).stats.analyzed === 1 && soulData(e9.data).stats.runs === 1, "analyze 走 router.call('soul') 并落档：+" + an.added + " 条");
  const payloadKeys = Object.keys(JSON.parse(e9.engine.lastCall.payload.user));
  ok(payloadKeys.includes("当前档案") && payloadKeys.includes("手机记录") && payloadKeys.includes("最近消息"), "调用载荷含当前档案 / 手机记录 / 最近消息：" + payloadKeys.join("、"));
  e9.engine.reply = { text: "我不想让他走，但我也不会说。" };
  soulData(e9.data).roleplay.enabled = true;
  const rp = await soul9.roleplay({ names: ["临安"] });
  const inj = e9.injected[e9.injected.length - 1];
  ok(rp.actors.length === 1 && rp.injected === true && inj.k === SOUL_KEYS.roleplay && inj.v.includes("我不想让他走"), "推演注入到 soul-roleplay 键（深度 " + inj.d + "），不覆盖手机正文注入");
  ok(soulData(e9.data).history.length === 1 && soulData(e9.data).stats.roleplays === 1, "推演写入最近记录");
  soul9.onGenerationEnded();
  ok(e9.injected[e9.injected.length - 1].v === "" && e9.injected[e9.injected.length - 1].k === SOUL_KEYS.roleplay, "生成结束后自动清空推演注入（不泄漏到下一轮）");
  const pushed1 = soul9.pushPhoneLines("临安", ["【小手机·交流】我：你来啦。", "【小手机·约定】河灯埠看灯"], { floor: 12 });
  const pushed2 = soul9.pushPhoneLines("临安", ["【小手机·交流】我：你来啦。"], { floor: 12 });
  ok(pushed1 === 2 && pushed2 === 0 && row9.sections["记忆"].some((x) => x.source === "phone" && x.floor === 12), "手机事件合入「记忆」节，重复内容自动跳过");
  const exported = soulRosterExport(soulData(e9.data), { chatKey: "测试聊天", chatLabel: "测试聊天" });
  ok(exported.app === "SoulLink" && exported.kind === "roster" && exported.roster["临安"] && /（#\d+楼）/.test(exported.roster["临安"].记忆.find((x) => x.includes("她记得税银案")) || ""), "导出名单保留 SoulLink 格式与「（#n楼）」楼层后缀：" + exported.roster["临安"].记忆.slice(-1)[0]);
  const fresh9 = soulFresh(); fresh9.enabled = true;
  const st = soulRosterImport(fresh9, exported);
  const back = fresh9.roster["临安"].sections["记忆"].find((x) => x.text.includes("她记得税银案"));
  ok(st.characters === 1 && st.entries >= 4 && back && back.floor === 8, "名单回到空存档：人 " + st.characters + " / 条 " + st.entries + "，楼层还原为 " + (back && back.floor));
  const others = soulRosterImport(fresh9, { archives: { "别的聊天": { 怀庆: { 姓名: "怀庆", 性格: ["冷静要证据"], 记忆: ["一条从未发出的消息"] } } } });
  ok(others.characters === 1 && fresh9.roster["怀庆"].sections["记忆"][0].text === "一条从未发出的消息", "兼容 archives / characters 包裹结构的名单");
  const html = soulView({ data: e9.data, engine: e9.engine, route: { name: "soul", id: "" }, snapshot: { floor: 12 } });
  const html2 = soulCharView({ data: e9.data, engine: e9.engine, route: { name: "soulChar", id: "临安" }, snapshot: { floor: 12 } });
  ok(typeof html === "string" && html.includes("灵魂链接") && html.includes("临安") && html.includes("data-form=\"soul\""), "名单页可渲染（含参数表单）");
  ok(typeof html2 === "string" && html2.includes("世界观") && html2.includes("data-form=\"soul-entry\"") && html2.includes("娇蛮明亮"), "角色档案页可渲染（五节 + 新增条目表单）");

  ok(typeof soul9.exportRoster === "function" && soul9.exportRoster().kind === "roster" && soul9.exportRoster().roster["临安"], "「导出名单」按钮背后的 SoulStudio.exportRoster() 存在（v2.9.2 修掉了原先调用不存在方法的报错）");
  ok(!/SoulLinkBridge/.test(patched) && !/soullink-toggle/.test(patched) && !/this\.soullink/.test(patched) && /var PhoneEngine = class/.test(patched), "外部 SoulLink 扩展桥已移除（无 SoulLinkBridge / 无 soullink-* 动作），PhoneEngine 落在 core/engine.js 切片");

  console.log("\n[9] v2.8.0 静态检查");
  ok(/version: "2.9.2"/.test(patched), "版本号（v2.8 的检查已随版本号移交 [12]）");
  ok(/soul: "灵魂链接（NPC 档案与推演）"/.test(patched) && /routes: Object\.fromEntries\(Object\.keys\(MODULES\)/.test(patched), "MODULES 注册 soul，路由与开关自动派生（API 方案页可单独配 soul 方案）");
  ok(/soul: soulFresh\(\)/.test(patched) && /soulValidate\(data\.soul\)/.test(patched), "存档默认值与校验已接入");
  ok(/var SoulStudio = class/.test(patched) && /this\.soul = new SoulStudio\(this\)/.test(patched) && /this\.soul\.start\(\)/.test(patched) && /this\.soul\.dispose\(\)/.test(patched), "SoulStudio 已接入引擎生命周期");
  ok(/this\.soul\.onGenerationEnded\(\)/.test(patched) && /this\.soul\.clearRoleplay\(\)/.test(patched), "生成结束 / 换聊天时清理推演注入");
  ok(/soul: soulView, soulChar: soulCharView/.test(patched) && /\["soul", "灵魂链接", "heart", "rose"\]/.test(patched) && /soulChar: "灵魂链接 · 角色档案"/.test(patched), "页面路由 / 首页磁贴 / 标题已注册");
  ok(/data-form="soul-entry"/.test(patched) && /if \(type === "soul"\)/.test(patched) && /if \(type === "soul-entry"\)/.test(patched), "参数表单与条目表单已进 handleForm");
  ok(/await ui\.engine\.soul\.beforePhoneSend\(t\)/.test(patched), "手机内发消息前会先推演");
  ok(/soul: "灵魂链接档案（性格 \/ 世界观 \/ 家世 \/ 人际 \/ 记忆）"/.test(patched) && /if \(p\.src === "soul"\)/.test(patched), "世界书工坊新增「灵魂链接档案」来源，且档案条目只写不取（避免覆盖）");
  ok(/Object\.keys\(soulData\(s\)\.roster\)\.length \+ " 人"/.test(patched) && /## 七、灵魂链接档案/.test(patched), "可读导出带灵魂链接档案章节");
  ok(/拦截发送按钮/.test(patched) && /#send_but/.test(patched) && /#send_textarea/.test(patched), "推演可选拦截酒馆发送按钮（点击 / 回车两条路径）");
  const soulActions = ["soul-toggle", "soul-auto-toggle", "soul-roleplay-toggle", "soul-mode", "soul-gate-mode", "soul-analyze", "soul-analyze-all", "soul-condense", "soul-roleplay", "soul-roleplay-clear", "soul-add-char", "soul-import-contacts", "soul-char-del", "soul-entry-del", "soul-pull-phone", "soul-export", "soul-import", "soul-preset", "soul-preset-reset", "soul-presets-export", "soul-presets-import", "soul-log-clear"];
  const missed = soulActions.filter((a) => !new RegExp('case "' + a + '"').test(patched));
  ok(missed.length === 0, "灵魂链接动作分支齐全（" + soulActions.length + " 个）" + (missed.length ? "，缺：" + missed.join(",") : ""));
  ok(/soulData\(s\)\.roster\[row\.name\] \|\| \{\}/.test(patched) === false, "占位检查（不应命中的写法）");

  console.log("\n[10] 记忆工作台（v2.9）：缺口 / 摘要树 / 状态账本 / 本地召回 / 草稿确认与撤回 / 收纳 / 档案");
  function makeMsEngine({ hide = true } = {}) {
    const data = freshPhone();
    data.contacts = [{ id: "c1", name: "临安", aliases: [], status: "可直接联系", bio: "二公主", extraNotes: "", recognized: true, reachable: true, proactive: true }];
    data.memories = [{ id: "m1", kind: "narrative_fact", title: "税银案", text: "他们在河灯埠谈过税银案，临安答应保密。", keys: [], enabled: true, audience: ["user"], visibility: "private", sources: [{ note: "正文" }] }];
    data.agenda = [{ id: "a1", title: "河灯埠看灯", date: "1604-09-05", status: "confirmed", members: ["c1"], detail: "", ts: 5 }];
    data.ms.enabled = true;
    const history = [];
    for (let i = 0; i < 12; i++) history.push({ role: i % 2 ? "assistant" : "user", text: "第" + (i + 1) + "楼：他们在河灯埠说税银案与河灯。", floor: i });
    const hiddenFloors = [];
    const bridge = {
      mode: "extension", wbSupported: () => false, isBusy: () => false, isTyping: () => false, same: () => true, setPrompt: () => true,
      context: () => (hide ? { hideMessage: (f, h) => hiddenFloors.push([f, h]) } : null),
      capture: () => ({ owner: "o1", floor: 11, present: ["临安"], character: { name: "测试卡" }, history, story: { date: "1604-09-05", time: "傍晚", place: "河灯埠" } })
    };
    const engine = {
      bridge,
      repo: { data, snapshot: bridge.capture(), mutate: (fn) => { fn(data); return data; }, choose: () => data },
      settings: { secrets: () => [], data: { ui: {} }, isEnabled: () => true, route: () => ({ id: "tavern" }), key: () => "" },
      gate: { counts: () => ({ hour: 0, day: 0 }), run: async (fn) => fn(() => true), reserve: () => true },
      runner: { busy: false },
      events: { emit: () => {} },
      win: {},
      bookStudio: { notePhoneChange: () => {} },
      actions: { perform: async () => { throw Error("冒烟测试不真的调用模型"); } },
      router: { call: async () => "{}" }
    };
    return { engine, data, hiddenFloors, bridge };
  }
  const msV = msFresh();
  let msBad = 0, msBad2 = 0;
  try { msValidate(msV); } catch (e) { msBad++; }
  const brokenMs = msFresh(); brokenMs.cfg.recallTop = 99;
  try { msValidate(brokenMs); } catch (e) { msBad2++; }
  ok(msBad === 0 && msBad2 === 1, "校验器：新档通过、召回条数 99 被拦下");
  const e10 = makeMsEngine();
  const ms10 = new MemoryStudio(e10.engine);
  e10.engine.ms = ms10;
  const cov1 = msCoverage(e10.data.ms.tree, 0, 11, 6);
  ok(cov1.total === 2 && cov1.missing.length === 2 && cov1.ratio === 0, "缺口检查：12 楼按 6 楼一块切出 2 段全缺");
  e10.data.ms.tree.push({ id: "n1", level: 0, from: 0, to: 5, text: "第一块摘要：河灯埠的税银案谈开了。", covers: [], kept: true, ts: 1 });
  const cov2 = msCoverage(e10.data.ms.tree, 0, 11, 6);
  ok(cov2.covered === 1 && cov2.missing.length === 1 && cov2.ratio === 0.5, "覆盖 0—5 楼后缺口减半");
  const pend = ms10.pendingBlocks();
  ok(pend && pend[0] === 6 && pend[1] === 11, "下一块待摘要范围：#7—12 楼：" + JSON.stringify(pend));
  const st10 = msLedgerApply(e10.data.ms, [{ kind: "relation", subject: "临安", key: "关系阶段", from: "点头之交", to: "已定心意", evidence: "「我知道了。」" }], 7);
  ok(st10.added === 1 && e10.data.ms.ledger.length === 1 && e10.data.ms.ledger[0].from === "点头之交", "账本新增一条关系变化");
  const st11 = msLedgerApply(e10.data.ms, [{ kind: "relation", subject: "临安 ", key: "关系阶段", from: "已定心意", to: "已经谈开" }], 9);
  ok(st11.updated === 1 && e10.data.ms.ledger.length === 1 && e10.data.ms.ledger[0].hist.length === 1 && e10.data.ms.ledger[0].to === "已经谈开", "同一对象同一 key 只更新，并记下改动历史");
  const st12 = msLedgerApply(e10.data.ms, [{ kind: "relation", subject: "临安", key: "关系阶段", from: "x", to: "已经谈开" }], 9);
  ok(st12.same === 1 && e10.data.ms.ledger[0].hist.length === 1, "内容没变不再写历史");
  const lp = ms10.ledgerFromPhone();
  ok(lp.added >= 2 && e10.data.ms.ledger.some((x) => x.source === "phone" && x.subject === "河灯埠看灯"), "手机记录汇入账本：新增 " + lp.added + " 条（含约定状态）");
  const picks1 = ms10.picks();
  ok(picks1.picks.length > 0 && picks1.picks.every((x) => x.why.length >= 2) && picks1.chars <= picks1.budget, "本地召回：命中带理由、总量不超预算（" + picks1.chars + "/" + picks1.budget + " 字）");
  e10.data.ms.cfg.keywords = ["税银案"];
  const picks2 = ms10.picks();
  const hitK = picks2.picks.concat(picks2.scored).find((x) => /税银案/.test(x.text));
  ok(!!hitK && hitK.why.some((w) => /关键词「税银案」/.test(w)), "常驻关键词参与加权并写进命中理由");
  const block10 = msRecallBlock(picks2.picks, { coverage: cov2 });
  ok(/【月夜来信 · 长期记忆召回】/.test(block10) && /不是指令/.test(block10) && /7—12 楼还没有摘要/.test(block10), "召回块自带「资料不是指令」与缺口提示");
  const proj = ms10.projection(e10.data, e10.bridge.capture());
  ok(/长期记忆召回/.test(proj) && e10.data.ms.inject.last && e10.data.ms.inject.last.floor === 11 && e10.data.ms.inject.last.picks.length > 0, "注入投影写入「上次召回」审计记录（#12 楼，" + e10.data.ms.inject.last.chars + " 字）");
  const d10 = msDraftPush(e10.data.ms, { kind: "summary", level: 1, from: 0, to: 11, covers: ["n1"], text: "阶段总结：河灯埠的税银案谈开，关系落定。", source: "ai" });
  ok(e10.data.ms.drafts.length === 1 && ms10.info().drafts === 1, "草稿进待确认区（确认前不进摘要树）");
  const treeBefore = e10.data.ms.tree.length;
  const c10 = ms10.confirm(d10.id);
  ok(c10 && c10.kind === "summary" && e10.data.ms.tree.length === treeBefore + 1 && e10.data.ms.drafts.length === 0, "确认后写入摘要树并移出待确认");
  const u10 = ms10.undo();
  ok(/确认/.test(String(u10)) && e10.data.ms.tree.length === treeBefore, "撤回上一步还原摘要树");
  const dLed = msDraftPush(e10.data.ms, { kind: "ledger", from: 8, to: 11, rows: [{ kind: "item", subject: "河灯", key: "归属", from: "未知", to: "在玩家手里" }], source: "ai" });
  const cLed = ms10.confirm(dLed.id);
  ok(cLed && cLed.kind === "ledger" && cLed.added === 1 && e10.data.ms.ledger.some((x) => x.subject === "河灯"), "状态草稿确认后写进账本");
  const diag10 = ms10.diag();
  const diagText = JSON.stringify(diag10);
  ok(diag10.kind === "memory-diagnostics" && !/临安/.test(diagText) && !/税银案/.test(diagText) && diag10.counts.tree >= 1, "脱敏诊断只有数量与开关，没有正文与姓名");
  const cfg10 = ms10.configExport();
  const sp10 = ms10.configImport({ ...cfg10, mode: "manual", cfg: { ...cfg10.cfg, recallTop: 9, maxChars: 1 } });
  ok(sp10.fields > 0 && e10.data.ms.cfg.recallTop === 9 && e10.data.ms.cfg.maxChars === 600 && e10.data.ms.mode === "manual", "配置导出 / 导入可往返（越界值被夹回区间）");
  const arch = ms10.archiveExport();
  const e10c = makeMsEngine();
  const msc = new MemoryStudio(e10c.engine);
  e10c.engine.ms = msc;
  const imp1 = msc.archiveImport(arch);
  const imp2 = msc.archiveImport(arch);
  ok(imp1.nodes >= 1 && imp1.ledger >= 1 && imp2.nodes === 0 && imp2.skipped >= 1, "记忆档案导入：+" + imp1.nodes + " 摘要 / +" + imp1.ledger + " 状态，重复导入被跳过 " + imp2.skipped + " 条");
  e10.data.ms.tree.push({ id: "n2", level: 1, from: 0, to: 11, text: "阶段总结：河灯埠一夜谈开。", covers: ["n1"], kept: true, ts: 2 });
  e10.data.ms.shelve.keepRecent = 10;
  const sh10 = ms10.shelve({});
  ok(sh10.hidden > 0 && e10.data.ms.hidden.length === sh10.hidden && e10.hiddenFloors.every(([, h2]) => h2 === true) && e10.hiddenFloors.every(([f]) => f >= 0 && f <= 1), "楼层收纳：只隐藏不删除（隐藏 " + sh10.hidden + " 楼，限 #1—2）");
  const un10 = ms10.unshelve();
  ok(un10 === sh10.hidden && e10.data.ms.hidden.length === 0, "恢复全部隐藏");
  const e10b = makeMsEngine({ hide: false });
  const msb = new MemoryStudio(e10b.engine);
  e10b.engine.ms = msb;
  e10b.data.ms.tree.push({ id: "nx", level: 1, from: 0, to: 5, text: "x", covers: [], kept: true, ts: 3 });
  let shThrew = 0;
  try { msb.shelve({}); } catch (e) { shThrew++; }
  ok(shThrew === 1 && e10b.data.ms.hidden.length === 0, "宿主没有隐藏楼层接口时不假装成功（明确报错）");
  const htmlMs = msView({ data: e10.data, engine: e10.engine, route: { tab: "overview" }, snapshot: e10.bridge.capture() });
  const htmlMsTree = msView({ data: e10.data, engine: e10.engine, route: { tab: "tree" }, snapshot: e10.bridge.capture() });
  const htmlMsRecall = msView({ data: e10.data, engine: e10.engine, route: { tab: "recall" }, snapshot: e10.bridge.capture() });
  const htmlMsCard = msCard({ data: e10.data, engine: e10.engine, snapshot: e10.bridge.capture() });
  ok(typeof htmlMs === "string" && /记忆工作台/.test(htmlMs) && /记忆缺口/.test(htmlMs) && /data-action="ms-backfill"/.test(htmlMs), "概览页可渲染（缺口 + 补课入口）");
  ok(typeof htmlMsTree === "string" && /摘要树/.test(htmlMsTree) && /data-action="ms-node-toggle"/.test(htmlMsTree), "摘要树页可渲染（含停用/编辑/删除）");
  ok(typeof htmlMsRecall === "string" && /上次召回/.test(htmlMsRecall) && /命中理由|理由/.test(htmlMsRecall), "召回审计页可渲染（含理由）");
  ok(typeof htmlMsCard === "string" && /记忆工作台/.test(htmlMsCard) && /ms-toggle/.test(htmlMsCard), "记忆页卡片可渲染（含总开关）");

  console.log("\n[11] 百宝月夜书公开 API v1 联动（v2.9）：拉取 / 缺口 / 只读镜像 / 召回候选");
  const e11 = makeMsEngine();
  e11.data.memApi.enabled = true;
  e11.data.memApi.transport = "http";
  e11.data.ms.enabled = true;
  const seen11 = [];
  e11.engine.win = {
    fetch: async (url) => {
      seen11.push(url);
      const body = url.includes("resource=history")
        ? { data: { text: "之前他们在河灯埠谈过税银案。", relativeText: "昨天：他们在河灯埠谈过税银案。", floor: 9, complete: false, missingAiFloors: [4, 5] } }
        : { data: { apiVersion: "1", pluginVersion: "1.6.3", protagonist: { name: "我" }, npcs: [{ name: "临安", relation: "表白过", affinityText: "好感 1", affinityNote: "嘴硬" }], items: [{ name: "河灯", qty: 2, location: "袖中" }], lifeDetails: [{ subject: "user", text: "买过河灯", topics: ["河灯"] }], coverage: { complete: false, missingAiFloors: [4, 5] } } };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) };
    }
  };
  const api11 = new MemoryApiLink(e11.engine);
  e11.engine.memApi = api11;
  const ms11 = new MemoryStudio(e11.engine);
  e11.engine.ms = ms11;
  let mvBad = 0;
  try { memApiValidate(memApiFresh()); } catch (e) { mvBad++; }
  const pull11 = await api11.pull();
  ok(mvBad === 0 && pull11.ok && /税银案/.test(pull11.history) && pull11.npcs.length === 1 && pull11.items.length === 1 && pull11.life.length === 1, "公开 API 拉取：历史 " + pull11.history.length + " 字 / 人物 " + pull11.npcs.length + " / 物品 " + pull11.items.length + " / 生活细节 " + pull11.life.length);
  const st11b = api11.status();
  ok(api11.missingFloors().join(",") === "4,5" && st11b.apiVersion === "1" && st11b.pluginVersion === "1.6.3" && st11b.historyFloor === 9, "版本 / 历史覆盖楼层 / 缺口楼层都被记录");
  ok(seen11.length === 2 && seen11.every((u) => /resource=/.test(u) && /format=json/.test(u)), "HTTP 方式请求都带 resource 与 format=json：" + seen11[0]);
  e11.data.ms.tree.push({ id: "nz", level: 0, from: 0, to: 5, text: "第一块", covers: [], kept: true, ts: 1 });
  const g11 = ms11.gaps([0, 11]);
  ok(g11.missing.some(([a2, b]) => a2 === 4 && b === 4) && g11.baibaiMissing === 2, "它报告的缺失 AI 楼层并入记忆工作台的缺口检查");
  const cand11 = ms11.candidates(e11.bridge.capture(), e11.data.ms);
  ok(cand11.some((x) => /百宝月夜书/.test(x.label)) && cand11.some((x) => /河灯/.test(x.label)), "公开 API 的历史与物品进入召回候选池");
  const card11 = memApiCard({ data: e11.data, engine: e11.engine, snapshot: e11.bridge.capture() });
  const prev11 = memApiPreviewCard({ data: e11.data, engine: e11.engine, snapshot: e11.bridge.capture() });
  ok(typeof card11 === "string" && /公开 API 联动/.test(card11) && /data-action="memapi-pull"/.test(card11), "记忆页的联动卡片可渲染（含拉取/测试/导入）");
  ok(typeof prev11 === "string" && /本机只读镜像/.test(prev11) && /河灯/.test(prev11), "只读镜像详情可渲染");
  const e11b = makeMsEngine();
  e11b.data.memApi.enabled = true;
  const api11b = new MemoryApiLink(e11b.engine);
  e11b.engine.memApi = api11b;
  const pull11b = await api11b.pull();
  ok(pull11b.ok === false && e11b.data.memApi.stats.fail === 1 && /指令|fetch|失败/.test(pull11b.note), "取不到资料时明确失败并计数，不写坏数据：" + pull11b.note.slice(0, 40));

  console.log("\n[12] v2.9.2 静态检查");
  ok(/version: "2.9.2"/.test(patched) && /小手机 v2\.9\.2/.test(patched), "版本号与头部注释 2.9.2");
  ok(/delegate: \{ enabled: true, keepPhoneRecall: false/.test(patched) && /this\.assertOwner\(/.test(patched) && /msDelegateCard/.test(patched) && /楼层记忆由百宝月夜书接管/.test(patched), "v2.9.2 归属互斥已接入（默认开关 / 拦截 / 镜像 / 视图）");
  ok(/ms: msFresh\(\)/.test(patched) && /memApi: memApiFresh\(\)/.test(patched) && /msValidate\(data\.ms\)/.test(patched) && /memApiValidate\(data\.memApi\)/.test(patched), "存档默认值与校验已接入（旧存档自动补齐）");
  ok(/var MemoryStudio = class/.test(patched) && /this\.ms = new MemoryStudio\(this\)/.test(patched) && /this\.ms\.start\(\)/.test(patched) && /this\.ms\.dispose\(\)/.test(patched) && /this\.ms\.onGenerationEnded\(\)/.test(patched), "MemoryStudio 已接入引擎生命周期（启动 / 生成结束 / 卸载）");
  ok(/var MemoryApiLink = class/.test(patched) && /this\.memApi = new MemoryApiLink\(this\)/.test(patched), "MemoryApiLink 已接入引擎");
  ok(/ms: msView/.test(patched) && /ms: "记忆工作台"/.test(patched) && /\$\{msCard\(ui\)\}\$\{memApiCard\(ui\)\}\$\{memApiPreviewCard\(ui\)\}/.test(patched), "路由 / 页面标题 / 记忆页卡片已注册");
  ok(/Math\.min\(3e5, 8e3 \* Math\.pow\(2, Math\.min\(5, this\.failCount\)\)\)/.test(patched) && /typeof api\.getAnchor === "function"/.test(patched), "柏宝书回写失败指数退避 + 锚点读取兜底");
  const msActions = ["ms-tab", "ms-toggle", "ms-mode", "ms-inject-toggle", "ms-options", "ms-summarize-now", "ms-stage", "ms-longer", "ms-ledger-scan", "ms-ledger-phone", "ms-ledger-edit", "ms-draft-confirm", "ms-draft-reject", "ms-draft-edit", "ms-drafts-confirm-all", "ms-drafts-clear", "ms-undo", "ms-node-toggle", "ms-node-edit", "ms-node-del", "ms-preview-recall", "ms-keywords", "ms-backfill", "ms-backfill-range", "ms-fill-gap", "ms-shelve", "ms-unshelve", "ms-shelve-toggle", "ms-shelve-options", "ms-preset", "ms-presets-reset", "ms-export", "ms-import", "ms-config-export", "ms-config-import", "ms-diag", "ms-log-clear"];
  const memApiActions = ["memapi-toggle", "memapi-options", "memapi-test", "memapi-pull", "memapi-preview", "memapi-import", "memapi-export"];
  const missA = msActions.concat(memApiActions).filter((a) => !new RegExp('case "' + a + '"').test(patched));
  ok(missA.length === 0, "动作分支齐全（记忆工作台 " + msActions.length + " + 公开 API " + memApiActions.length + "）" + (missA.length ? "，缺：" + missA.join(",") : ""));
  ok(/kind: "memory-diagnostics"/.test(patched) && /kind: "memory-config"/.test(patched) && /kind: "memory-archive"/.test(patched), "诊断 / 配置 / 档案三种导出格式已定义");
  ok(/includeBaibai/.test(patched) && /includeLife/.test(patched) && /includeLedger/.test(patched), "召回可分别开关柏宝书历史 / 生活细节 / 状态账本");
  ok(!/window\.fetch|XMLHttpRequest/.test(patched), "公开 API 联动只用桥接的 fetch，不额外引入网络实现");

  console.log(fails ? `\n✗ ${fails} 项失败` : "\n✓ 全部通过");
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error("测试异常：", err); process.exit(2); });
