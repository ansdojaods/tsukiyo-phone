  // v2.9.3 — explicit previews, scoped bulk removal, existing-book selection.
  function reviewAssert(eng, snap) {
    assert(snap && eng.bridge.same(snap), "聊天或分支已变化，请重新打开预览");
    const now = eng.bridge.capture();
    assert(now.owner === snap.owner && (snap.signature === undefined || now.signature === snap.signature), "正文已变化，旧操作未提交");
  }
  function reviewBookSig(rows) { return fingerprint(rows.filter(bookStampOf).map(r => [bookStampOf(r).key, bookStampOf(r).kind, bookStampOf(r).hash, r.name, r.content, r.enabled !== false, r.strategy || {}])); }
  function reviewSoulDelete(s, names) {
    const v = soulData(s), chosen = new Set(names);
    for (const name of chosen) delete v.roster[name];
    v.last.actors = (v.last.actors || []).filter(n => !chosen.has(n));
    v.history = (v.history || []).map(h => ({ ...h, actors: (h.actors || []).filter(a => !chosen.has(a.name)) }));
    v.stats.entries = Object.values(v.roster).reduce((n, row) => n + soulEntryCount(row), 0);
  }
  async function reviewPick(ui, title, rows, { submit = "确认选择", note = "", checked = [] } = {}) {
    const snap = ui.engine.bridge.capture(), selected = new Set(checked);
    let page = 0;
    while (true) {
      const slice = rows.slice(page * 20, page * 20 + 20);
      const body = hint(note) + `<p>共 ${rows.length} 条 · 第 ${page + 1}/${Math.max(1, Math.ceil(rows.length / 20))} 页 · 已选 ${selected.size} 条</p>` + pickTools() + filterBox("筛选本页条目…") + `<div class="pick-list">` + slice.map(r => `<div class="filter-row" data-text="${e(r.name)}"><label class="checkbox-label"><input type="checkbox" name="members" value="${e(r.key)}" ${selected.has(r.key) ? "checked" : ""}><span>${e(r.name)}${r.note ? `<small>${e(r.note)}</small>` : ""}</span></label><details class="details"><summary>展开完整条目预览</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${e(r.content || "（空条目）")}</pre></details></div>`).join("") + `</div>`;
      const result = await ui.dialog(title, `<form data-form="modal" data-review-picker="1">${body}</form>`, { choices: [["apply", submit, "primary"], ...(page > 0 ? [["prev", "上一页", ""]] : []), ...((page + 1) * 20 < rows.length ? [["next", "下一页", ""]] : []), ["cancel", "取消", ""]] });
      reviewAssert(ui.engine, snap);
      if (!result || result.choice === "cancel") return null;
      const valid = new Set(slice.map(r => r.key));
      for (const r of slice) selected.delete(r.key);
      for (const key of result.members || []) if (valid.has(key)) selected.add(key);
      if (result.choice === "next") { page++; continue; }
      if (result.choice === "prev") { page--; continue; }
      return rows.filter(r => selected.has(r.key));
    }
  }
  BookStudio.prototype.removeSelected = async function(keys, { snapshot, remoteSig } = {}) {
    assert(!this.running, "工坊正在同步，请稍后重试");
    const snap = snapshot || this.bridge.capture(), cfg = this.cfg, book = cfg.name, chosen = new Set(keys);
    assert(chosen.size && chosen.size <= 2000 && [...chosen].every(k => typeof k === "string" && k.length <= 200), "请选择有效条目");
    reviewAssert(this.eng, snap);
    this.running = true;
    try {
      if (cfg.linked) {
        const current = await this.bridge.wbRead(book); reviewAssert(this.eng, snap);
        assert(remoteSig === undefined || reviewBookSig(current) === remoteSig, "世界书在预览后发生变化，请重新核对");
      }
      await this.eng.repo.mutate(s => {
        assert(s.bookSync.name === book, "连接的世界书已变化");
        const list = [...new Set([...(s.bookSync.excludedKeys || []), ...chosen])];
        assert(list.length <= 2000, "排除清单已达2000条，请先整理");
        s.bookSync.excludedKeys = list;
      }, { snapshot: snap, guard: () => { reviewAssert(this.eng, snap); return true; }, label: "批量移除工坊同步条目（保留手机原始数据）" });
      let removed = 0;
      if (cfg.linked) await this.bridge.wbUpdate(book, fresh => {
        reviewAssert(this.eng, snap); assert(this.cfg.name === book, "世界书连接已变化");
        assert(remoteSig === undefined || reviewBookSig(fresh) === remoteSig, "世界书被并行修改，已保留排除标记；请刷新后重试删除");
        return fresh.filter(row => { const st = bookStampOf(row); const drop = st && chosen.has(String(st.key)); if (drop) removed++; return !drop; });
      });
      this.lastHash = ""; return { removed, excluded: chosen.size };
    } finally { this.running = false; this.eng.emit(); }
  };
  async function reviewAction(ui, action, value) {
    const eng = ui.engine, snap = eng.bridge.capture();
    const check = () => reviewAssert(eng, snap);
    if (action === "review-soul-open") { ui.go("soulChar", value); return; }
    if (action === "review-soul-delete" || action === "soul-char-del") {
      const before = fingerprint(soulData(ui.data).roster);
      const rows = Object.values(soulData(ui.data).roster).filter(r => action !== "soul-char-del" || r.name === value).map(r => ({ key: r.name, name: r.name, content: soulRender(soulData(ui.data), r.name) }));
      const picked = await reviewPick(ui, "批量删除灵魂链接角色", rows, { submit: "删除选中档案", checked: action === "soul-char-del" ? [value] : [], note: "只删除手机灵魂档案及其推演历史，不删通讯录或记忆。若工坊启用灵魂档案同步，后续同步也会移除已纳入当前同步的对应工坊条目（大量移除需确认）。" });
      if (!picked?.length) return;
      if (!await ui.confirm("确认删除 " + picked.length + " 位角色的灵魂档案？", "档案正文可从本聊天回收站恢复，推演历史不恢复；回收站满时会阻止删除。建议先导出名单。", "删除")) return;
      check();
      await eng.repo.mutate(s => { assert(fingerprint(soulData(s).roster) === before, "档案在预览后变化，请重新选择"); reviewSoulDelete(s, picked.map(r => r.key)); }, { snapshot: snap, label: "批量删除灵魂档案" });
      eng.soul.clearRoleplay(); eng.bookStudio.notePhoneChange(); ui.go("soul"); return;
    }
    if (["review-book-manage", "review-book-restore"].includes(action)) {
      const bs = eng.bookStudio, restore = action === "review-book-restore";
      const pick = await ui.dialog(restore ? "恢复已排除的工坊条目" : "预览与批量移除工坊条目", select("数据类型", "kind", [["all", "全部类型"], ...Object.entries(BOOK_SOURCES)], "all"), { submit: "查看条目" });
      check(); if (!pick) return;
      const stateSig = fingerprint([ui.data.bookSync, bs.recordsFor(ui.data, snap, { all: true })]);
      let remote = [];
      if (bs.cfg.linked) { remote = await eng.bridge.wbRead(bs.cfg.name); check(); }
      const records = bs.recordsFor(ui.data, snap, { all: true });
      const known = new Set(records.map(r => r.key));
      for (const r of remote) { const st = bookStampOf(r); if (st && !known.has(String(st.key))) { known.add(String(st.key)); records.push({ key: String(st.key), name: r.name || st.key, src: st.kind, content: r.content }); } }
      const excluded = new Set(bs.cfg.excludedKeys || []);
      const rows = records.filter(r => (pick.kind === "all" || r.src === pick.kind) && (!restore || excluded.has(r.key))).map(r => ({ ...r, note: excluded.has(r.key) ? "已排除，不会自动重建" : bs.cfg.sources[r.src] === false ? "此数据来源未启用" : "等待/参与同步" }));
      const selected = await reviewPick(ui, restore ? "选择要恢复同步的条目" : "条目预览 / 批量移除", rows, { submit: restore ? "恢复选中同步" : "移除选中条目", note: "可逐条展开正文；全选仅作用于当前页，翻页保留选择。移除仅删除本工坊写出的条目并阻止自动重建，不删除联系人、日记等手机原始数据，也不动第三方条目。" });
      if (!selected?.length) return;
      if (!await ui.confirm(restore ? "恢复同步？" : "移除 " + selected.length + " 个工坊条目？", restore ? "下次同步可重新写入；对应来源需保持开启。" : "保留手机原数据；远端删除失败时仍保留排除标记，可刷新后重试。", "确认")) return;
      check(); assert(stateSig === fingerprint([ui.data.bookSync, bs.recordsFor(ui.data, snap, { all: true })]), "手机条目在预览后变化，请重新核对");
      if (restore) {
        const keys = new Set(selected.map(r => r.key));
        await eng.repo.mutate(s => { s.bookSync.excludedKeys = (s.bookSync.excludedKeys || []).filter(k => !keys.has(k)); }, { snapshot: snap, label: "恢复工坊条目同步" });
        bs.notePhoneChange();
      } else await bs.removeSelected(selected.map(r => r.key), { snapshot: snap, remoteSig: reviewBookSig(remote) });
      ui.render(); return;
    }
    if (action === "review-memory-manage") {
      const before = fingerprint([ui.data.memories, ui.data.memoryBook]);
      const rows = ui.data.memories.filter(notBaibai).map(m => ({key:m.id, name:memoryTitle(m), content:m.text, note:m.wb ? "已关联世界书" : "手机本地记忆"}));
      const picked = await reviewPick(ui, "记忆条目预览 / 批量删除", rows, {submit:"删除所选记忆", checked:value === "all" ? rows.map(r=>r.key) : [], note:"这里会删除手机记忆本身；已连接的对应记忆世界书条目将在同步时删除。工坊条目、柏宝书镜像和第三方书本体不在此列表。请先备份。"});
      if (!picked?.length || !await ui.confirm("确认删除 " + picked.length + " 条记忆？", "不同于工坊的排除写出，此操作会删除手机中的所选记忆；已关联的远端条目将在同步时删除。", "删除")) return;
      const guard = () => { check(); assert(before === fingerprint([eng.repo.data.memories, eng.repo.data.memoryBook]), "记忆或同步配置已变化，请重新选择"); return true; };
      await eng.repo.mutate(s => { for (const row of picked) eng.memoryBook.removeLinked(s, row.key); }, {snapshot:snap, guard, label:"预览后批量删除记忆"});
      eng.memoryBook.notePhoneChange(); ui.notify("已删除选中手机记忆；关联的远端条目将在同步时删除。"); ui.render(); return;
    }
    if (action === "review-memory-connect" || action === "review-book-connect") {
      const memory = action === "review-memory-connect", service = memory ? eng.memoryBook : eng.bookStudio;
      assert(service.supported(), "未检测到酒馆助手世界书接口");
      assert(!service.running && !service.cfg?.linked, "请先停止当前同步再更换世界书");
      const names = await eng.bridge.wbNames(); check(); assert(names.length, "当前没有世界书，可先创建一本");
      const preferred = value || (ui.data.bookSync?.linked ? ui.data.bookSync.name : names[0]);
      const result = await ui.dialog("读取已有世界书并同步", select("选择已有世界书", "name", names.map(n => [n, n]), names.includes(preferred) ? preferred : names[0]) + select("绑定范围", "scope", [["card", "当前角色卡"], ["chat", "仅当前聊天"]], "card") + hint(memory ? "可直接选择工坊已创建的书。工坊人物/灵魂/日记等条目仍由工坊管理，不会当成记忆重复导入。" : "先预览现有条目，再决定连接；其他来源的条目不会被工坊改写。"), { submit: "读取并预览" });
      check(); if (!result) return;
      const remote = await eng.bridge.wbRead(result.name); check();
      const rows = remote.filter(r => !memory || !bookStampOf(r)).filter(r => (r.uid ?? r.id) !== undefined).map((r, i) => ({ key: String(i), uid: r.uid ?? r.id, name: r.name || r.comment || "未命名条目", content: r.content || "" }));
      const selected = await reviewPick(ui, memory ? "选择要导入的记忆条目" : "现有世界书条目预览", rows, { submit: memory ? "连接并导入选中条目" : "确认连接", note: memory ? "只导入选中条目；其他条目保留原样，不删除；以后新增的未选条目也不会自动导入，可用“管理导入范围”追加勾选。工坊条目不在本记忆列表中，可到工坊预览。手机已有记忆会同步写入此书。" : "这里只预览，勾选不会删除或导入第三方条目。连接后将按当前来源设置写出手机数据。" });
      if (selected === null) return;
      check(); const fresh = await eng.bridge.wbRead(result.name); check(); assert(fingerprint(fresh) === fingerprint(remote), "世界书在预览后变化，请重新读取");
      await service.link({ name: result.name, scope: result.scope, acceptExisting: true, ...(memory ? { importUids: selected.map(r => r.uid) } : {}) });
      ui.notify("已连接已有世界书；未新建重复书。"); ui.render(); return;
    }
  }
