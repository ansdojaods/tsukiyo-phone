  // src/services/actions.js
  var PhoneActions = class {
    constructor({ repo, bridge, settings, router, runner, notify }) {
      Object.assign(this, { repo, bridge, settings, router, runner, notify });
    }
    async perform(module, prepare, apply, { background = false, externalGuard = () => true, sigOf = null, requireAuto = true } = {}) {
      if (!this.settings.isEnabled(module)) throw moduleOffError(module);
      return this.runner.run(module, async (task) => {
        const snap = task.snapshot;
        assert(!(snap.character?.name?.includes("臭小鬼") && snap.stat?.系统?.作品 !== "臭小鬼"), "请先等待原卡变量初始化，再使用生成");
        assert(!(snap.stat?.系统?.作品 === "臭小鬼" && !snap.stat.系统.已选开场), "请先选择原卡开场，手机不会提前制造经历");
        const data = baibaiFilterInput(clone(this.repo.choose(snap)));
        const sigFn = sigOf || ((x) => moduleSignature(module, x)), sig = sigFn(this.repo.choose(snap)), apiSig = fingerprint([this.settings.data.profiles, this.settings.data.routes, this.settings.data.defaultProfile, this.settings.data.enabled]);
        const bbPolicy = fingerprint([baibaiPrefs(), baibaiReadEnabled()]);
        const request = baibaiEnrichRequest(module, prepare(data, snap));
        const raw = await this.router.call(module, { system: request.system, user: JSON.stringify(request.payload) }, { signal: task.signal, meta: request.meta });
        task.guard();
        assert(externalGuard(), "后台任务执行权已变化");
        assert(apiSig === fingerprint([this.settings.data.profiles, this.settings.data.routes, this.settings.data.defaultProfile, this.settings.data.enabled]), "API配置已经变化，旧结果未写入");
        assert(bbPolicy === fingerprint([baibaiPrefs(), baibaiReadEnabled()]), "记忆联动开关已变化，请重新生成");
        const value = request.parse(raw);
        let result;
        const notifications = [];
        await this.repo.mutate((s, current) => {
          task.guard();
          result = apply(s, value, current, request.meta, (...args) => notifications.push(args));
          log(s, "ok", request.success || "生成结果已保存", module);
          if (background && requireAuto) {
            s.automation.last[module] = Date.now();
            s.automation.next[module] = 0;
            s.automation.failures[module] = 0;
          }
        }, { snapshot: snap, guard: (s) => task.alive() && externalGuard() && sigFn(s) === sig && (!background || !requireAuto || s.settings.auto.enabled), label: request.success || "保存生成结果" });
        for (const args of notifications) this.notify?.(...args);
        return result ?? value;
      }, { background });
    }
    reply(threadId, options = {}) {
      return this.perform("chat", (s, snap) => {
        const t = s.threads.find((t2) => t2.id === threadId);
        assert(t && t.pending.length, "请先写一条消息并加入待发");
        assert(t.members.every((n) => contactAvailable(s.contacts.find((c) => c.id === n))), "会话中有目前不可联系的成员");
        return { system: rules + '\n模拟目标会话中的自然短回复。只让给定成员发言，群聊不要求人人说话。图片附件在本版本只提供文字说明，未提供像素时不要猜图像细节。消息中的转账、礼物只属于RP记录，不修改真实余额或剧情物品。只输出 JSON：{"replies":[{"contactId":"提供的成员ID","text":"简短自然回复"}]}。不必一问一答轮流：同一个人可以像真实聊天那样连发几条短消息（每条一个气泡，按发送顺序排列）。私聊1—6条，群聊0—8条。', payload: threadContext(s, snap, t), parse: (raw) => repliesFrom(raw, t, s), meta: { thread: clone(t), contacts: clone(s.contacts) }, success: "回复已写入本聊天，并同步正文参考" };
      }, (s, replies, snap, meta, emit) => {
        const t = appendMessages(s, threadId, replies, { pendingIds: meta.thread.pending.map((p) => p.id), story: this.storyStamp(s, snap) });
        emit("收到 " + replies.length + " 条回复", "message", threadId);
        return t;
      }, options);
    }
    proactive(contactId = null, options = {}) {
      return this.perform("proactive", (s, snap) => {
        const eligible = s.contacts.filter((c2) => contactAvailable(c2) && c2.proactive !== false).filter((c2) => {
          const t2 = s.threads.find((t3) => t3.kind === "direct" && t3.members[0] === c2.id);
          return !t2?.pending.length && (t2?.messages.filter((m) => m.role === "character" && !m.read).length || 0) < 3;
        }).sort((a, b) => Number(snap.present.includes(a.name)) - Number(snap.present.includes(b.name)) || (a.lastIncoming || 0) - (b.lastIncoming || 0));
        const c = contactId ? eligible.find((c2) => c2.id === contactId) : eligible[0];
        assert(c, "目前没有适合主动来信的角色：请检查联系人、待发与未读数量");
        const t = s.threads.find((t2) => t2.kind === "direct" && t2.members[0] === c.id) || { id: "not-created", kind: "direct", title: c.name, members: [c.id], messages: [], pending: [] };
        const ctx = threadContext(s, snap, { ...t, pending: [] });
        return { system: rules + '\n你在判断该角色是否有自己的理由主动发消息，不是在回复一条新的玩家消息。可以谈本人正在做的小事、自然跟进旧话题、提出尚待确认的邀约；不要窥探玩家未发送的草稿。别重复上一条、催促回应或凭空制造危机。若正在和玩家面对面，一般不用手机重复问候；没有合适话题/现在忙/需要休息时应不发送。可以像真人一样连发1—4条短消息。只输出 {"send":true或false,"contactId":"指定角色ID","texts":["第一条","可选的第二条"],"reason":"一句简短情境依据，不写思维过程"}。不发送时可省略texts。', payload: { ...ctx, 主动发言者: actorContext(s, snap, c), 说明: "玩家没有新发消息；此时判断是否主动联系" + proactiveCooldownNote(s) }, parse: (raw) => incomingFrom(raw, c), meta: { contact: clone(c), thread: clone(t), contacts: clone(s.contacts) }, success: "主动来信检查完成" };
      }, (s, value, snap, meta, emit) => {
        if (!value.send) {
          log(s, "info", "角色选择暂时不联系：" + value.reason, "proactive");
          return value;
        }
        const c = s.contacts.find((c2) => c2.id === meta.contact.id);
        assert(contactAvailable(c), "角色当前不可联系");
        const t = ensureThread(s, [c.id]);
        appendMessages(s, t.id, (value.texts || [value.text]).map((x) => ({ author: c.id, text: x })), { proactive: true, story: this.storyStamp(s, snap) });
        s.automation.proactiveLog = [...s.automation.proactiveLog || [], { name: c.name, contactId: c.id, text: text(value.text || (value.texts || []).join(" / "), 120), reason: text(value.reason || "", 60), ts: Date.now() }].slice(-40);
        s.automation.lastActor = c.id;
        emit(c.name + "：" + value.text.slice(0, 65), "message", t.id);
        return value;
      }, options);
    }
    plan(options = {}) {
      return this.perform("planner", (s, snap) => {
        const payload = planningContext(s, snap);
        return { system: rules + '\n你是日常与人物关系的剧情规划员。把宏观方向、未来七日内的可选场景、当前一步分开。参考确已发生的正文与人物独立日程，不强造外部危机；普通日常、拒绝、改期也能成戏。给1—3个彼此不同的方向，每个2—4步；每步day为0—6的相对天数，不自动推进时间。只使用可用人物ID，可只安排玩家自己的事。步骤是尚未发生的机会，不预写玩家答应、告白、消费或行动。若有主线进行中事务，当前一步先接住它，不强切场景或抢跑。每步留2—4个可自由替代的意向，并给可从正文核对的完成依据。避免重复近期方向，尊重学校/工作/异地等条件。只输出JSON：{"directions":[{"title":"短标题","summary":"方向概述，不预定结局","tone":"日常/合作/感情/探索","reason":"一句情境依据","members":["联系人ID"],"beats":[{"day":0,"title":"当前一步","scene":"具体起因与留白，100字内","trigger":"时间地点和意愿前提","choices":["可选意向一","可选意向二"],"finish":"实际完成的判定依据"}]}]}。', payload, parse: (raw) => plansFrom(raw, s, payload.剧情时间.date), meta: { contacts: s.contacts.filter(contactAvailable), story: payload.剧情时间 }, success: "新的未来方向已保存；尚未执行" };
      }, (s, plans, snap, meta, emit) => {
        assert(s.plans.length + plans.length <= 100, "方向档案已满，请先导出整理");
        s.plans.push(...plans);
        if (s.settings.planningMode === "auto" && !s.activePlan) {
          const history = s.plans.filter((p) => p.status === "completed").slice(-5);
          const score = (p) => p.members.filter((id2) => snap.present.includes(s.contacts.find((c) => c.id === id2)?.name)).length * 2 - history.filter((h) => h.tone === p.tone).length;
          const picked = [...plans].sort((a, b) => score(b) - score(a))[0];
          adoptPlan(s, picked.id, "auto");
          emit("已自动采用「" + picked.title + "」作为隐藏走向，不替你行动", "plan", picked.id);
        } else emit("有 " + plans.length + " 个新方向，留在手机里等你挑选", "plan");
        return plans;
      }, options);
    }
    social(contactId = null, options = {}) {
      return this.perform("social", (s, snap) => {
        const c = contactId ? s.contacts.find((c2) => c2.id === contactId) : s.contacts.filter(contactAvailable).filter((c2) => c2.follow !== false).sort((a, b) => (s.feed.filter((p) => p.author === a.id).at(-1)?.ts || 0) - (s.feed.filter((p) => p.author === b.id).at(-1)?.ts || 0))[0];
        assert(contactAvailable(c), "请选择可联系的动态作者");
        return { system: rules + '\n请为指定人物写一条生活动态。可以是当下的小感想或确实在做的小事，不泄露私聊秘密、未公开心事或他人资料，不冒充已经发生的未来旅行。只输出 {"authorId":"指定ID","text":"200字内动态","theme":"rain/coffee/sky/none"}。不虚构照片事实，theme仅是装饰色块。', payload: { 人物: actorContext(s, snap, c, { social: true }), 公开动态: s.feed.filter((p) => p.author === c.id).slice(-3).map((p) => p.text) }, parse: (r) => postFrom(r, c), meta: { contact: c }, success: "朋友圈更新已保存" };
      }, (s, value, snap, meta, emit) => {
        value.story = this.storyStamp(s, snap);
        limitAppend(s.feed, value, 500, "朋友圈");
        emit("朋友圈有新动态", "feed");
        return value;
      }, options);
    }
    postReply(postId, contactId, options = {}) {
      return this.perform("social", (s, snap) => {
        const p = s.feed.find((p2) => p2.id === postId), c = s.contacts.find((c2) => c2.id === contactId);
        assert(p && contactAvailable(c), "动态或作者当前不可用");
        return { system: rules + '\n指定人物正在阅读这条公开动态与评论。只根据这条内容和自己的公开资料决定是否回复，不能读别人的私聊；没有实际图像输入，不编造图片细节。不合适时send=false。输出 {"send":true,"contactId":"指定ID","text":"自然的短评论","reason":"一句情境依据"}。', payload: { 作者: actorContext(s, snap, c, { social: true }), 动态: { 作者: p.author, 内容: p.text, 评论: p.comments } }, parse: (r) => incomingFrom(r, c), meta: { contact: c, postId }, success: "动态回复检查已完成" };
      }, (s, value, snap, meta, emit) => {
        if (!value.send) return value;
        const p = s.feed.find((p2) => p2.id === postId);
        assert(p, "动态已不存在");
        assert(p.comments.length < 100, "评论已满");
        p.comments.push({ id: id("comment"), author: contactId, text: text(value.text, 600), ts: Date.now() });
        emit("朋友圈有一条新回复", "feed");
        return value;
      }, options);
    }
    diary(options = {}) {
      return this.perform("diary", (s, snap) => ({ system: rules + '\n根据已发生的正文和交流写一份日记草稿。不要替玩家决定隐私情绪、承诺或未做的动作。只输出 {"title":"80字内标题","text":"1000字内记录"}，明确区分已发生事实和未执行计划。', payload: { 剧情时间: storyFor(s, snap), 正文: snap.history.slice(-6), 已发送交流: s.threads.flatMap((t) => t.messages.slice(-3).filter((m) => m.read || m.role === "user").map((m) => ({ 参与者: t.members, 文本: m.text }))).slice(-12) }, parse: diaryFrom, meta: {}, success: "日记草稿已保存，仍需你确认" }), (s, value, snap) => {
        const row = { id: id("diary"), ...value, date: storyFor(s, snap).date, status: "draft", ts: Date.now(), source: "AI草稿" };
        limitAppend(s.diary, row, 300, "日记");
        return row;
      }, options);
    }
    memory(threadId = null, options = {}) {
      return this.perform("memory", (s, snap) => {
        const t = threadId ? s.threads.find((t2) => t2.id === threadId) : [...s.threads].sort((a, b) => b.messages.length - a.messages.length).find((t2) => t2.messages.length);
        assert(t?.messages.length, "还没有可整理的交流");
        const last = s.summaries.filter((x) => x.threadId === t.id).at(-1);
        const boundary = last?.coveredId ? t.messages.findIndex((m) => m.id === last.coveredId) : -1;
        const selected = { ...t, messages: t.messages.slice(Math.max(0, boundary + 1), Math.max(0, boundary + 1) + 40) };
        assert(selected.messages.length, "这段交流已经归纳过了");
        const p = s.activePlan ? s.plans.find((p2) => p2.id === s.activePlan.id) : null, beat = p?.beats[s.activePlan.cursor];
        return { system: rules + '\n只归纳给定会话本批消息。重要事实必须附本批sourceIds和逐字quote；没证据就不记。邀请只标promise待办，不能当现实事件完成。正文与手机同属一个故事，但未参与者不应自动获得私人知识。可选核对当前规划的一步是否确已在实际正文完成：只有明确满足完成依据且有楼层和原句证据时才progress.done=true；不因回合数或说想做就推进。只输出 {"summary":"350字内摘要","facts":[{"kind":"phone_fact或promise","text":"确实说过的事实/未完约定","sourceIds":["本批消息ID"],"quote":"消息原句"}],"progress":{"done":false,"planId":"当前方向ID","beatId":"当前步骤ID","floor":0,"quote":"正文原句"}}。facts最多8条，可为空。不输出分析过程。', payload: { 当前会话: { id: t.id, members: t.members, 消息: selected.messages.map((m) => ({ id: m.id, author: m.author, text: m.text, read: m.read })) }, 旧摘要: last?.text || "", 实际正文: snap.history.slice(-4), 当前一步: p ? { planId: p.id, beatId: beat.id, title: beat.title, scene: beat.scene, finish: beat.finish } : null }, parse: (r) => memoryFrom(r, selected, snap), meta: { thread: selected, planId: p?.id, beatId: beat?.id }, success: "有来源的记忆已整理并接入正文" };
      }, (s, value, snap, meta, emit) => {
        assert(s.memories.length + value.facts.length <= 1e3, "记忆已达上限，请先备份整理");
        for (const f of value.facts) if (!s.memories.some((m) => m.threadId === f.threadId && m.text === f.text)) s.memories.push(f);
        limitAppend(s.summaries, { id: id("summary"), threadId: meta.thread.id, text: value.summary, coveredId: meta.thread.messages.at(-1).id, sourceIds: meta.thread.messages.map((m) => m.id), ts: Date.now() }, 500, "摘要");
        if (value.progress?.done && s.activePlan?.id === meta.planId && value.progress.planId === meta.planId) {
          const p = s.plans.find((p2) => p2.id === meta.planId);
          if (p.beats[s.activePlan.cursor]?.id === meta.beatId && value.progress.beatId === meta.beatId) progressPlan(s, { quote: value.progress.quote, floor: value.progress.floor });
        }
        return value;
      }, options);
    }
    reviewPlan(options = {}) {
      return this.perform("memory", (s, snap) => {
        assert(s.activePlan, "尚未选择方向");
        const p = s.plans.find((p2) => p2.id === s.activePlan.id), b = p.beats[s.activePlan.cursor];
        return { system: rules + '\n只核对当前一步是否在给定正文中确已完成。愿望、提议、准备和未来时态不算完成。证据不足就done=false。只输出 {"done":false,"floor":0,"quote":"实际正文逐字原句"}，不写分析。', payload: { plan: p.title, step: b.title, finish: b.finish, 正文: snap.history.slice(-4) }, parse: (raw) => {
          const x = parseModelJson(raw, 8e3);
          assert(typeof x.done === "boolean", "核对结果必须说明done");
          if (x.done) assert(Number.isInteger(x.floor) && typeof x.quote === "string" && x.quote.trim().length >= 4 && snap.history.some((m) => m.floor === x.floor && m.text.includes(x.quote.trim())), "核对未附可验证的正文原句");
          return x;
        }, meta: { planId: p.id, beatId: b.id }, success: "已按正文核对当前一步" };
      }, (s, value, snap, meta) => {
        assert(s.activePlan?.id === meta.planId, "采用的方向已经改变");
        const p = s.plans.find((p2) => p2.id === meta.planId);
        assert(p.beats[s.activePlan.cursor].id === meta.beatId, "当前步骤已改变");
        if (value.done) progressPlan(s, { quote: value.quote, floor: value.floor });
        s.automation.lastNarrative = snap.signature;
        return value;
      }, options);
    }
    festivals(options = {}) {
      return this.perform("diary", (s, snap) => {
        const w = storyFor(s, snap), today0 = w.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), base = /^\d{4}-\d{2}-01$/.test(options.month || "") ? options.month : monthStart(today0), end = addDays(base, monthDays(base) - 1);
        return { system: rules + '\n你是手机日历助手。根据剧情日期与地点（' + (PRESET ? PRESET.calendar : '静冈县富士宫市及周边）、季节、“21岁成年人就读的高三最后一年”校历') + '）、已知人物的日常与已有日程，生成从起始日期到结束日期（一整个自然月）内值得标注的日子，必须覆盖这个月的每一周，每周至少3条，月初、月中、月末都要有。类型只能是：风俗、庆典、节气、游玩、校园、约定、纪念日。风俗/庆典/节气可用当地真实或本卡资料中的日期；本卡架空的活动在note里注明“本卡架空”。“约定”必须是某位已知人物可能提出的邀约提案（写清谁、为什么、想去哪），只是待商量，不能写成已经答应。游玩类要给出具体可以玩的内容。只输出 {"events":[{"title":"20字内","date":"YYYY-MM-DD","time":"HH:MM或空","kind":"类型","place":"地点","members":["相关人物名"],"note":"60字内看点/玩法"}]}，15—25条，按日期排序，日期都在起始日期与结束日期之间，不与已有日程重复。', payload: { 剧情时间: w, 起始日期: base, 结束日期: end, 人物: s.contacts.slice(0, 24).map((c) => ({ 名字: c.name, 状态: c.status, 已相认: c.recognized })), 已有日程: s.agenda.filter((a) => a.date >= base && a.date <= end).slice(-60).map((a) => ({ 标题: a.title, 日期: a.date })), 本卡节庆资料: builtinEvents(base, monthDays(base)).map((x) => x.date + " " + x.title), 近期正文: snap.history.slice(-3) }, parse: (raw) => festivalsFrom(raw, s, base, end), meta: { base }, success: base.slice(0, 7) + " 整月节日与活动已加入日历" };
      }, (s, list) => ({ list, added: addCalendarEvents(s, list, "一键生成") }), options);
    }
    diaries(authors, options = {}) {
      return this.perform("diary", (s, snap) => {
        const chosen = authors.map((a) => a === "user" ? { id: "user", name: "玩家" } : s.contacts.find((c) => c.id === a)).filter(Boolean);
        assert(chosen.length, "请至少选择一位写日记的角色");
        const people = chosen.filter((c) => c.id !== "user").map((c) => {
          const ctx = actorContext(s, snap, c);
          return { 名字: c.name, 年龄: c.age, 状态: c.status, 人设: text(c.bio || ctx.本人?.人设 || "", 900), 本人过往: (ctx.本人?.过往 || []).slice(-3), 本人知道的约定与记忆: ctx.相关约定, 柏宝书简报: ctx.柏宝书简报, 可见正文: (ctx.当前可见正文 || []).slice(-2) };
        });
        return { system: rules + '\n为每位指定角色各写一篇今天的日记（第一人称，用本人的口吻、用词习惯和关注点）。每人只写本人亲历、亲耳听到或本人手机里收到的事；不知道的事不写，不读取别人的私聊。可以写本人自己的日常（上课、训练、店务、家事、社团、心事），不必都围绕玩家。不替玩家写心理、台词或同意。若写“玩家”的日记，只记录已在正文发生的客观经历，心情用留白。只输出 {"entries":[{"author":"角色名或玩家","title":"20字内标题","mood":"两字心情","text":"300—600字日记"}]}，顺序与给定角色一致。', payload: { 剧情时间: storyFor(s, snap), 写日记的角色: chosen.map((c) => c.name), 角色资料: people, 玩家记忆参考: chosen.length === 1 && chosen[0].id === "user" ? baibaiPlanningBrief() : void 0, 近期正文: chosen.length === 1 && chosen[0].id === "user" ? snap.history.slice(-5) : [], 今日日程: s.agenda.filter((a) => a.date === storyFor(s, snap).date).map((a) => a.title) }, parse: (raw) => diariesFrom(raw, chosen), meta: {}, success: "角色日记已保存为草稿" };
      }, (s, rows, snap) => {
        const date = storyFor(s, snap).date;
        for (const r of rows) limitAppend(s.diary, { id: id("diary"), ...r, date, status: "draft", ts: Date.now(), source: "AI · " + r.authorName }, 300, "日记");
        return rows;
      }, options);
    }
    heartTraces(authors, options = {}) {
      return this.perform("diary", (s, snap) => {
        const chosen = (authors || []).map((a) => s.contacts.find((c) => c.id === a || nameKey(c.name) === nameKey(String(a)))).filter(Boolean);
        assert(chosen.length, "请至少选择一位要生成恋爱心迹的角色");
        const fctx = collectFloorContext(this.bridge, snap, options.floor);
        const brief = baibaiBrief(null, { maxAge: 1500 });
        const people = chosen.map((c) => {
          const ctx = actorContext(s, snap, c);
          const bbNpc = (brief?.npcs || []).find((n) => nameKey(n.name) === nameKey(c.name));
          const prevHearts = s.diary.filter((d) => d.kind === "heart" && d.author === c.id).slice(-2).map((d) => ({ 楼层: "#" + ((d.floor ?? 0) + 1) + "楼", 心情: d.mood, 心动: d.heartbeat, 摘要: text(d.replyToFloor || d.text, 120) }));
          return {
            名字: c.name,
            年龄: c.age,
            状态: c.status,
            人设: text(c.bio || ctx.本人?.人设 || "", 900),
            柏宝书关系与好感: bbNpc ? { 称呼: text(bbNpc.title, 80), 与玩家关系: text(bbNpc.relation, 100), 纽带: text(bbNpc.ties, 120), 好感状态: text(bbNpc.affinityText, 120), 好感备注: text(bbNpc.affinityNote, 160), 当前近况: text(bbNpc.condition, 120), 在场: !!bbNpc.present } : void 0,
            柏宝书简报: ctx.柏宝书简报,
            先前恋爱心迹延续: prevHearts,
            本人知道的约定与记忆: ctx.相关约定
          };
        });
        const focusHint = text(options.focusHint || "", 200);
        return {
          system: rules + '\n你是「恋爱心迹」专属叙事心理师。请紧扣【目标楼层正文】中玩家与角色的互动细节、角色性格设定与【柏宝书关系与好感】，为每位指定角色各写一篇针对该楼层的「恋爱心迹」。\n要求：\n1. 严格贴合角色本人的性格、说话腔调与心理防线（如傲娇嘴硬、温柔克制、天然呆、腹黑占有等），绝不千篇一律。\n2. 必须直接呼应【目标楼层正文】和【本楼层前一条玩家言行】里的具体动作、眼神或话语，写出角色在那一刻最真实的悸动、醋意、纠结或心软。\n3. 即使角色当时未直接开口，也可写ta在场旁观、事后听闻或此刻挂念玩家时的私密心声。' + (focusHint ? '\n4. 本次额外侧重：' + focusHint : '') + '\n只输出严格 JSON：{"traces":[{"author":"角色名","title":"18字内浪漫或微妙的心迹标题","mood":"2到4字情绪词（如：耳根发烫/嘴硬心软/暗自吃味）","heartbeat":"心动指数与变化（如：78% · 心跳漏拍）","stage":"当前情感阶段（如：暧昧拉扯/情根深种/暗恋试探）","surface":"50字内：本楼层里ta表面上装作的样子或外在反应","replyToFloor":"90字内：针对本楼层你的言行，ta在心底对你说却没敢说出口的话（用第二人称“你”）","text":"180—360字：第一人称（“我”）恋爱心迹独白，细腻描写本楼层互动瞬间ta的真实悸动与心事","secret":"55字内：藏在心底的小秘密，或下一次见面想悄悄对你做的小动作"}]}，顺序与给定角色一致。',
          payload: {
            剧情时间: storyFor(s, snap),
            目标楼层编号: "#" + (fctx.targetFloor + 1) + "楼",
            本楼层前一条玩家言行: fctx.prevUserText || "（无单独前置输入，见目标楼层正文）",
            目标楼层正文: fctx.targetText,
            近期上下文楼层: fctx.recentTurns,
            心迹角色: chosen.map((c) => c.name),
            角色资料与好感: people
          },
          parse: (raw) => heartTracesFrom(raw, chosen, fctx.targetFloor, brief),
          meta: { floor: fctx.targetFloor },
          success: "已生成 #" + (fctx.targetFloor + 1) + " 楼的恋爱心迹"
        };
      }, (s, rows, snap, meta) => {
        const date = storyFor(s, snap).date;
        for (const r of rows) {
          limitAppend(s.diary, {
            id: id("heart"),
            ...r,
            date,
            status: "confirmed",
            ts: Date.now(),
            source: "恋爱心迹 · #" + ((meta.floor ?? 0) + 1) + "楼"
          }, 300, "日记");
        }
        return rows;
      }, options);
    }
    heartFollowup(diaryId, playerPrompt, options = {}) {
      return this.perform("diary", (s, snap) => {
        const d = s.diary.find((x) => x.id === diaryId && x.kind === "heart");
        assert(d, "恋爱心迹不存在");
        const c = s.contacts.find((x) => x.id === d.author) || { id: d.author, name: d.authorName || "角色", bio: "" };
        const ctx = s.contacts.some((x) => x.id === c.id) ? actorContext(s, snap, c) : {};
        const q = text(playerPrompt, 400);
        assert(q, "请输入你想回应或追问的内容");
        return {
          system: rules + '\n玩家正在回应或追问角色在 #' + ((d.floor ?? 0) + 1) + ' 楼写下的「恋爱心迹」。请以角色本人的第一人称口吻，针对玩家的这句追问/撩拨/互动做出既有表面反应、又有心底真实悸动的回应。只输出 JSON：{"mood":"2到4字当下反应情绪","answer":"80—200字：角色对玩家这句回应的心底回音与反应（第一人称“我”，对玩家称“你”）"}。',
          payload: {
            角色: c.name,
            人设: text(c.bio || "", 700),
            柏宝书简报: ctx.柏宝书简报,
            原恋爱心迹: { 楼层: "#" + ((d.floor ?? 0) + 1) + "楼", 标题: d.title, 心情: d.mood, 表面: d.surface, 心底回应: d.replyToFloor, 正文: d.text, 秘密: d.secret },
            已有互动追问: (d.followups || []).slice(-3),
            玩家本次追问或动作: q
          },
          parse: (raw) => {
            const body = parseModelJson(raw, 2e4);
            const ans = text(body.answer || body.reply || body.text, 1e3);
            assert(ans, "未生成有效的心迹回音");
            return { q, a: ans, mood: text(body.mood || "", 24), ts: Date.now() };
          },
          meta: { diaryId },
          success: c.name + " 回应了你的心迹追问"
        };
      }, (s, item, _snap, meta) => {
        const target = s.diary.find((x) => x.id === meta.diaryId);
        assert(target, "恋爱心迹已被移除");
        target.followups = [...(Array.isArray(target.followups) ? target.followups : []).slice(-9), item];
        return item;
      }, options);
    }
    /** 生活清单：focus.mode = auto（按正文，不限人物）| pick（指定多人）| random（随机 N 人） */
    autoTasks(focus = { mode: "auto" }, options = {}) {
      return this.perform("diary", (s, snap) => {
        const f = focus?.mode && focus.mode !== "auto" ? resolveFocus(s, snap, focus) : null;
        const people = f ? focusPayload(s, snap, f.people) : null;
        return {
          system: rules + "\n根据最近的正文和手机交流，整理出玩家可能想做的“生活清单”：已提到但尚未做的事、答应过的小事、想一起去的地方、需要准备的物品、学习或店务目标。不把已完成的事写入，不替任何人答应。" + (people ? "\n【指定人物】本次只围绕“关注人物”整理：玩家想和他们一起做的事、答应过他们的小事、为他们准备的东西、他们提过想去或想要的东西。不要涉及未列出的人物；每条在 people 里写涉及的人物姓名数组。" : "") + '只输出 {"tasks":[{"title":"30字内","category":"约定/准备/学习/店务/出游/心愿","target":1到5的整数,"why":"20字内来源"' + (people ? ',"people":["姓名"]' : "") + "}]}，3—8条，不与已有清单重复。",
          payload: { 剧情时间: storyFor(s, snap), 已有清单: s.tasks.map((t) => t.title), 近期正文: snap.history.slice(-6), 手机交流: s.threads.flatMap((t) => t.messages.slice(-4).map((m) => ({ 会话: t.title, 内容: m.text }))).slice(-16), 日程: s.agenda.filter((a) => ["proposed", "confirmed"].includes(a.status)).slice(-10).map((a) => a.title), ...people ? { 关注人物: people } : {} },
          parse: (raw) => listFrom(raw, "tasks", 8),
          meta: { people: f ? f.people.map((c) => c.id) : [] },
          success: f ? "已为 " + f.people.map((c) => c.name).join("、") + " 生成清单" : "已根据正文生成清单"
        };
      }, (s, rows, snap, meta) => {
        const focused = s.contacts.filter((c) => meta.people.includes(c.id));
        let n = 0;
        for (const x of rows) {
          const title = text(x.title, 180);
          if (!title || s.tasks.some((t) => t.title === title)) continue;
          const target = Math.min(5, Math.max(1, Math.trunc(Number(x.target) || 1)));
          const row = { id: id("task"), title, category: text(x.category || "生活", 40), progress: 0, target, done: false, source: (focused.length ? "人物生成" : "正文生成") + (x.why ? "：" + text(x.why, 40) : "") };
          if (focused.length) row.people = namesToIds(x.people, focused, meta.people);
          limitAppend(s.tasks, row, 300, "清单");
          n++;
        }
        return n;
      }, options);
    }
    /** 备忘：同上，可指定多个人物 */
    autoNotes(focus = { mode: "auto" }, options = {}) {
      return this.perform("diary", (s, snap) => {
        const f = focus?.mode && focus.mode !== "auto" ? resolveFocus(s, snap, focus) : null;
        const people = f ? focusPayload(s, snap, f.people) : null;
        return {
          system: rules + "\n根据最近的正文和手机交流，替玩家整理几张备忘便签：需要记住的时间地点、别人提到的喜好与小细节、没解决的疑问、要带的东西、电话号码以外的普通信息。只记录已经出现的信息，不编造。" + (people ? "\n【指定人物】本次只围绕“关注人物”整理：他们各自的喜好与忌口、说过的话、答应或约定的事、需要记住的细节。不要写未列出的人物；每张便签在 people 里写涉及的人物姓名数组。" : "") + '只输出 {"notes":[{"title":"15字内","text":"100字内，可分行"' + (people ? ',"people":["姓名"]' : "") + "}]}，2—6条，不与已有便签重复。",
          payload: { 剧情时间: storyFor(s, snap), 已有便签: s.notes.map((n) => n.title), 近期正文: snap.history.slice(-6), 手机交流: s.threads.flatMap((t) => t.messages.slice(-4).map((m) => ({ 会话: t.title, 内容: m.text }))).slice(-16), ...people ? { 关注人物: people } : {} },
          parse: (raw) => listFrom(raw, "notes", 6),
          meta: { people: f ? f.people.map((c) => c.id) : [] },
          success: f ? "已为 " + f.people.map((c) => c.name).join("、") + " 生成备忘" : "已根据正文生成备忘"
        };
      }, (s, rows, snap, meta) => {
        const focused = s.contacts.filter((c) => meta.people.includes(c.id));
        let n = 0;
        for (const x of rows) {
          const title = text(x.title, 80) || "无题", body = text(x.text, 6e3);
          if (!body || s.notes.some((m) => m.title === title && m.text === body)) continue;
          const row = { id: id("note"), title, text: body, ts: Date.now(), source: focused.length ? "人物生成" : "正文生成" };
          if (focused.length) row.people = namesToIds(x.people, focused, meta.people);
          limitAppend(s.notes, row, 300, "便签");
          n++;
        }
        return n;
      }, options);
    }
    /** 朋友圈：可指定多人 / 随机 / 按正文自动；一次调用，每人一条 */
    socialMany(focus = { mode: "auto" }, options = {}) {
      return this.perform("social", (s, snap) => {
        const pool = s.contacts.filter(contactAvailable).filter((c) => c.follow !== false);
        const f = resolveFocus(s, snap, focus, { pool, max: 6, autoMax: 3 });
        return {
          system: rules + '\n请为每位指定人物各写一条朋友圈动态（每人一条）。只写这个人自己的日常小事或当下感想，可以呼应正文里已经公开发生的场面；不泄露私聊秘密、未公开心事或他人资料，不冒充已经发生的未来旅行。不同人物的语气、用词与关注点要有区别。只输出 {"posts":[{"authorId":"指定ID","text":"200字内动态","theme":"rain/coffee/sky/none"}]}，每人一条。theme 仅是装饰色块，不虚构照片事实。',
          payload: { 剧情时间: storyFor(s, snap), 人物们: authorContexts(s, snap, f.people) },
          parse: (raw) => postsFrom(raw, f.people),
          meta: { authors: f.people.map((c) => c.id) },
          success: "朋友圈已生成 " + f.people.map((c) => c.name).join("、") + " 的动态"
        };
      }, (s, posts, snap, meta, emit) => {
        const stamp = this.storyStamp(s, snap);
        for (const p of posts) {
          p.story = stamp;
          limitAppend(s.feed, p, 500, "朋友圈");
        }
        emit("朋友圈有 " + posts.length + " 条新动态", "feed");
        return posts;
      }, options);
    }
    /** 生成“记忆世界书”内容：从近期正文与手机交流提炼带原句依据的长期记忆（之后由记忆世界书同步进世界书） */
    memoryBookGenerate(options = {}) {
      return this.perform("memory", (s, snap) => {
        const hist = snap.history.slice(-8).map((m) => ({ ...m, text: m.text.slice(-2600) }));
        const chatRows = s.threads.flatMap((t) => t.messages.slice(-8).map((m) => ({ 会话: t.title, 说话人: m.author === "user" ? "玩家" : s.contacts.find((c) => c.id === m.author)?.name || "成员", 内容: text(m.text, 400) })));
        assert(hist.length || chatRows.length, "还没有可以整理的正文或手机交流");
        const corpus = [...hist, ...chatRows.map((r) => ({ text: r.内容 }))];
        return {
          system: rules + '\n你是长期记忆整理员：从【近期正文】与【手机交流】里提炼值得长期记住的事实，写进“记忆世界书”，供之后的剧情引用。要求：只记确实发生或确实说过的事；愿望、提议和未来计划只能写成“约定/打算”，不能写成已经发生。每条 text 40—200 字，第三人称陈述句，写清人物与时间地点（如有）；title 8—16 字概括；keys 给 2—4 个触发关键词（人物名、地点、物件），只关于玩家自己的事可留空数组；audience 是知道这件事的人物姓名数组，玩家写“玩家”；每条必须附 quote：取自【近期正文】或【手机交流】的逐字原句（不少于6字）作为依据，没有依据就不要记；不要与【已有记忆】重复。另给 summary：到目前为止的剧情概要（400字内，可为空字符串）。只输出 {"summary":"","facts":[{"title":"","text":"","keys":[],"audience":[],"quote":"","kind":"narrative_fact或phone_fact或promise"}]}，facts 3—10 条。',
          payload: { 剧情时间: storyFor(s, snap), 玩家: snap.userName, 近期正文: hist, 手机交流: chatRows.slice(-24), 已有记忆: s.memories.slice(-40).map((m) => text(m.text, 120)), 人物: s.contacts.slice(0, 40).map((c) => c.name) },
          parse: (raw) => memoryBookFrom(raw, { corpus, contacts: s.contacts }),
          meta: {},
          success: "已生成记忆"
        };
      }, (s, value, snap, meta, emit) => {
        const seen = new Set(s.memories.map((m) => nameKey(m.text)));
        let added = 0;
        for (const f of value.facts) {
          const k = nameKey(f.text);
          if (seen.has(k)) continue;
          seen.add(k);
          assert(s.memories.length < 1e3, "记忆已达上限，请先备份整理");
          s.memories.push({ id: id("memory"), kind: f.kind, title: f.title, text: f.text, keys: f.keys, enabled: true, audience: f.audience, visibility: "private", sources: [{ quote: f.quote }], resolved: false, ts: Date.now() });
          added++;
        }
        if (value.summary) {
          const old = s.memories.find((m) => m.summary === true);
          if (old) Object.assign(old, { title: "剧情概要", text: value.summary, ts: Date.now() });
          else if (s.memories.length < 1e3) s.memories.push({ id: id("memory"), kind: "narrative_fact", title: "剧情概要", text: value.summary, keys: [], enabled: true, audience: ["user"], visibility: "private", sources: [{ note: "AI 归纳的剧情概要" }], resolved: false, ts: Date.now(), summary: true });
        }
        emit("记忆已更新：新增 " + added + " 条" + (value.summary ? "，并更新了剧情概要" : ""), "memory");
        return { added, summary: !!value.summary };
      }, options);
    }
    storyStamp(s, snap) {
      const w = storyFor(s, snap);
      return [w.date, w.time].filter(Boolean).join(" ") || "剧情时间未提供";
    }
  };

