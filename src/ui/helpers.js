  // src/ui/helpers.js
  var e = escapeHtml;
  function button(label, action, id2 = "", kind = "") {
    return `<button type="button" class="btn ${kind}" data-action="${e(action)}"${id2 !== "" ? ` data-id="${e(id2)}"` : ""}>${label}</button>`;
  }
  var tag = (value, kind = "") => `<span class="tag ${kind}">${e(value)}</span>`;
  var empty = (title, copy = "", name = "moon") => `<div class="empty"><span class="empty-icon">${icon(name, 26)}</span><h3>${e(title)}</h3><p>${e(copy)}</p></div>`;
  function avatar(contact, size = "") {
    if (!contact) return `<span class="avatar user ${size}">${icon("moon", 18)}</span>`;
    return `<span class="avatar ${e(contact.color || "sage")} ${size}">${contact.avatar ? `<img data-media="${e(contact.avatar)}" alt="${e(contact.name)}">` : e(contact.name.slice(-2))}</span>`;
  }
  var contactName = (s, id2) => id2 === "user" ? "我" : s.contacts.find((c) => c.id === id2)?.name || "未知联系人";
  var hint = (s, warning = false) => `<div class="hint ${warning ? "warning" : ""}">${e(s)}</div>`;
  var field = (label, name, value = "", { type = "text", placeholder = "", required = false, textarea = false, max = 3e3 } = {}) => type === "date" || type === "time" ? `<label class="form-field"><span>${e(label)}</span><span style="display:flex;gap:6px;align-items:center"><input class="field" name="${e(name)}" type="text" inputmode="${type === "date" ? "numeric" : "numeric"}" data-kind="${type}" value="${e(value)}" placeholder="${e(placeholder || (type === "date" ? "YYYY-MM-DD，可直接输入，如 2019-03-25" : "HH:MM，可直接输入，如 16:00"))}" maxlength="${type === "date" ? 32 : 16}" ${required ? "required" : ""} autocomplete="off" style="flex:1;min-width:0"><input type="${type}" tabindex="-1" aria-label="选择器" title="用选择器填入" style="width:34px;min-width:34px;padding:0 4px;height:38px;border-radius:10px;border:1px solid rgba(0,0,0,.12);background:transparent;opacity:.75" oninput="var t=this.previousElementSibling;if(t&&this.value){t.value=this.value;t.dispatchEvent(new Event('input',{bubbles:true}))}"></span></label>` : `<label class="form-field"><span>${e(label)}</span>${textarea ? `<textarea class="field" name="${e(name)}" maxlength="${max}" placeholder="${e(placeholder)}" ${required ? "required" : ""}>${e(value)}</textarea>` : `<input class="field" name="${e(name)}" type="${e(type)}" ${type === "number" ? 'step="any"' : ""} value="${e(value)}" placeholder="${e(placeholder)}" maxlength="${max}" ${required ? "required" : ""} autocomplete="${type === "password" ? "new-password" : "off"}">`}</label>`;
  var select = (label, name, choices, value) => `<label class="form-field"><span>${e(label)}</span><select class="field" name="${e(name)}">${choices.map(([v, label2]) => `<option value="${e(v)}" ${v === value ? "selected" : ""}>${e(label2)}</option>`).join("")}</select></label>`;
  var checkbox = (label, name, checked = false) => `<label class="checkbox-label"><input type="checkbox" name="${e(name)}" ${checked ? "checked" : ""}><span>${e(label)}</span></label>`;
  var switchRow = (title, copy, action, on, id2 = "") => `<div class="switch-row"><div><b>${e(title)}</b>${copy ? `<small>${e(copy)}</small>` : ""}</div><button type="button" class="switch ${on ? "on" : ""}" data-action="${e(action)}" data-id="${e(id2)}" role="switch" aria-checked="${!!on}" aria-label="${e(title)}"></button></div>`;
  var settingLink = (label, action, ic = "settings", note = "", id2 = "") => `<button class="setting-link" data-action="${e(action)}" data-id="${e(id2)}">${icon(ic)}<span>${e(label)}</span><small>${e(note)}</small>${icon("arrow")}</button>`;
  var section = (label, html) => `<div class="section-label">${e(label)}</div>${html}`;
  var time = niceTime;

