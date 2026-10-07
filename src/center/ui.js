  // src/center/ui.js — one desktop entry, six internal sections, legacy route compatibility.
  var CENTER_TABS={overview:"总览",long:"长线规划",events:"事件推进",people:"人物动态",facts:"事实与记忆",settings:"设置与日志"};
  function centerLabel(ref){return ref?({beat:"面",line:"线",point:"点"}[ref.kind]+" · "+ref.title):"独立插曲（未关联规划）";}
  function centerEventLinkButton(ev){return button(ev.centerRef?"来源："+e(centerLabel(ev.centerRef)):"关联规划","center-link",ev.id);}
  function centerFactCards(ui){
    const s=ui.data,snap=ui.snapshot,c=centerData(s);
    return c.completions.slice().reverse().map(row=>{
      const valid=studioValid(row,snap),pending=row.status==="pending";
      return `<div class="card"><h3>${e(row.title)}</h3><small>${e(centerLabel(row.ref))} · ${{pending:"待核准回写",unlinked:"独立事件已核实",applied:"已回写原规划",dismissed:"不回写",reverted:"来源变化，已撤回进度",conflict:"后续修改冲突，需人工核对"}[row.status]}</small><p style="overflow-wrap:anywhere">${e(row.quote)}</p>${row.proofs?.length>1?`<details><summary>各阶段核实原句</summary>${row.proofs.map(p=>`<p style="overflow-wrap:anywhere">阶段${p.stage+1} · 楼层${p.floor}：${e(p.quote)}</p>`).join("")}</details>`:""}${!valid?hint("来源正文已变化：不再作为当前分支依据，不可回写或转入记忆。",true):""}<div class="buttons">${pending&&valid?button("核准回写原节点","center-apply",row.id):""}${pending?button("仅留记录，不回写","center-dismiss",row.id):""}${valid?button("登记亲历记忆","center-memory",row.id):""}${row.status==="conflict"?button("已人工核对，保留现状","center-resolve",row.id):""}</div></div>`;
    }).join("");
  }
  function centerPanel(ui,tab){const proxy=Object.create(ui);proxy.studioTab=tab;return studioPanelView(proxy);}
  function centerView(ui){
    const original=ui.data,snap=ui.snapshot,s=centerReadView(original,snap),proxy=Object.create(ui);Object.defineProperty(proxy,"data",{value:s});
    const st=studioData(s),c=centerData(s),tab=ui.route.view==="planner"?"long":ui.centerTab||"overview",active=st.active,focus=c.focus&&centerResolve(s,c.focus),pending=c.completions.filter(r=>r.status==="pending"&&studioValid(r,snap)).length;
    let body="";
    if(tab==="overview"){
      const b=s.arc.outline.beats[s.arc.outline.cursor],conflicts=c.receipts.filter(r=>r.status==="conflict").length;
      body=`<div class="card"><div class="overline">方向 → 候选 → 演绎 → 核实 → 回写</div><h3>${e(b?.title||"尚未建立长线方向")}</h3><p>${active?"当前事件："+e(active.event.title)+" · 阶段 "+(active.index+1)+"/"+active.event.stages.length:"当前没有执行中的事件"}</p><small>${active?e(centerLabel(active.event.centerRef)):"可以从长线节点衍生候选，也可以保留独立插曲。"}</small><div class="buttons">${button("查看长线","center-tab","long")}${button(active?"继续当前事件":"查看事件候选","center-tab","events")}</div></div>
      ${hint(centerDirector(s,snap,ui.engine.settings)?"当前事件掌握现场推进：大纲游标/重建暂缓；已关联的事件线或日程点受到保护，其余长线背景与独立线/点照常工作。":"所有模块共用任务队列。新增事件/侧写/状态建议仍需手动请求，草稿不会自动成为事实。")}
      <div class="buttons">${button("待回写 "+pending,"center-tab","facts")}${button("待审核人物建议 "+st.drafts.filter(r=>r.status==="pending").length,"center-tab","people")}${button("API与调度","center-tab","settings")}</div>${conflicts?hint("有 "+conflicts+" 项分支回写与后续编辑冲突。对应节点暂停自动改写/注入，请到事实页核对。",true):""}
      <h3>最近核实记录</h3>${c.completions.length?centerFactCards(proxy):empty("还没有已核实事件","先让事件在正文发生；阶段收束后再决定是否完成原规划。","memory")}`;
    }else if(tab==="long"){
      body=`${hint("保留原面·线·点。将一个节点选为来源后，可直接转成待编辑候选，或让导演生成不同演绎方案；来源关联按ID和内容签名保存，不靠标题猜测。")}
      <div class="card"><b>候选来源：${e(focus?centerLabel(c.focus):c.focus?"原节点已变化，请重选":"未指定")}</b><div class="buttons">${button("选择规划节点","center-source")}${button("清除来源","center-source-clear")}${button("从来源创建候选（不调用API）","center-draft")}${button("从来源生成候选方案 · 1次API","center-generate")}</div></div>
      ${centerDirector(s,snap,ui.engine.settings)?hint("当前大纲只提供标题级长期背景；原关联节点不会被并行模型改写，其他线与点仍可更新。"):""}${arcPlanViewOriginal(proxy)}`;
    }else if(tab==="events"){
      body=`<div class="card"><small>生成候选的来源：${e(c.focus?centerLabel(c.focus):"独立插曲")}</small><div class="buttons">${button("选择/更换来源","center-source")}${button("清除来源","center-source-clear")}${button("去长线规划","center-tab","long")}</div></div>${centerPanel(proxy,"events")}`;
    }else if(tab==="people"){
      const sub=ui.centerPeople||"parallel";
      body=`<div class="buttons">${button("侧写草稿","center-people","parallel",sub==="parallel"?"primary":"")}${button("状态审核","center-people","world",sub==="world"?"primary":"")}</div>${hint("同一处查看人物活动，但侧写是创作草稿，状态是经核准的记录；收藏侧写不会自动修改状态或记忆。")}${centerPanel(proxy,sub)}`;
    }else if(tab==="facts"){
      body=`${hint("事件完成只产生核实记录。只有你确认原规划的完成条件也已满足，才回写节点；一次小插曲不必收束整条线。回写不更改MVU/人物关系或日历约定。")}${centerFactCards(proxy)}<div class="buttons">${button("检查回写来源","center-reconcile")}${button("清理已处理核实记录","center-clean")}${button("手机原记忆库","go","memories")}</div><h3>按人物授权的亲历记忆</h3>${centerPanel(proxy,"memories")}`;
    }else{
      body=`${hint("统一入口与同一任务队列，不合并或重置旧费用设置。长线自动调用仍使用原每小时额度；事件/侧写/状态共用原12次手动额度。这里集中配置和查看。")}${arcAutoCard(proxy)}${centerPanel(proxy,"settings")}`;
    }
    return `<div class="pad"><div class="overline">STORY CENTER · 2.5.1</div><h2>剧情中心</h2><div class="buttons">${Object.entries(CENTER_TABS).map(([k,label])=>button(label,"center-tab",k,tab===k?"primary":"")).join("")}</div>${ui.engine.studio.status?hint(ui.engine.studio.status):""}${body}</div>`;
  }
  async function centerAction(ui,action,value){
    const eng=ui.engine;
    if(action==="center-tab"){assert(CENTER_TABS[value],"未知页面");ui.centerTab=value;ui.go("studio","",{replace:true});return;}
    if(action==="center-people"){ui.centerTab="people";ui.centerPeople=value==="world"?"world":"parallel";ui.render();return;}
    if(action==="st-tab"){
      const map={events:"events",parallel:"people",world:"people",memories:"facts",settings:"settings"};ui.centerTab=map[value]||"overview";if(["parallel","world"].includes(value))ui.centerPeople=value;ui.render();return;
    }
    await eng.center.maintain();
    eng.studio.status="";
    const origin=eng.bridge.capture();assert(eng.repo.snapshot?.owner===origin.owner&&eng.repo.snapshot?.signature===origin.signature,"聊天正在刷新，请稍后重试");
    const sig=fingerprint([studioData(ui.data),ui.data.arc]),st=studioData(ui.data),c=centerData(ui.data);
    const valid=()=>{try{return eng.bridge.same(origin)&&eng.bridge.capture().signature===origin.signature;}catch{return false;}};
    const save=(fn,label)=>eng.repo.mutate(s=>fn(s,centerEnsure(s)),{snapshot:origin,guard:s=>valid()&&sig===fingerprint([studioData(s),s.arc]),label});
    const dialog=async(title,body)=>{const r=await ui.dialog(title,body);assert(valid(),"聊天/正文已变化，请重新操作");return r;};
    const confirm=async(title,body)=>{const r=await ui.confirm(title,body);assert(valid(),"聊天/正文已变化，请重新操作");return r;};
    const targets=centerTargets(ui.data).filter(r=>!r.done).map(r=>[centerKey(r),centerLabel(r)+(r.kind==="beat"?(r.current?"〔当前〕":"〔非当前〕"):"")]);
    if(action==="center-source"){
      assert(targets.length,"请先在长线规划建立大纲、事件线或日程点");
      const r=await dialog("选择事件的规划来源",select("规划节点","target",targets,centerKey(c.focus)||targets[0][0]));
      if(r)await save((s,x)=>{x.focus=centerRef(s,r.target);assert(x.focus,"来源已不存在");},"选择剧情中心来源");
    }else if(action==="center-source-clear")await save((s,x)=>{x.focus=null;},"清除新候选的来源（不改既有事件）");
    else if(action==="center-draft"){
      const t=centerResolve(ui.data,c.focus);assert(t&&!t.done,"请先选择有效规划来源");
      const r=await dialog("由原节点衍生候选（尚未发生）",field("事件标题","title",t.title,{required:true,max:100})+field("当前阶段外部钩子，可修改","hook","围绕「"+t.title+"」铺垫一个外部变化，停在玩家可以回应的地方。参考意向："+t.detail.slice(0,500),{required:true,textarea:true,max:1200})+field("怎样才算满足原节点的完成条件","condition","由正文实际经历和玩家核对决定",{textarea:true,max:500}));
      if(r)await save((s,x)=>{assert(s.studio.pool.length<40,"候选池已满");const ev=studioCheckEvent({id:id("event"),title:studioText(r.title,100),weight:10,secret:"从原规划衍生的候选，未自动推进原规划。",stages:[{hook:studioText(r.hook,1200),condition:studioText(r.condition,500)}],status:"candidate",...studioStamp(origin)});centerBind(s,ev,x.focus);s.studio.pool.push(ev);},"由规划节点创建关联候选");
      if(r)ui.centerTab="events";
    }else if(action==="center-generate"){
      assert(centerResolve(ui.data,c.focus),"先选择有效的规划来源");if(await confirm("从节点生成候选方案","调用一次导演API，只产生关联候选，不推进原规划。")){await eng.studio.generate("director");ui.centerTab="events";}
    }else if(action==="center-link"){
      const ev=st.pool.find(r=>r.id===value);assert(ev,"事件不存在");
      if(ev.status!=="candidate"){await confirm("事件的来源关联",centerLabel(ev.centerRef)+(centerLinkValid(ui.data,ev)?"\n关联仍有效。":"\n原规划已变化，停止自动采用。")+"\n已执行事件不允许事后更换来源。");return;}
      const r=await dialog("关联现有候选到原规划",select("来源","target",[["","独立插曲（不回写规划）"],...targets],centerKey(ev.centerRef)));
      if(r)await save(s=>{const item=s.studio.pool.find(e=>e.id===value);if(!r.target)delete item.centerRef;else centerBind(s,item,centerRef(s,r.target));},"更改候选来源关联");
    }else if(action==="st-next"){
      assert(st.active&&studioValid(st.active,origin)&&centerLinkValid(ui.data,st.active.event),"当前事件或来源关联已失效");
      assert(origin.floor>st.active.floor,"需要一条新的角色正文作为本阶段发生依据");
      const r=await dialog("核实本阶段（不自动完成原规划）",field("引用本阶段开始之后的角色正文原句，至少4字符","quote","",{textarea:true,required:true,max:1000}));
      if(r){let result;await save(s=>{result=centerAdvance(s,origin,r.quote);},"核实剧情中心事件阶段");if(result.completed){ui.centerTab="facts";eng.studio.status=result.record.ref?"事件已收束；原规划尚未推进，请核准是否回写。":"独立事件已核实，未改动长线规划。";}}
    }else if(action==="center-apply"){
      const row=c.completions.find(r=>r.id===value);assert(row?.ref,"没有可回写的来源");
      const verb={beat:"把当前大纲推进一个节点（终节点仅登记完成）",line:"将整条原事件线标为收束",point:"将原日程点标为已发生"}[row.ref.kind];
      if(await confirm("核准回写："+row.ref.title,verb+"。只有当前事件确实满足原规划的完成条件才继续；不会自动添加记忆、改变状态或替玩家确认其他事情。"))await save(s=>centerWriteback(s,origin,value),"核准事件回写原规划");
    }else if(action==="center-dismiss")await save((s,x)=>{const row=x.completions.find(r=>r.id===value);assert(row?.status==="pending","记录已处理");row.status="dismissed";},"保留事件事实，不推进规划");
    else if(action==="center-memory"){
      const row=c.completions.find(r=>r.id===value);assert(row&&studioValid(row,origin),"核实记录来源失效");
      assert(!st.memories.some(m=>m.centerCompletion===row.id),"这条核实记录已登记记忆，请在下方编辑知情人与内容");
      const r=await dialog("从原文登记亲历记忆",select("确实参与并知情的联系人","contactId",ui.data.contacts.map(p=>[p.id,p.name]),ui.data.contacts[0]?.id||"")+field("事实摘要（不要添加未来阶段或私密后台）","text",row.quote,{required:true,textarea:true,max:1500}));
      if(r)await save((s,x)=>{assert(s.contacts.some(p=>p.id===r.contactId),"联系人已移除");const original=x.completions.find(q=>q.id===value);assert(studioValid(original,origin),"原文来源变化");s.studio.memories.push({id:id("witness"),witnesses:[r.contactId],text:studioText(r.text,1500),evidence:original.quote,centerCompletion:original.id,floor:original.floor,prefix:original.prefix});},"将核实记录登记为本人亲历记忆");
    }else if(action==="center-resolve"){
      if(await confirm("已人工核对，保留现状","不会恢复旧证据，也不会重新推进。仅解除该收据的冲突保护，请先在长线页自行纠正不符合当前正文的进度。"))await save((s,x)=>{const r=x.receipts.find(r=>r.completionId===value&&r.status==="conflict");assert(r,"冲突不存在");r.status="reverted";const d=x.completions.find(r=>r.id===value);if(d)d.status="dismissed";},"人工核对回写冲突");
    }else if(action==="center-reconcile"){await eng.center.maintain();eng.studio.status="来源已核对：可安全撤销的回写已撤回；存在后续编辑的部分保留待人工核对。";}
    else if(action==="center-clean"){
      if(await confirm("清理已处理核实记录","只清理不再需要追踪的未关联/已忽略/已撤回记录；待回写、已回写和冲突收据继续保留，以免丢失撤回依据。请先导出。"))await save((s,x)=>{x.completions=x.completions.filter(r=>["pending","applied","conflict"].includes(r.status));const ids=new Set(x.completions.map(r=>r.id));x.receipts=x.receipts.filter(r=>ids.has(r.completionId));},"清理剧情中心核实记录");
    }else return studioActionLegacy(ui,action,value);
    eng.updatePrompt();ui.render();
  }
  async function studioAction(ui,action,value){
    if(action.startsWith("center-")||action==="st-next"||action==="st-tab")return centerAction(ui,action,value);
    if(action==="st-event-start"){const ev=studioData(ui.data).pool.find(r=>r.id===value);assert(centerLinkValid(ui.data,ev),"关联规划已变化，请先重新关联候选");}
    return studioActionLegacy(ui,action,value);
  }

  // ============================================================
  // v2.6 新增：世界书工坊（多数据类型 → 世界书双向联动）
  // 与既有「记忆世界书」并行：记忆仍由记忆模块负责，这里负责
  // 日记 / 恋爱心迹 / 摘要 / 人物档案（NPC 性格）/ 约定 / 备忘 / 清单。
  // ============================================================
  var BOOK_STUDIO_SOURCE = "book-studio";
  var BOOK_SOURCES = Object.freeze({
    diary: "角色与玩家日记",
    hearts: "恋爱心迹",
    summaries: "会话摘要",
    persona: "人物档案（NPC 性格与资料）",
    agenda: "约定与日程",
    notes: "备忘便签",
    tasks: "生活清单",
    soul: "灵魂链接档案（性格 / 世界观 / 家世 / 人际 / 记忆）"
  });
  var bookFreshState = () => ({
    name: "", scope: "card", linked: false, autoSync: true, bound: false, lastSyncAt: 0, lastError: "",
    pendingDelete: [], excludedKeys: [], managedKeys: [], stats: null,
    sources: { diary: true, hearts: true, summaries: true, persona: true, agenda: true, notes: false, tasks: false, soul: false },
    prefix: "【小手机】", maxEntries: 400, pullBack: true, constantPersona: false
  });
  function bookContentSig(content) {
    return fingerprint([String(content ?? "").trim()]);
  }
  function bookEntryContent(e2) {
    return String(e2?.content ?? "").trim();
  }
  function bookStampOf(raw) {
    const st = raw?.extra?.[MEMORY_TAG];
    return st && st.source === BOOK_STUDIO_SOURCE ? st : null;
  }
  function buildBookEntry(r) {
    const base = DEFAULT_ENTRY();
    const keys = cleanKeys(r.keys);
    base.strategy.type = keys.length && !r.constant ? "selective" : "constant";
    base.strategy.keys = keys;
    return {
      ...base, name: text(r.name, 120) || String(r.key || "条目").slice(0, 60), enabled: r.enabled !== false,
      content: String(r.content ?? "").trim().slice(0, 8e3),
      extra: { [MEMORY_TAG]: { source: BOOK_STUDIO_SOURCE, kind: r.src, key: r.key, hash: bookContentSig(r.content), v: 1 } }
    };
  }
  function stampBookEntry(raw, r) {
    const keys = cleanKeys(r.keys), st = raw?.extra?.[MEMORY_TAG] || {};
    return {
      ...raw, name: text(r.name, 120) || raw.name, enabled: r.enabled !== false,
      content: String(r.content ?? "").trim().slice(0, 8e3),
      strategy: { ...(raw.strategy || {}), type: keys.length && !r.constant ? "selective" : "constant", keys },
      extra: { ...raw.extra, [MEMORY_TAG]: { ...st, source: BOOK_STUDIO_SOURCE, kind: r.src, key: r.key, hash: bookContentSig(r.content), v: 1 } }
    };
  }
  var BookStudio = class {
    constructor(engine) {
      this.eng = engine;
      this.events = new Emitter();
      this.timer = null;
      this.tick = null;
      this.pending = null;
      this.running = false;
      this.again = false;
      this.stopped = false;
      this.confirmNeeded = null;
      this.lastHash = "";
      this.lastBookSig = "";
      this.phase = "idle";
      this.note = "";
    }
    on(fn) {
      return this.events.on(fn);
    }
    get bridge() {
      return this.eng.bridge;
    }
    get cfg() {
      const d = this.eng.repo.data;
      if (!d) return null;
      if (!isObject(d.bookSync)) d.bookSync = bookFreshState();
      if (!isObject(d.bookSync.sources)) d.bookSync.sources = { ...bookFreshState().sources };
      return d.bookSync;
    }
    supported() {
      return !!(this.bridge.wbSupported?.() && this.bridge.wbWritable?.());
    }
    publish(patch = {}) {
      Object.assign(this, patch);
      this.events.emit({ type: "status" });
      this.eng.emit("status");
    }
    recordsFor(data, snap, { all = false } = {}) {
      const cfg = data.bookSync || this.cfg, src = all ? Object.fromEntries(Object.keys(BOOK_SOURCES).map(k => [k, true])) : cfg.sources || {}, rows = [];
      const nameOf = (id2) => id2 === "user" ? "我" : data.contacts.find((c) => c.id === id2)?.name || "";
      const keyNames = (value) => [...new Set(data.contacts.map((c) => c.name).filter((n) => n && String(value).includes(n)))].slice(0, 8);
      const push = (r) => {
        if (!r.content) return;
        const content = String(r.content).trim().slice(0, 8e3);
        rows.push({ ...r, content, hash: bookContentSig(content) });
      };
      if (src.diary) {
        for (const d of data.diary.filter((x) => x.kind !== "heart").slice(-cfg.maxEntries)) {
          const who = nameOf(d.author || "user");
          push({
            src: "diary", id: d.id, key: "diary:" + d.id, ts: d.ts || 0,
            name: `${cfg.prefix}[日记] ${d.date || ""} ${d.title || "今天"}`.trim(),
            content: `【${d.date || "未注明日期"}】${d.title || "今天"}\n${d.text || ""}\n（作者：${who} · 心情：${d.mood || "未记"}）`,
            keys: [...(d.date ? [d.date] : []), ...keyNames(d.text || ""), who].filter(Boolean)
          });
        }
      }
      if (src.hearts) {
        for (const d of data.diary.filter((x) => x.kind === "heart").slice(-cfg.maxEntries)) {
          const who = nameOf(d.author || "user");
          push({
            src: "hearts", id: d.id, key: "heart:" + d.id, ts: d.ts || 0,
            name: `${cfg.prefix}[心迹] #${(d.floor ?? 0) + 1}楼 ${who}`,
            content: `【#${(d.floor ?? 0) + 1}楼 · ${who}】${d.title || "心迹"}\n${d.text || ""}`,
            keys: [who, `第${(d.floor ?? 0) + 1}楼`]
          });
        }
      }
      if (src.summaries) {
        for (const m of data.summaries.slice(-Math.min(120, cfg.maxEntries))) {
          const t = data.threads.find((x) => x.id === m.threadId);
          const who = t ? t.members.map(nameOf).filter(Boolean) : [];
          push({
            src: "summaries", id: m.id, key: "summary:" + m.id, ts: m.ts || 0,
            name: `${cfg.prefix}[摘要] ${t?.title || "旧会话"}`,
            content: `【${t?.title || "旧会话"}】\n${m.text || ""}`,
            keys: [...who, "会话摘要"]
          });
        }
      }
      if (src.persona) {
        for (const c of data.contacts) {
          const body = [c.bio ? "【人物设定】\n" + c.bio : "", c.extraNotes ? "【新增补充】\n" + c.extraNotes : "", c.status ? "【近况】" + c.status : ""].filter(Boolean).join("\n\n");
          if (!body) continue;
          push({
            src: "persona", id: c.id, key: "persona:" + c.id, ts: 0, constant: !!cfg.constantPersona,
            name: `${cfg.prefix}[人物] ${c.name}`,
            content: body,
            keys: [c.name, ...(c.aliases || []), ...(c.tags || [])].filter(Boolean)
          });
        }
      }
      if (src.soul) {
        for (const row of Object.values(soulData(data).roster)) {
          const body = soulRender(soulData(data), row.name);
          if (!body) continue;
          push({
            src: "soul", id: row.name, key: "soul:" + row.name, ts: row.updatedAt || 0, constant: false,
            name: `${cfg.prefix}[灵魂] ${row.name}`,
            content: body,
            keys: [row.name, ...(row.aliases || [])].filter(Boolean)
          });
        }
      }
      if (src.agenda) {
        for (const a of data.agenda.filter((x) => x.status !== "cancelled").slice(-Math.min(200, cfg.maxEntries))) {
          const people = (a.members || []).map(nameOf).filter(Boolean);
          push({
            src: "agenda", id: a.id, key: "agenda:" + a.id, ts: a.ts || 0,
            name: `${cfg.prefix}[约定] ${a.date || ""} ${a.title || ""}`.trim(),
            content: [`【${a.date || "未定日期"} · ${a.title || "约定"}】`, a.detail || a.note || "", a.time ? "时间：" + a.time : "", a.place ? "地点：" + a.place : "", people.length ? "相关：" + people.join("、") : "", a.status ? "状态：" + a.status : ""].filter(Boolean).join("\n"),
            keys: [...(a.date ? [a.date] : []), ...people].filter(Boolean)
          });
        }
      }
      if (src.notes) {
        for (const n of data.notes.slice(-Math.min(200, cfg.maxEntries))) {
          push({ src: "notes", id: n.id, key: "note:" + n.id, ts: n.ts || 0, name: `${cfg.prefix}[备忘] ${n.title || "便签"}`, content: `【备忘】${n.title || "便签"}\n${n.text || ""}`, keys: keyNames(n.text || "") });
        }
      }
      if (src.tasks) {
        for (const t of data.tasks.slice(-Math.min(200, cfg.maxEntries))) {
          push({
            src: "tasks", id: t.id, key: "task:" + t.id, ts: t.ts || 0,
            name: `${cfg.prefix}[清单] ${t.title || "心愿"}`,
            content: [`【清单】${t.title || "心愿"}`, t.category ? "分类：" + t.category : "", `进度：${t.progress || 0}/${t.target || 1}${t.done ? "（已完成）" : ""}`, t.note || ""].filter(Boolean).join("\n"),
            keys: keyNames(t.title || "")
          });
        }
      }
      const cap = Math.max(20, Number(cfg.maxEntries) || 400);
      const sorted = rows.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
      return all ? sorted : sorted.filter(r => !(cfg.excludedKeys || []).includes(r.key)).slice(-cap);
    }
    counts(data = null) {
      const d = data || this.eng.repo.data;
      const out = {};
      for (const k of Object.keys(BOOK_SOURCES)) out[k] = 0;
      if (!d) return out;
      try {
        const rows = this.recordsFor(d, this.bridge.capture());
        for (const r of rows) out[r.src] = (out[r.src] || 0) + 1;
      } catch {
      }
      out.total = Object.keys(BOOK_SOURCES).reduce((n, k) => n + (out[k] || 0), 0);
      return out;
    }
    info() {
      const cfg = this.cfg, s = this.eng.repo.data;
      const counts = s ? this.counts(s) : {};
      return {
        supported: this.supported(), linked: !!cfg.linked, name: cfg.name || "", scope: cfg.scope || "card",
        bound: !!cfg.bound, autoSync: cfg.autoSync !== false, lastSyncAt: cfg.lastSyncAt || 0,
        lastError: cfg.lastError || "", stats: cfg.stats || null, counts,
        prefix: cfg.prefix || "【小手机】", maxEntries: cfg.maxEntries || 400, pullBack: cfg.pullBack !== false,
        constantPersona: !!cfg.constantPersona, phase: this.phase, note: this.note, confirm: this.confirmNeeded
      };
    }
    start() {
      this.stopped = false;
      clearInterval(this.tick);
      this.tick = setInterval(() => {
        if (this.cfg?.linked && this.cfg.autoSync !== false) this.schedule(300);
      }, 45e3);
    }
    stop() {
      this.stopped = true;
      clearTimeout(this.pending);
      clearInterval(this.tick);
      this.pending = this.tick = null;
    }
    schedule(delay = 1500) {
      if (this.stopped) return;
      clearTimeout(this.pending);
      this.pending = setTimeout(() => {
        if (this.cfg?.linked && this.cfg.autoSync !== false) this.sync({ reason: "auto" }).catch(() => {
        });
      }, delay);
    }
    hashNow() {
      const s = this.eng.repo.data;
      if (!s) return "";
      try {
        return fingerprint(this.recordsFor(s, this.bridge.capture()).map((r) => [r.key, r.content]));
      } catch {
        return "";
      }
    }
    notePhoneChange() {
      const cfg = this.cfg;
      if (!cfg?.linked || cfg.autoSync === false) return;
      const h = this.hashNow();
      if (h === this.lastHash) return;
      this.lastHash = h;
      this.schedule(1500);
    }
    poke(kind, args = []) {
      const cfg = this.cfg;
      if (!cfg?.linked || cfg.autoSync === false) return;
      const book = typeof args[0] === "string" ? args[0] : "";
      if (book && book !== cfg.name) return;
      if (kind !== "worldbook") return this.schedule(1500);
      this.bridge.wbRead(cfg.name).then((rows) => {
        const sig = fingerprint(rows.map((r) => [r.uid ?? r.id, r.name, r.content]));
        if (sig !== this.lastBookSig) this.schedule(600);
        this.lastBookSig = sig;
      }, () => this.schedule(600));
    }
    _mutate(fn, label, origin = null) {
      const snap = origin || this.bridge.capture();
      reviewAssert(this.eng, snap);
      const d = this.eng.repo.data;
      if (d && !isObject(d.bookSync)) d.bookSync = bookFreshState();
      if (d && !isObject(d.bookSync.sources)) d.bookSync.sources = { ...bookFreshState().sources };
      return this.eng.repo.mutate(fn, { label, snapshot: snap });
    }
    async link({ name = "", scope = "card", acceptExisting = false, sources = null } = {}) {
      assert(this.supported(), "需要酒馆助手的世界书接口（getWorldbook / createWorldbook / updateWorldbookWith）");
      const snap = this.bridge.capture();
      const book = cleanBookName(name) || defaultBookName(snap, scope).replace(/-小手机记忆/, "-小手机世界书");
      this.publish({ phase: "linking", note: "正在创建 / 连接世界书…" });
      try {
        const names3 = await this.bridge.wbNames();
        reviewAssert(this.eng, snap);
        if (names3.includes(book)) {
          const rows = await this.bridge.wbRead(book);
          reviewAssert(this.eng, snap);
          if (rows.length && !acceptExisting) {
            const err = Error("世界书「" + book + "」已经存在，里面有 " + rows.length + " 个条目。");
            err.code = "BOOK_EXISTS";
            err.count = rows.length;
            err.book = book;
            throw err;
          }
        } else assert(await this.bridge.wbCreate(book, []) || (await this.bridge.wbNames()).includes(book), "创建世界书失败");
        reviewAssert(this.eng, snap);
        let bindError = "";
        const bound = await this.bridge.wbBind(book, scope).then(() => true, (e2) => {
          bindError = redactError(e2, []);
          return false;
        });
        await this._mutate((s) => {
          if (s.bookSync.name !== book) { s.bookSync.managedKeys = []; s.bookSync.syncBases = []; }
          if (sources) s.bookSync.sources = { ...s.bookSync.sources, ...sources };
          Object.assign(s.bookSync, { name: book, scope, linked: true, bound, autoSync: true, pendingDelete: [], lastError: bound ? "" : "世界书已创建，但没能绑定：" + bindError });
          log(s, "ok", "世界书工坊已连接：" + book, "memory");
        }, "连接世界书工坊", snap);
        this.lastHash = "";
        return await this.sync({ reason: "link", force: true });
      } finally {
        this.publish({ phase: "idle" });
      }
    }
    async unlink({ unbind = false } = {}) {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接世界书");
      if (unbind) await this.bridge.wbUnbind(cfg.name, cfg.scope).catch(() => false);
      await this._mutate((s) => {
        s.bookSync.linked = false;
        s.bookSync.bound = s.bookSync.bound && !unbind;
        s.bookSync.pendingDelete = [];
        log(s, "info", "已停止世界书工坊同步（世界书本身保留）", "memory");
      }, "停止世界书工坊同步");
      this.confirmNeeded = null;
      this.publish({});
    }
    async rebind() {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接世界书");
      await this.bridge.wbBind(cfg.name, cfg.scope);
      await this._mutate((s) => {
        s.bookSync.bound = true;
        s.bookSync.lastError = "";
      }, "重新绑定世界书工坊");
      this.publish({});
    }
    async setAutoSync(on) {
      await this._mutate((s) => {
        s.bookSync.autoSync = !!on;
      }, "世界书工坊自动同步开关");
      if (on) this.schedule(400);
    }
    async setSource(id2, on) {
      assert(Object.hasOwn(BOOK_SOURCES, id2), "未知的数据类型");
      await this._mutate((s) => {
        s.bookSync.sources = { ...s.bookSync.sources, [id2]: !!on };
      }, "世界书工坊数据类型开关");
      this.schedule(600);
    }
    async setOptions(patch) {
      await this._mutate((s) => {
        if (typeof patch.prefix === "string") s.bookSync.prefix = patch.prefix.slice(0, 20);
        if (patch.maxEntries !== void 0) s.bookSync.maxEntries = Math.round(clamp(patch.maxEntries, 20, 2000));
        if (patch.pullBack !== void 0) s.bookSync.pullBack = !!patch.pullBack;
        if (patch.constantPersona !== void 0) s.bookSync.constantPersona = !!patch.constantPersona;
      }, "世界书工坊选项");
      this.schedule(600);
    }
    async cleanOrphans() {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接世界书");
      const recs = new Set(this.recordsFor(this.eng.repo.data, this.bridge.capture()).map((r) => r.key));
      const entries = await this.bridge.wbRead(cfg.name);
      const managed = new Set(cfg.managedKeys || []);
      const orphans = entries.filter((r) => bookStampOf(r) && managed.has(String(bookStampOf(r).key)) && !recs.has(String(bookStampOf(r).key)));
      if (!orphans.length) return { removed: 0 };
      await this.bridge.wbUpdate(cfg.name, (fresh) => fresh.filter((r) => {
        const st = bookStampOf(r);
        return !(st && managed.has(String(st.key)) && !recs.has(String(st.key)));
      }));
      this.lastHash = "";
      return { removed: orphans.length };
    }
    async rebuildFromPhone() {
      const cfg = this.cfg;
      assert(cfg?.linked, "还没有连接世界书");
      const entries = await this.bridge.wbRead(cfg.name);
      const managed = new Set([...(cfg.managedKeys || []), ...this.recordsFor(this.eng.repo.data, this.bridge.capture()).map(r => r.key)]);
      const mine = entries.filter((r) => bookStampOf(r) && managed.has(String(bookStampOf(r).key))).map((r) => r.uid ?? r.id);
      await this.bridge.wbUpdate(cfg.name, (fresh) => fresh.filter((r) => !mine.includes(r.uid ?? r.id)));
      await this._mutate((s) => {
        s.bookSync.pendingDelete = [];
        s.bookSync.lastError = "";
      }, "准备重建世界书");
      this.confirmNeeded = null;
      this.lastHash = "";
      return this.sync({ reason: "rebuild", force: true, acceptMassDelete: true });
    }
    async sync({ reason = "auto", force = false, acceptMassDelete = false } = {}) {
      if (this.stopped || !this.cfg?.linked) return null;
      if (this.running) {
        this.again = true;
        return null;
      }
      if (!force && this.bridge.isBusy?.()) {
        this.schedule(4e3);
        return null;
      }
      const runSnap = this.bridge.capture();
      this.running = true;
      this.publish({ phase: "syncing" });
      try {
        const cfg = this.cfg, book = cfg.name;
        const snap = this.bridge.capture(), data = this.eng.repo.data;
        const inputSig = fingerprint([data.bookSync, this.recordsFor(data, snap)]);
        const guard = () => { reviewAssert(this.eng, snap); assert(inputSig === fingerprint([this.eng.repo.data.bookSync, this.recordsFor(this.eng.repo.data, snap)]), "手机数据已变化，旧同步结果未提交"); return true; };
        const names3 = await this.bridge.wbNames();
        if (!names3.includes(book)) {
          const err = Error("世界书「" + book + "」不存在（可能在酒馆里被删除了）");
          err.code = "BOOK_MISSING";
          throw err;
        }
        const entries = await this.bridge.wbRead(book);
        guard();
        const mine = new Map();
        for (const e2 of entries) {
          const st = bookStampOf(e2);
          if (st) mine.set(String(st.key), { e: e2, st });
        }
        const recs = this.recordsFor(data, snap);
        const byKey = new Map(recs.map((r) => [r.key, r]));
        const plan = { create: [], update: [], pull: [], keep: 0, deleteWB: [], conflicts: 0 };
        for (const r of recs) {
          const hit = mine.get(r.key);
          if (!hit) {
            plan.create.push(r.key);
            continue;
          }
          const base = String(hit.st.hash || ""), local = r.hash, remote = bookContentSig(bookEntryContent(hit.e));
          const localBase = (cfg.syncBases || []).find(x => x.key === r.key)?.local || base;
          if (local === localBase && remote === base) plan.keep++;
          else if (local !== localBase && remote === base) plan.update.push(r.key);
          else if (local === localBase && remote !== base) plan.pull.push(r.key);
          else {
            // Both sides changed: preserve both; do not silently overwrite either copy.
            plan.conflicts++;
          }
        }
        for (const [key] of mine) if (!byKey.has(key) && (cfg.managedKeys || []).includes(key)) plan.deleteWB.push(key);
        let guarded = "";
        if (plan.deleteWB.length >= 5 && plan.deleteWB.length > Math.max(2, Math.floor(mine.size * 0.5))) {
          if (!acceptMassDelete) {
            this.confirmNeeded = { kind: "mass-delete", count: plan.deleteWB.length };
            plan.deleteWB = [];
            guarded = "held";
          }
        }
        let finalEntries = entries;
        if (plan.create.length || plan.update.length || plan.deleteWB.length || plan.pull.length) {
          const drop = new Set(plan.deleteWB), upd = new Set(plan.update), cre = new Set(plan.create);
          const pullSet = new Set(cfg.pullBack === false ? [] : plan.pull.filter(key => !["soul", "tasks"].includes(byKey.get(key)?.src)));
          finalEntries = await this.bridge.wbUpdate(book, (fresh) => {
            guard();
            assert(reviewBookSig(fresh) === reviewBookSig(entries), "世界书已被并行修改，请重新同步");
            const out = [];
            for (const raw of fresh) {
              const st = bookStampOf(raw);
              if (!st) {
                out.push(raw);
                continue;
              }
              const key = String(st.key);
              if (drop.has(key)) continue;
              if (upd.has(key) && byKey.has(key)) {
                out.push(stampBookEntry(raw, byKey.get(key)));
                continue;
              }
              if (pullSet.has(key) && String(raw.content || "").trim()) {
                out.push({ ...raw, extra: { ...raw.extra, [MEMORY_TAG]: { ...st, source: BOOK_STUDIO_SOURCE, kind: st.kind, key: st.key, hash: bookContentSig(raw.content), v: 1 } } });
                continue;
              }
              out.push(raw);
            }
            for (const key of cre) if (byKey.has(key)) out.push(buildBookEntry(byKey.get(key)));
            return out;
          });
        }
        const view = new Map();
        for (const e2 of finalEntries) {
          const st = bookStampOf(e2);
          if (st) view.set(String(st.key), e2);
        }
        const stats = { created: plan.create.length, updated: plan.update.length, pulled: 0, conflicts: plan.conflicts, deleted: plan.deleteWB.length, skipped: 0 };
        const pulls = [];
        for (const key of plan.pull) {
          const entry = view.get(key), r = byKey.get(key);
          if (!entry || !r) continue;
          if (cfg.pullBack === false || ["soul", "tasks"].includes(r.src)) {
            stats.skipped++;
            continue;
          }
          pulls.push({ key, id: r.id, src: r.src, content: bookEntryContent(entry), name: entry.name });
        }
        await this.eng.repo.mutate((s) => {
          const applied = applyBookPulls(s, pulls, s.bookSync.name, cfg.pullBack !== false);
          stats.skipped += applied.skipped;
          stats.pulled = applied.pulled;
          const bs = s.bookSync;
          const pulledKeys = new Set(pulls.map(p => p.key)), updatedKeys = new Set(plan.update);
          const localRows = this.recordsFor(s, snap), activeKeys = new Set(localRows.map(r => r.key));
          bs.syncBases = (bs.syncBases || []).filter(x => activeKeys.has(x.key) && !pulledKeys.has(x.key) && !updatedKeys.has(x.key));
          for (const r of localRows) if (pulledKeys.has(r.key)) bs.syncBases.push({key:r.key, local:r.hash});
          bs.managedKeys = [...new Set([...byKey.keys(), ...(bs.managedKeys || [])])].filter(k => view.has(k) || byKey.has(k)).slice(0, 4000);
          bs.lastSyncAt = Date.now();
          bs.stats = stats;
          bs.lastError = guarded === "held" ? "本地来源减少，已暂停大量删除远端工坊条目：请核对后确认清理" : plan.conflicts ? "手机与世界书同时修改：已保留双方，未自动覆盖。请预览核对后手动处理或备份后重建。" : "";
          if (applied.pulled) log(s, "info", "从世界书取回 " + applied.pulled + " 条修改（日记 / 摘要 / 备忘 / 约定 / 人物资料）", "memory");
          if (plan.conflicts) log(s, "warning", "有 " + plan.conflicts + " 条双方都修改过，已保留双方并暂停自动覆盖", "memory");
          bs.pendingDelete = [];
        }, { label: "世界书工坊同步", snapshot: snap, guard });
        this.lastHash = this.hashNow();
        this.lastBookSig = fingerprint(finalEntries.map((r) => [r.uid ?? r.id, r.name, r.content]));
        this.publish({ note: "" });
        return { reason, book, plan: { create: plan.create.length, update: plan.update.length, pull: plan.pull.length, deleteWB: plan.deleteWB.length, keep: plan.keep }, stats };
      } catch (err) {
        const message = err?.code === "BOOK_MISSING" ? err.message + "。可在本页重建，或停止同步。" : redactError(err, this.eng.settings.secrets());
        try {
          reviewAssert(this.eng, runSnap);
          await this.eng.repo.mutate((s) => {
            s.bookSync.lastError = message;
          }, { label: "世界书工坊同步失败记录", snapshot: this.bridge.capture() });
        } catch {
        }
        this.publish({ note: message });
        throw err;
      } finally {
        this.running = false;
        this.publish({ phase: "idle" });
        if (this.again) {
          this.again = false;
          this.schedule(900);
        }
      }
    }
    async acceptMassDelete() {
      this.confirmNeeded = null;
      return this.sync({ reason: "confirm", force: true, acceptMassDelete: true });
    }
    preview() {
      const recs = this.recordsFor(this.eng.repo.data, this.bridge.capture());
      return {
        format: "tsukiyo-book-studio", version: 1, book: this.cfg?.name || "", at: (/* @__PURE__ */ new Date()).toISOString(),
        count: recs.length, records: recs.map((r) => ({ key: r.key, src: r.src, name: r.name, keys: r.keys, content: r.content })),
        notice: "世界书工坊条目预览：仅用于核对与备份，不包含 API 密钥。"
      };
    }
  };
  function stripBookMeta(content, kind) {
    const t = String(content ?? "").trim();
    if (kind === "diary") {
      const m = t.match(/^【[^】]*】[^\n]*\n([\s\S]*?)\n（作者：[\s\S]*）$/);
      return m ? m[1].trim() : t;
    }
    if (kind === "hearts") {
      const m = t.match(/^【#[^】]*】[^\n]*\n([\s\S]*)$/);
      return m ? m[1].trim() : t;
    }
    if (kind === "summaries") {
      const m = t.match(/^【[^】]*】\n([\s\S]*)$/);
      return m ? m[1].trim() : t;
    }
    if (kind === "notes") {
      const m = t.match(/^【备忘】[^\n]*\n([\s\S]*)$/);
      return m ? m[1].trim() : t;
    }
    if (kind === "agenda") {
      const m = t.match(/^【[^】]*】[\s\S]*?\n([\s\S]*)$/);
      return m ? m[1].trim() : t;
    }
    return t;
  }
  function applyBookPulls(s, pulls, book, allow) {
    const stats = { pulled: 0, conflicts: 0, skipped: 0 };
    for (const p of pulls) {
      const content = String(p.content || "").trim();
      if (!content || !allow) {
        stats.skipped++;
        continue;
      }
      const body = stripBookMeta(content, p.src);
      if (p.src === "soul") {
        stats.skipped++;
        continue;
      }
      if (p.src === "diary" || p.src === "hearts") {
        const row = s.diary.find((x) => x.id === p.id);
        if (!row) {
          stats.skipped++;
          continue;
        }
        if (row.text !== body) {
          row.prev = row.text;
          row.text = body.slice(0, 6e3);
          stats.pulled++;
        }
        continue;
      }
      if (p.src === "summaries") {
        const row = s.summaries.find((x) => x.id === p.id);
        if (!row) {
          stats.skipped++;
          continue;
        }
        if (row.text !== body) {
          row.prev = row.text;
          row.text = body.slice(0, 4e3);
          stats.pulled++;
        }
        continue;
      }
      if (p.src === "notes") {
        const row = s.notes.find((x) => x.id === p.id);
        if (!row) {
          stats.skipped++;
          continue;
        }
        if (row.text !== body) {
          row.prev = row.text;
          row.text = body.slice(0, 4e3);
          stats.pulled++;
        }
        continue;
      }
      if (p.src === "agenda") {
        const row = s.agenda.find((x) => x.id === p.id);
        if (!row) {
          stats.skipped++;
          continue;
        }
        if ((row.note || "") !== body) {
          row.note = body.slice(0, 2e3);
          stats.pulled++;
        }
        continue;
      }
      if (p.src === "persona") {
        const c = s.contacts.find((x) => x.id === p.id);
        if (!c) {
          stats.skipped++;
          continue;
        }
        const list = Array.isArray(c.references) ? c.references.slice(0) : [];
        const item = { book: book || "世界书", name: "世界书同步（" + (c.name || "") + "）", content: content.slice(0, 16e3) };
        const i = list.findIndex((r) => r.name === item.name);
        if (i >= 0) list[i] = item;
        else if (list.length < 10) list.push(item);
        else list[9] = item;
        c.references = list;
        stats.pulled++;
        continue;
      }
      stats.skipped++;
    }
    return stats;
  }

