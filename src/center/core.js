  // src/center/core.js — v2.5.1 planning/event links and evidence receipts.
  function centerFresh() { return { version:1, focus:null, completions:[], receipts:[] }; }
  function centerData(s) { return studioData(s).center || centerFresh(); }
  function centerEnsure(s) { return (s.studio ||= studioFresh()).center ||= centerFresh(); }
  function centerKey(ref) { return ref ? ref.kind+":"+ref.id : ""; }
  function centerTargets(s) {
    const a=s.arc, result=[];
    if(!a)return result;
    a.outline.beats.forEach((b,i)=>result.push({kind:"beat",id:b.id,title:b.title,detail:b.scene,index:i,current:i===a.outline.cursor,done:false,sig:fingerprint([b.id,b.title,b.scene,b.time,b.type,b.line,b.result,b.subtext,b.think])}));
    a.lines.items.forEach(l=>result.push({kind:"line",id:l.id,title:l.name,detail:[l.desc,l.next].filter(Boolean).join("\n"),done:arcTerminal(l),sig:fingerprint([l.id,l.name,l.stage,l.anchor,l.agency,l.stall,l.desc,l.next,l.pin])}));
    for(const p of [...a.points.days.flatMap(d=>d.events.map(x=>({...x,date:d.date||x.date}))),...a.points.future,...a.points.past]) {
      if(result.some(r=>r.kind==="point"&&r.id===p.id))continue;
      result.push({kind:"point",id:p.id,title:p.title,detail:[p.date,p.time,p.place,p.desc].filter(Boolean).join(" · "),done:p.done===true,sig:fingerprint([p.id,p.title,p.desc,p.date,p.time,p.place,p.type,p.thread,p.pin,p.done,p.missed])});
    }
    return result;
  }
  function centerRef(s,key) { const r=centerTargets(s).find(r=>centerKey(r)===key);return r?{kind:r.kind,id:r.id,title:r.title,sig:r.sig}:null; }
  function centerResolve(s,ref) { return ref && centerTargets(s).find(t=>centerKey(t)===centerKey(ref)&&t.sig===ref.sig); }
  function centerLinkValid(s,event) { return !event?.centerRef || !!centerResolve(s,event.centerRef); }
  function centerDirector(s,snap,settings) { return s.settings.inject && settings.isEnabled("director") && studioDirectorOn(s,snap); }
  function centerValidate(st) {
    const c=st.center;if(c===undefined)return;
    assert(c&&c.version===1&&Array.isArray(c.completions)&&c.completions.length<=80&&Array.isArray(c.receipts)&&c.receipts.length<=80,"剧情中心审阅记录格式或数量错误");
    const ref=r=>{if(!r)return;assert(["beat","line","point"].includes(r.kind)&&typeof r.id==="string"&&r.id.length<=100&&typeof r.sig==="string"&&typeof r.title==="string","规划关联无效");};
    ref(c.focus);for(const ev of [...st.pool,...st.active?[st.active.event]:[]])ref(ev.centerRef);
    for(const row of c.completions){assert(typeof row.id==="string"&&typeof row.eventId==="string"&&typeof row.quote==="string"&&row.quote.length<=1000&&["pending","unlinked","applied","dismissed","reverted","conflict"].includes(row.status)&&Number.isInteger(row.floor)&&typeof row.prefix==="string","事件核实记录无效");ref(row.ref);}
    for(const r of c.receipts){assert(typeof r.id==="string"&&typeof r.completionId==="string"&&["applied","reverted","conflict"].includes(r.status)&&Number.isInteger(r.floor)&&typeof r.prefix==="string","回写收据无效");ref(r.ref);}
    assert(new Set(c.completions.map(r=>r.id)).size===c.completions.length&&new Set(c.receipts.map(r=>r.id)).size===c.receipts.length,"剧情中心编号重复");
    for(const r of c.receipts){
      assert(r.ref&&r.before&&r.after&&typeof r.afterTargetSig==="string"&&typeof r.quote==="string"&&r.quote.length<=1000&&Number.isFinite(r.at)&&r.floor>=0&&c.completions.some(x=>x.id===r.completionId),"回写收据内容缺失");
      const fields={beat:["cursor"],line:["stage","terminal","next","updated"],point:["done","missed"]}[r.ref.kind];
      for(const shape of [r.before,r.after]){
        assert(Object.keys(shape).length===fields.length&&Object.keys(shape).every(k=>fields.includes(k)),"回写字段越界");
        if(r.ref.kind==="beat")assert(Number.isInteger(shape.cursor)&&shape.cursor>=0&&shape.cursor<ARC_LIMIT.beats&&typeof r.outlineSig==="string","大纲回写无效");
        if(r.ref.kind==="line")assert(ARC_STAGES.includes(shape.stage)&&typeof shape.terminal==="boolean"&&typeof shape.next==="string"&&shape.next.length<=300&&Number.isInteger(shape.updated),"事件线回写无效");
        if(r.ref.kind==="point")assert(typeof shape.done==="boolean"&&typeof shape.missed==="boolean","日程回写无效");
      }
    }
  }
  function centerBind(s,event,ref) {
    assert(centerResolve(s,ref),"规划节点已修改或删除，请重新选择关联");
    assert(event.status==="candidate","只能给尚未执行的候选关联规划");
    event.centerRef=clone(ref);
  }
  function centerAssignSources(s,rows,request) {
    if(!request.centerRef)return;
    for(const row of rows)centerBind(s,row,request.centerRef);
  }
  function centerAdvance(s,snap,quote) {
    const st=s.studio ||= studioFresh(),a=st.active,c=centerEnsure(s);
    assert(a&&studioValid(a,snap)&&centerLinkValid(s,a.event),"当前事件或规划关联已失效");
    quote=studioText(quote,1000);
    const proof=snap.history.filter(m=>m.role==="assistant"&&m.floor>a.floor&&m.text.includes(quote)).at(-1);
    assert(quote.length>=4&&proof,"请引用本阶段开始后新角色正文中的连续原句，至少4字符");
    const stamp={floor:proof.floor,prefix:avsPrefix(snap,proof.floor)};
    a.proofs=[...(a.proofs||[]),{stage:a.index,quote,...stamp}].slice(-6);
    studioLog(st,"核实事件阶段："+quote);
    if(a.index+1<a.event.stages.length){a.index++;Object.assign(a,studioStamp(snap));return {completed:false};}
    assert(c.completions.length<80,"核实记录已达80条，请先导出并清理已处理记录");
    const ev=st.pool.find(r=>r.id===a.event.id);if(ev)ev.status="completed";
    const record={id:id("confirmed"),eventId:a.event.id,title:a.event.title,quote,ref:a.event.centerRef?clone(a.event.centerRef):null,status:a.event.centerRef?"pending":"unlinked",proofs:clone(a.proofs),...stamp};
    c.completions.push(record);st.active=null;return {completed:true,record};
  }
  function centerPoint(s,id2) { return [...s.arc.points.days.flatMap(d=>d.events),...s.arc.points.future,...s.arc.points.past].find(p=>p.id===id2); }
  function centerWriteback(s,snap,completionId) {
    const c=centerEnsure(s),done=c.completions.find(r=>r.id===completionId);
    assert(done&&done.status==="pending"&&studioValid(done,snap),"记录已经处理或来源分支失效，不重复回写");
    const target=centerResolve(s,done.ref);assert(target&&!target.done,"原规划已修改、删除或完成；没有覆盖新的规划");
    assert(c.receipts.length<80,"回写收据已达80条，请先清理已失效收据");
    assert(!c.receipts.some(r=>r.status==="applied"&&centerKey(r.ref)===centerKey(done.ref)&&r.ref.sig===done.ref.sig&&studioValid(r,snap)),"同一版本的规划节点已经回写，不重复推进");
    const receipt={id:id("receipt"),completionId:done.id,ref:clone(done.ref),quote:done.quote,status:"applied",at:Date.now(),floor:done.floor,prefix:done.prefix,before:null,after:null,final:false};
    if(target.kind==="beat"){
      const o=s.arc.outline;assert(o.cursor===target.index,"只可推进当前大纲节点，不能跳过前面的节点");
      receipt.before={cursor:o.cursor};receipt.after={cursor:Math.min(o.cursor+1,o.beats.length-1)};receipt.final=receipt.before.cursor===receipt.after.cursor;
      receipt.outlineSig=fingerprint(o.beats);
      o.history.push({from:receipt.before.cursor,to:receipt.after.cursor,floor:done.floor,sig:"",quote:done.quote.slice(0,200),by:"manual",at:receipt.at});o.history=o.history.slice(-ARC_LIMIT.history);o.cursor=receipt.after.cursor;o.updatedAt=Date.now();
    }else if(target.kind==="line"){
      const l=s.arc.lines.items.find(r=>r.id===target.id);receipt.before={stage:l.stage,terminal:l.terminal,next:l.next,updated:l.updated};receipt.after={stage:"收束",terminal:true,next:"",updated:done.floor};Object.assign(l,receipt.after);
    }else{
      const p=centerPoint(s,target.id);receipt.before={done:p.done,missed:p.missed};receipt.after={done:true,missed:false};Object.assign(p,receipt.after);
    }
    // A receipt records the exact post-write target fingerprint; rollback never overwrites later edits.
    receipt.afterTargetSig=centerTargets(s).find(r=>centerKey(r)===centerKey(done.ref))?.sig||"";
    done.status="applied";c.receipts.push(receipt);studioLog(s.studio,"已核准回写原规划："+done.ref.title);return receipt;
  }
  function centerReconcile(s,snap) {
    const c=centerEnsure(s);let changed=false;
    for(const r of [...c.receipts].reverse()){
      if(r.status!=="applied"||studioValid(r,snap))continue;
      const t=centerTargets(s).find(t=>centerKey(t)===centerKey(r.ref)),done=c.completions.find(x=>x.id===r.completionId);
      let clean=!!t&&t.sig===r.afterTargetSig;
      if(r.ref.kind==="beat"){
        const o=s.arc.outline,h=o.history.find(h=>h.at===r.at&&h.quote===r.quote.slice(0,200)&&h.from===r.before.cursor&&h.to===r.after.cursor);
        clean=clean&&o.cursor===r.after.cursor&&!!h&&r.outlineSig===fingerprint(o.beats);
        if(clean){o.cursor=r.before.cursor;o.history=o.history.filter(x=>x!==h);o.updatedAt=Date.now();}
      }else if(r.ref.kind==="line"){
        const l=s.arc.lines.items.find(x=>x.id===r.ref.id);
        clean=clean&&!!l&&Object.entries(r.after).every(([k,v])=>l[k]===v);if(clean)Object.assign(l,r.before);
      }else{
        const p=centerPoint(s,r.ref.id);clean=clean&&!!p&&p.done===r.after.done&&p.missed===r.after.missed;if(clean)Object.assign(p,r.before);
      }
      r.status=clean?"reverted":"conflict";if(done)done.status=r.status;changed=true;
      studioLog(s.studio,(clean?"来源正文变化，撤回本中心的进度回写：":"来源变化且规划有后续编辑，保留现状等待核对：")+r.ref.title);
    }
    return changed;
  }
  function centerNeedsReconcile(s,snap) { return centerData(s).receipts.some(r=>r.status==="applied"&&!studioValid(r,snap)); }
  function centerReadView(s,snap) { if(!centerNeedsReconcile(s,snap))return s;const copy=clone(s);centerReconcile(copy,snap);return copy; }
  function centerProtected(s,snap,settings) {
    if(!centerDirector(s,snap,settings))return null;
    const ref=studioData(s).active.event.centerRef;return ref&&centerResolve(s,ref)?ref:null;
  }
  function centerLockToken(s,snap,settings) {
    const a=studioData(s).active;
    return fingerprint([centerDirector(s,snap,settings),a?.event.id,a?.index,a?.event.centerRef,centerData(s).receipts.filter(r=>r.status==="conflict").map(r=>r.id)]);
  }
  function centerProjectionPhone(s,snap,settings) { return studioBasePhone(centerReadView(s,snap),snap,settings); }
  function centerArcPrompts(s,snap,settings) {
    s=centerReadView(s,snap);const active=centerDirector(s,snap,settings),ref=centerProtected(s,snap,settings),copy=clone(s);
    const conflicts=centerData(s).receipts.filter(r=>r.status==="conflict").map(r=>r.ref);
    const exclude=[...ref?[ref]:[],...conflicts];
    copy.arc.lines.items=copy.arc.lines.items.filter(l=>!exclude.some(r=>r.kind==="line"&&r.id===l.id));
    for(const d of copy.arc.points.days)d.events=d.events.filter(p=>!exclude.some(r=>r.kind==="point"&&r.id===p.id));
    copy.arc.points.future=copy.arc.points.future.filter(p=>!exclude.some(r=>r.kind==="point"&&r.id===p.id));
    const out=compileArcInjection(copy,snap)||{};
    if(active&&s.settings.inject&&s.arc.auto.inject.outline){
      const b=s.arc.outline.beats[s.arc.outline.cursor];out.outline=b?"【长期方向背景】\n当前方向："+b.title+"\n仅保留长期方向；当前场景按事件导演的这一阶段推进，不跳往后续节点，不替玩家选择。":"";
    }
    if(conflicts.some(r=>r.kind==="beat"))out.outline="";
    return out;
  }
  function centerPreparePlanner(s,snap,method,settings) {
    assert(!centerNeedsReconcile(s,snap),"剧情中心正在核对分支回写，请稍后重试");
    const ref=centerProtected(s,snap,settings),copy=clone(s);
    assert(!(centerDirector(s,snap,settings)&&["arcOutline","arcJudge"].includes(method)),"当前场景由事件导演承接，暂不重建大纲或自动改游标；其他事件线与日程仍可更新");
    const locked=[...ref?[ref]:[],...centerData(s).receipts.filter(r=>r.status==="conflict").map(r=>r.ref)];
    if(locked.some(r=>r.kind==="beat")&&["arcOutline","arcJudge"].includes(method))throw Error("大纲回写有待核对冲突，请先在总览处理");
    for(const l of copy.arc.lines.items)if(locked.some(r=>r.kind==="line"&&r.id===l.id))l.pin=true;
    for(const p of [...copy.arc.points.days.flatMap(d=>d.events),...copy.arc.points.future])if(locked.some(r=>r.kind==="point"&&r.id===p.id))p.pin=true;
    return copy;
  }
  function centerPlannerApply(s,snap,method,settings,apply,args) {
    const ref=centerProtected(s,snap,settings),locked=[...ref?[ref]:[],...centerData(s).receipts.filter(r=>r.status==="conflict").map(r=>r.ref)];
    const lines=s.arc.lines.items.filter(l=>locked.some(r=>r.kind==="line"&&r.id===l.id)).map(clone);
    const points=[...s.arc.points.days.flatMap(d=>d.events.map(p=>({...p,date:d.date||p.date}))),...s.arc.points.future,...s.arc.points.past].filter(p=>locked.some(r=>r.kind==="point"&&r.id===p.id)).map(clone);
    const pastIds=new Set(s.arc.points.past.map(p=>p.id));
    // Demo/older hosts may omit the optional narrativeKey; keep writes JSON-safe.
    if(args[1]&&args[1].narrativeKey===undefined)args[1]={...args[1],narrativeKey:avsPrefix(snap,snap.floor)};
    const result=apply(s,...args);
    if(method==="arcLines")for(const old of lines){s.arc.lines.items=s.arc.lines.items.filter(l=>l.id!==old.id&&l.name!==old.name);s.arc.lines.items.push(old);}
    if(method==="arcPoints")for(const old of points){
      for(const d of s.arc.points.days)d.events=d.events.filter(p=>p.id!==old.id&&p.title!==old.title);
      s.arc.points.future=s.arc.points.future.filter(p=>p.id!==old.id&&p.title!==old.title);s.arc.points.past=s.arc.points.past.filter(p=>p.id!==old.id&&p.title!==old.title);
      const d=s.arc.points.days.find(d=>d.date===old.date);
      if(pastIds.has(old.id)){assert(s.arc.points.past.length<ARC_LIMIT.past,"历史日程已满，未覆盖关联节点");s.arc.points.past.push(old);}else if(d){assert(d.events.length<ARC_LIMIT.perDay,"需为已关联节点保留位置；本次日程未覆盖");d.events.push(old);}else{assert(s.arc.points.future.length<ARC_LIMIT.future,"未来日程已满，本次未覆盖关联节点");s.arc.points.future.push(old);}
    }
    return result;
  }
  var StoryCenter=class {
    constructor(eng){
      this.eng=eng;this.maintaining=false;this.disposed=false;
      const oldRequest=eng.studio.requestFor.bind(eng.studio);
      eng.studio.requestFor=(kind,s,snap)=>{
        const request=oldRequest(kind,s,snap),ref=centerData(s).focus;
        if(kind==="director"&&ref){const t=centerResolve(s,ref);assert(t&&!t.done,"选定规划已变化，请在长线规划重新选择或清除来源");request.centerRef=clone(ref);request.payload.sourcePlan={kind:t.kind,id:t.id,title:t.title,detail:t.detail};request.system+="\n所有候选都必须服务于给定sourcePlan，不新起一条替代长线。候选是不同演绎方式，尚未发生；不提前完成原节点。";}
        return request;
      };
      for(const name of ["arcOutline","arcJudge","arcLines","arcPoints"]){
        const original=eng.actions[name];
        eng.actions[name]=(...args)=>{
          const proxy=Object.create(eng.actions),lock=centerLockToken(eng.repo.data,eng.repo.snapshot,eng.settings);
          proxy.perform=(module,prepare,apply,opts={})=>eng.actions.perform(module,(s,snap)=>prepare(centerPreparePlanner(s,snap,name,eng.settings),snap),(s,v,snap,...rest)=>centerPlannerApply(s,snap,name,eng.settings,apply,[v,snap,...rest]),{...opts,sigOf:s=>fingerprint([s.arc,centerData(s),studioData(s).active,studioData(s).config.directorInject]),externalGuard:()=>!this.disposed&&(!opts.externalGuard||opts.externalGuard())&&lock===centerLockToken(eng.repo.data,eng.repo.snapshot,eng.settings)});
          return original.apply(proxy,args);
        };
      }
    }
    async maintain(){
      const e=this.eng;if(this.disposed||this.maintaining||e.bridge.isBusy()||!e.repo.data||!e.repo.snapshot)return;
      const snap=e.bridge.capture();if(e.repo.snapshot.owner!==snap.owner||e.repo.snapshot.signature!==snap.signature||!centerNeedsReconcile(e.repo.data,snap))return;
      this.maintaining=true;
      try{await e.repo.mutate(s=>centerReconcile(s,snap),{snapshot:snap,guard:()=>e.bridge.same(snap)&&e.bridge.capture().signature===snap.signature,label:"核对剧情中心进度回写"});}finally{this.maintaining=false;}
    }
    dispose(){this.disposed=true;}
  };

