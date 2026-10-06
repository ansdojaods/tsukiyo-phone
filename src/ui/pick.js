  // src/ui/pick.js
  function peopleChecks(items, { name = "members", checked = [], disabled = /* @__PURE__ */ new Set() } = {}) {
    const on = new Set(checked);
    return `<div class="checks pick-list">${items.map((c) => `<label class="checkbox-label filter-row" data-text="${e([c.name, c.hint || "", c.note || ""].join(" "))}"><input type="checkbox" name="${e(name)}" value="${e(c.id)}" ${on.has(c.id) ? "checked" : ""} ${disabled.has(c.id) ? "disabled" : ""}><span>${e(c.name)}${c.note ? `<small class="pick-note">${e(c.note)}</small>` : ""}</span></label>`).join("")}</div>`;
  }
  function pickTools(presentIds2 = [], presentLabel = "在场的人") {
    return `<div class="pick-tools">${button("全选", "pick-all")}${button("清空", "pick-none")}${presentIds2.length ? `<button type="button" class="btn" data-action="pick-present" data-id="${e(presentIds2.join(","))}">${e(presentLabel)}</button>` : ""}</div>`;
  }
  var filterBox = (placeholder = "搜索…") => `<input class="field pick-filter" data-filter="1" type="search" placeholder="${e(placeholder)}" aria-label="${e(placeholder)}" autocomplete="off">`;
  async function askPeople(ui, { title, autoLabel = "根据正文自动", pool, present = [], note = "", allowAuto = true, submit = "生成" }) {
    const modes = [...allowAuto ? [["auto", autoLabel]] : [], ["pick", "指定角色（勾选下方，可多选）"], ["random", "随机抽取角色"]];
    const r = await ui.dialog(title, `${note ? hint(note) : ""}${select("方式", "mode", modes, allowAuto ? "auto" : "pick")}${field("随机人数（随机方式时生效）", "count", 3, { type: "number" })}<div class="section-label">指定角色</div>${pickTools(present)}${filterBox("搜索姓名…")}${peopleChecks(pool, {})}`, { submit });
    if (!r) return null;
    return { mode: r.mode, count: Number(r.count) || 3, members: r.members || [] };
  }

