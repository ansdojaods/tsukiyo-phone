  // v2.9.6: reviewable writes, explicit conflict decisions, bounded local recovery.
  function safetyPlan(records, entries, cfg) {
    const mine = new Map(entries.filter(bookStampOf).map(e => [String(bookStampOf(e).key), {e,st:bookStampOf(e)}]));
    const byKey = new Map(records.map(r => [r.key,r]));
    const plan = {create:[],update:[],pull:[],deleteWB:[],conflictKeys:[],conflicts:0,keep:0};
    for (const r of records) {
      const hit=mine.get(r.key);
      if (!hit) {plan.create.push(r.key);continue;}
      const base=String(hit.st.hash || ""), localBase=(cfg.syncBases || []).find(x=>x.key===r.key)?.local || base;
      const lc=r.hash!==localBase, rc=bookContentSig(bookEntryContent(hit.e))!==base;
      if (!lc&&!rc) plan.keep++;
      else if(lc&&!rc) plan.update.push(r.key);
      else if(!lc&&rc) plan.pull.push(r.key);
      else plan.conflictKeys.push(r.key);
    }
    for(const key of mine.keys()) if(!byKey.has(key)&&(cfg.managedKeys||[]).includes(key)) plan.deleteWB.push(key);
    plan.conflicts=plan.conflictKeys.length;return plan;
  }
  function safetyInput(studio,snap,data=studio.eng.repo.data) {return fingerprint([data.bookSync,studio.recordsFor(data,snap)]);}
  async function safetyPreview(studio) {
    assert(studio.cfg?.linked && !studio.running,"请先连接工坊，等待当前同步结束");
    const snap=studio.bridge.capture(), book=studio.cfg.name, inputSig=safetyInput(studio,snap);
    const entries=await studio.bridge.wbRead(book);reviewAssert(studio.eng,snap);
    assert(inputSig===safetyInput(studio,snap),"读取期间手机资料变化，请重新预览");
    const records=studio.recordsFor(studio.eng.repo.data,snap);
    return {snap,book,inputSig,remoteSig:reviewBookSig(entries),records,entries,plan:safetyPlan(records,entries,studio.cfg)};
  }
  function safetyPreviewRows(p,cfg) {
    const rows=[];
    for(const [kind,label] of [["create","新增至世界书"],["update","覆盖世界书"],["pull","取回手机"],["deleteWB","删除远端条目"],["conflictKeys","双方冲突：需单独处理"]]) {
      for(const key of p.plan[kind]) {
        const local=p.records.find(r=>r.key===key),remote=p.entries.find(e=>String(bookStampOf(e)?.key)===key);
        const unsupported=kind==="pull"&&(cfg.pullBack===false||["soul","tasks"].includes(local?.src));
        rows.push({key,name:(unsupported?"跳过：不支持回灌":label)+" · "+(local?.name||remote?.name||key),kind,unsupported,content:"【当前手机】\n"+(local?.content||"（无）")+"\n\n【当前世界书】\n"+(remote?.content||"（无）")+"\n\n【本次动作】\n"+(unsupported?"保持双方不变":label)});
      }
    }
    return rows;
  }
  function recycleValidate(s) {
    if(s.recycle===undefined)return;
    assert(Array.isArray(s.recycle)&&s.recycle.length<=60,"回收站最多60条，请先导出或清理");
    assert(JSON.stringify(s.recycle).length<=500000,"回收站容量已满，请先导出或清理");
    const seen=new Set();
    for(const r of s.recycle){assert(r&&typeof r.id==="string"&&!seen.has(r.id)&&["memory","soul","conflict"].includes(r.kind)&&isObject(r.payload)&&typeof r.name==="string"&&typeof r.book==="string"&&r.book.length<=200&&Number.isFinite(r.at),"回收站记录无效");seen.add(r.id);}
  }
  function recycleAdd(s,kind,name,payload,book="") {
    const records=[...(s.recycle||[]),{id:id("recycle"),kind,name:String(name).slice(0,160),at:Date.now(),book,payload:clone(payload)}];
    recycleValidate({recycle:records});s.recycle=records;
  }
  function recycleImport(s,raw) {
    safeJson(raw);assert(raw?.app==="tsukiyo-phone"&&raw.kind==="recycle"&&Array.isArray(raw.records),"不是手机回收站备份");
    recycleValidate({recycle:raw.records});
    const records=clone(s.recycle||[]),known=new Set(records.map(r=>fingerprint([r.kind,r.name,r.book,r.payload])));
    for(const r of raw.records){const sig=fingerprint([r.kind,r.name,r.book,r.payload]);if(known.has(sig))continue;records.push({...clone(r),id:id("recycle")});known.add(sig);}
    recycleValidate({recycle:records});s.recycle=records;
  }
  function recycleCapture(before,after) {
    const live=new Set(after.memories.map(m=>m.id));
    for(const m of before.memories) if(!live.has(m.id)) recycleAdd(after,"memory",memoryTitle(m),m,before.memoryBook?.name||"");
    const roster=after.soul?.roster||{};
    for(const [name,row] of Object.entries(before.soul?.roster||{})) if(!Object.prototype.hasOwnProperty.call(roster,name)) recycleAdd(after,"soul",name,row,before.bookSync?.name||"");
  }
  function safetyQueueMemoryDelete(s,m) {
    if(!m.wb || !s.memoryBook?.linked || m.localOnly)return;
    const list=s.memoryBook.pendingDelete;
    if(list.some(r=>(typeof r==="string"?r:r.id)===m.id))return;
    assert(list.length<500,"记忆删除队列已满，请先完成同步");
    list.push({id:m.id,uid:m.wb.uid});
  }
  function safetyMemoryPreflight(s,plan,acceptMassDelete) {
    if(plan.guard&&!acceptMassDelete)return;
    const gone=new Set(plan.deleteLocal);
    if(gone.size)recycleCapture(s,{...s,recycle:clone(s.recycle||[]),memories:s.memories.filter(m=>!gone.has(m.id))});
  }
  function recycleRestore(s,selected) {
    let restored=0;
    for(const key of selected) {
      const r=(s.recycle||[]).find(x=>x.id===key);assert(r,"回收站记录已变化");
      assert(r.kind!=="conflict","冲突备份仅用于查看/导出，请在冲突面板手动合并");
      if(r.kind==="memory") {
        const m=clone(r.payload),oldId=m.id; m.id=id("memory");delete m.wb;delete m.bb;m.localOnly=true;
        assert(s.memories.length<1000,"手机记忆已达上限");s.memories.push(m);
        if(s.memoryBook.name===r.book)s.memoryBook.pendingDelete=s.memoryBook.pendingDelete.filter(x=>typeof x==="string"?x!==oldId:x.id!==oldId);
      } else {
        assert(!Object.prototype.hasOwnProperty.call(s.soul.roster,r.name),"同名档案已存在，不会覆盖："+r.name);
        assert(!["__proto__","prototype","constructor"].includes(r.name),"不允许的角色名");
        s.soul.roster[r.name]=clone(r.payload);
        const key="soul:"+r.name;
        s.bookSync.excludedKeys=[...new Set([...(s.bookSync.excludedKeys||[]),key])];
        // A local-only restoration must not delete or overwrite an existing remote copy.
        s.bookSync.managedKeys=(s.bookSync.managedKeys||[]).filter(k=>k!==key);
      }
      s.recycle=s.recycle.filter(x=>x.id!==key);restored++;
    }
    s.soul.stats.entries=Object.values(s.soul.roster).reduce((n,r)=>n+soulEntryCount(r),0);
    return restored;
  }
  async function safetyResolve(studio,p,key,choice,merged="") {
    assert(["local","remote","merge"].includes(choice),"请选择有效处理方式");
    assert(!studio.running,"工坊正在同步");
    const eng=studio.eng, r=p.records.find(x=>x.key===key),old=p.entries.find(x=>String(bookStampOf(x)?.key)===key);
    assert(p.plan.conflictKeys.includes(key)&&r&&old,"冲突条目已变化");
    if(choice!=="local")assert(!["soul","tasks"].includes(r.src),"该类型不支持结构化回灌，请手动整理后使用手机版本");
    const content=choice==="merge"?String(merged).trim():String(old.content||"");
    if(choice!=="local")assert(content&&content.length<=8000,"合并正文需为1至8000字");
    const guard=()=>{reviewAssert(eng,p.snap);assert(studio.cfg.name===p.book&&p.inputSig===safetyInput(studio,p.snap),"手机或连接已变化，请重新预览");return true;};
    studio.running=true;
    try {
      guard();const fresh=await studio.bridge.wbRead(p.book);guard();assert(reviewBookSig(fresh)===p.remoteSig,"世界书已变化，请重新预览");
      // Back up both sides before any remote write. Capacity errors stop the operation here.
      await eng.repo.mutate(s=>recycleAdd(s,"conflict",r.name,{local:r,remote:old},p.book),{snapshot:p.snap,guard,label:"冲突处理前备份"});
      await studio.bridge.wbUpdate(p.book,entries=>{guard();assert(reviewBookSig(entries)===p.remoteSig,"世界书已被并行修改");return entries.map(raw=>{
        if(String(bookStampOf(raw)?.key)!==key)return raw;
        if(choice==="local")return stampBookEntry(raw,r);
        return {...raw,content,extra:{...raw.extra,[MEMORY_TAG]:{...bookStampOf(raw),hash:bookContentSig(content)}}};
      });});
      await eng.repo.mutate(s=>{
        if(choice!=="local")applyBookPulls(s,[{...r,content}],p.book,true);
        s.bookSync.syncBases=(s.bookSync.syncBases||[]).filter(x=>x.key!==key);
        if(choice!=="local")s.bookSync.syncBases.push({key,local:studio.recordsFor(s,p.snap).find(x=>x.key===key).hash});
        s.bookSync.lastError="";
      },{snapshot:p.snap,guard,label:"确认工坊冲突处理"});
      studio.lastHash="";
    } finally {studio.running=false;eng.emit();}
  }
  async function safetyImportScope(eng,p,selected) {
    const mb=eng.memoryBook;
    assert(!mb.running&&mb.cfg.linked,"请先连接记忆世界书，等待同步结束");
    const guard=()=>{reviewAssert(eng,p.snap);assert(mb.cfg.name===p.book&&fingerprint([eng.repo.data.memoryBook,eng.repo.data.memories])===p.inputSig,"记忆或连接已变化，请重新打开");return true;};
    guard();const fresh=await eng.bridge.wbRead(p.book);guard();assert(fingerprint(fresh)===p.remoteSig,"世界书条目已变化，请重新选择");
    const valid=new Set(fresh.filter(r=>!bookStampOf(r)).map(r=>r.uid??r.id));assert(selected.every(u=>valid.has(u)),"选择包含无效条目");
    // Saving scope never silently executes a synchronization or deletes existing bindings.
    await eng.repo.mutate(s=>{s.memoryBook.selectionBook=p.book;s.memoryBook.importUids=[...new Set(selected)];},{snapshot:p.snap,guard,label:"管理记忆导入范围"});
    if(mb.cfg.scope==="card")mb.remember(p.snap,{name:p.book,scope:"card",importUids:mb.cfg.importUids});
  }
  async function safetyDiagnostics(eng) {
    const snap=eng.bridge.capture(),s=eng.repo.data;
    const apis=["getWorldbook","createWorldbook","updateWorldbookWith","rebindCharWorldbooks","rebindChatWorldbook"];
    const result={at:new Date().toISOString(),version:VERSION,schema:s.schema,validation:"ok",interfaces:Object.fromEntries(apis.map(k=>[k,typeof eng.bridge.api?.(k)==="function"])),books:{},contacts:{total:s.contacts.length},clock:storyFor(s,snap).origin,recycleCount:(s.recycle||[]).length};
    try{validatePhone(clone(s));}catch{result.validation="failed";}
    const expected=PRESET?PRESET.contacts.map(p=>p.id):snap.stat?.系统?.作品==="臭小鬼"?Object.keys(kusogaki_default.people).map(n=>"kg-"+fingerprint(n)):null;
    if(expected){const removed=new Set((s.removedContacts||[]).map(x=>x.id));result.contacts.expected=expected.length;result.contacts.intentionallyRemoved=expected.filter(k=>removed.has(k)).length;result.contacts.missing=expected.filter(k=>!removed.has(k)&&!s.contacts.some(c=>c.id===k)).length;}
    let names=null;try{names=await eng.bridge.wbNames();}catch{}
    reviewAssert(eng,snap);
    for(const [k,cfg] of [["workshop",s.bookSync],["memory",s.memoryBook]])result.books[k]={linked:cfg.linked,bound:cfg.bound,exists:cfg.linked?(names?names.includes(cfg.name):"unknown"):null,autoSync:cfg.autoSync};
    const app=eng.win?.__TSUKIYO_PHONE__||eng.win?.__TSUKIYO_PHONE_DEMO__;
    result.instance={activeVersion:app?.version||VERSION,loadedVersions:app?.loadedVersions||[VERSION],extensionAndCard:!!(app?.native&&app?.cardSources?.size),cardSources:app?.cardSources?.size||0};
    return result;
  }
  async function safetyAction(ui,action,value) {
    const eng=ui.engine,snap=eng.bridge.capture(),check=()=>reviewAssert(eng,snap);
    if(action==="safe-sync"||action==="safe-conflicts") {
      const p=await safetyPreview(eng.bookStudio);check();
      const rows=safetyPreviewRows(p,eng.bookStudio.cfg);
      if(action==="safe-conflicts") {
        const conflicts=rows.filter(r=>r.kind==="conflictKeys");
        if(!conflicts.length){ui.notify("没有待处理的工坊冲突");return;}
        const picked=await reviewPick(ui,"选择一个冲突条目",conflicts,{submit:"处理所选",note:"每次处理一条；可使用手机、使用世界书、手动合并或取消跳过。双方原文先备份到回收站。"});
        if(!picked?.length)return;assert(picked.length===1,"请一次选择一条冲突");
        const key=picked[0].key,r=p.records.find(r=>r.key===key),supported=!["soul","tasks"].includes(r.src);
        const decision=await ui.dialog("冲突处理",`<pre style="white-space:pre-wrap">${e(picked[0].content)}</pre>`+hint(r.src==="persona"?"世界书/合并内容保存为人物参考资料，不替换人物原始简介。":"取消即暂时跳过，不改双方。"),{choices:[["local","使用手机版本","danger"],...(supported?[["remote","使用世界书版本"],["merge","手动合并"]]:[]),["cancel","暂时跳过"]]});
        check();if(!decision||decision.choice==="cancel")return;
        let merged="";
        if(decision.choice==="merge"){const form=await ui.dialog("手动合并",field("合并后世界书正文","content",r.content,{textarea:true,max:8000,required:true})+hint("此正文会写入世界书，并按该来源的回读规则更新手机。"));check();if(!form)return;merged=form.content;}
        if(!await ui.confirm("确认处理这一条冲突？","将先保存双方备份，再写入所选结果；手机与远端不是原子事务。失败时核对双方再重试。","确认处理"))return;
        check();await safetyResolve(eng.bookStudio,p,key,decision.choice,merged);ui.notify("已处理；其他冲突保持不变");ui.render();return;
      }
      const selectable=rows.filter(r=>r.kind!=="conflictKeys"&&!r.unsupported);
      const summary=`新增 ${p.plan.create.length} · 修改 ${p.plan.update.length} · 待取回 ${p.plan.pull.length} · 删除 ${p.plan.deleteWB.length} · 冲突 ${p.plan.conflicts}。冲突与不支持回灌项不执行。自动同步不会逐次弹确认；如需逐条审批，请先关闭自动同步。`;
      const picked=await reviewPick(ui,"工坊同步变更预览",rows,{submit:"确认选择",note:summary});if(!picked?.length)return;
      const valid=new Set(selectable.map(r=>r.key)),keys=picked.map(r=>r.key).filter(k=>valid.has(k));
      assert(keys.length,"选中项均为冲突或不可回灌项，请使用冲突处理入口");
      if(!await ui.confirm("只执行选中的 "+keys.length+" 项？","未选变更本次不执行；后续自动同步仍可能执行。包含删除时请特别核对。","执行所选"))return;
      check();await eng.bookStudio.sync({reason:"preview",force:true,acceptMassDelete:true,selection:{...p,keys}});ui.notify("选中变更已执行；未选项留待后续同步");ui.render();return;
    }
    if(action==="safe-import-scope") {
      const mb=eng.memoryBook;assert(mb.cfg?.linked&&!mb.running,"请先连接记忆世界书，等待同步结束");
      const p={snap,book:mb.cfg.name,inputSig:fingerprint([ui.data.memoryBook,ui.data.memories])};
      const entries=await eng.bridge.wbRead(p.book);check();p.remoteSig=fingerprint(entries);
      const rows=entries.filter(r=>!bookStampOf(r)&&(r.uid??r.id)!==undefined).map((r,i)=>({key:String(i),uid:r.uid??r.id,name:r.name||r.comment||"未命名",content:r.content||""}));
      const cfg=mb.cfg,ids=cfg.selectionBook===p.book?cfg.importUids:null;
      const picked=await reviewPick(ui,"管理记忆导入范围",rows,{checked:rows.filter(r=>!Array.isArray(ids)||ids.includes(r.uid)).map(r=>r.key),submit:"保存范围",note:"勾选控制新条目的导入；取消勾选不删除记忆，也不解除已有绑定。保存后可点立即同步；自动同步开启时后续也会读取新范围。"});
      if(picked===null)return;check();await safetyImportScope(eng,p,picked.map(r=>r.uid));ui.notify("导入范围已保存，无需停止或重连世界书");ui.render();return;
    }
    if(action==="safe-recycle-import") {
      const before=fingerprint(ui.data.recycle||[]),file=await ui.pickFile(".json,application/json",4*1024*1024);check();if(!file)return;
      const raw=JSON.parse(await file.text());check();const draft={recycle:clone(ui.data.recycle||[])};recycleImport(draft,raw);
      if(!await ui.confirm("导入回收站备份？","仅合入回收站，不自动恢复、不写世界书。重复的备份内容会跳过；导入后可逐项预览再恢复。","导入"))return;
      check();await eng.repo.mutate(s=>{assert(before===fingerprint(s.recycle||[]),"回收站已变化，请刷新");recycleImport(s,raw);},{snapshot:snap,guard:()=>{check();return true;},label:"导入回收站备份"});ui.notify("已导入回收站，请预览后选择恢复");ui.render();return;
    }
    if(action==="safe-recycle") {
      const before=fingerprint(ui.data.recycle||[]);
      const rows=(ui.data.recycle||[]).map(r=>({key:r.id,name:({memory:"记忆",soul:"灵魂档案",conflict:"冲突备份"}[r.kind])+" · "+r.name,note:new Date(r.at).toLocaleString(),content:JSON.stringify(r.payload,null,2)}));
      const picked=await reviewPick(ui,"本聊天回收站",rows,{submit:"选择操作",note:"最多60条且JSON正文总计50万字符；满时阻止新的删除/冲突处理，不静默淘汰。记忆恢复为本地副本，灵魂恢复后排除工坊写出；冲突备份仅查看/导出。"});
      if(!picked?.length)return;
      const decision=await ui.dialog("回收站操作",hint("恢复不会覆盖同名档案；永久删除不可撤销。导出文件包含选中的原文，请妥善保管。"),{choices:[["restore","仅恢复到本地","primary"],["export","导出所选"],["purge","永久删除所选","danger"],["cancel","取消"]]});
      check();if(!decision||decision.choice==="cancel")return;
      const ids=picked.map(r=>r.key);
      if(decision.choice==="export"){download(ui,"小手机回收站备份.json",{app:"tsukiyo-phone",kind:"recycle",version:VERSION,records:(ui.data.recycle||[]).filter(r=>ids.includes(r.id))});return;}
      if(!await ui.confirm(decision.choice==="purge"?"永久删除所选备份？":"仅恢复到本地？",decision.choice==="purge"?"不可撤销，请先导出重要内容。":"记忆恢复成新ID本地副本；取消原记忆尚未执行的删除队列。灵魂档案恢复后暂停写出，不恢复推演历史。","确认"))return;
      check();await eng.repo.mutate(s=>{assert(before===fingerprint(s.recycle||[]),"回收站已变化，请刷新");if(decision.choice==="restore")recycleRestore(s,ids);else s.recycle=(s.recycle||[]).filter(r=>!ids.includes(r.id));},{snapshot:snap,guard:()=>{check();return true;},label:"回收站操作"});ui.render();return;
    }
    if(action==="safe-memory-publish") {
      const m=ui.data.memories.find(r=>r.id===value);assert(m?.localOnly,"此条不是本地恢复副本");const sig=fingerprint(m);
      if(!await ui.confirm("允许此记忆写入世界书？","恢复副本使用新ID；若旧远端条目还在，可能形成两条，请先核对。","允许写出"))return;
      check();await eng.repo.mutate(s=>{const row=s.memories.find(r=>r.id===value);assert(fingerprint(row)===sig,"记忆已变化");delete row.localOnly;},{snapshot:snap,guard:()=>{check();return true;},label:"允许恢复记忆写出"});eng.memoryBook.notePhoneChange();ui.render();return;
    }
    if(action==="safe-diagnostics") {
      const report=await safetyDiagnostics(eng);check();
      const result=await ui.dialog("升级与兼容性自检",hint("只检查当前可见接口和活动实例，不能穷举未加载的旧脚本；多楼层复用不等于多个实例。此报告不含密钥、API地址、聊天原文或世界书正文。")+`<pre style="white-space:pre-wrap">${e(JSON.stringify(report,null,2))}</pre>`,{choices:[["export","导出诊断"],["close","关闭"]]});
      check();if(result?.choice==="export")download(ui,"小手机脱敏诊断.json",report);return;
    }
  }
