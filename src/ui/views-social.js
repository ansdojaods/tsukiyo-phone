  // src/ui/views-social.js
  function messagesView(ui) {
    const s = ui.data;
    const rows = [...s.threads].sort((a, b) => (b.messages.at(-1)?.ts || b.createdAt) - (a.messages.at(-1)?.ts || a.createdAt));
    return `<div class="subnav"><button class="chip active" data-action="go" data-id="messages">全部消息</button><button class="chip" data-action="go" data-id="contacts">通讯录</button><button class="chip" data-action="go" data-id="outbox">待发 ${s.threads.reduce((n, t) => n + t.pending.length, 0)}</button></div><div class="inline-banner">${ui.engine.bridge.mode === "demo" ? "离线演示 · 角色消息为演示样例，不连接真实模型" : "来信、已读与约定会接入当前正文参考"}<button data-action="proactive">检查来信</button></div>${ rows.length ? `<div style="padding:8px 17px 0">${tpDeleteBar("threads", rows.length, "会话")}</div>` : "" }<div class="list">${rows.length ? rows.map((t) => {
      const c = s.contacts.find((c2) => c2.id === t.members[0]), last = t.messages.at(-1), unread = t.messages.filter((m) => m.role === "character" && !m.read).length;
      return `<button class="list-row" data-action="thread" data-id="${e(t.id)}">${t.kind === "group" ? `<span class="avatar blue">${icon("people", 22)}</span>` : avatar(c)}<div class="body"><div class="row-top"><b>${e(t.title)}</b><time>${last ? e(time(last.ts)) : ""}</time></div><p>${t.pending.length ? "[待发 " + t.pending.length + " 条] " : ""}${e(last?.text || "说点什么，或者等一封来信。")}</p></div>${unread ? `<span class="badge">${unread}</span>` : ""}</button>`;
    }).join("") : empty("消息，慢慢说", "去通讯录开启一个会话；启用后台后，角色也可以主动联系。", "chat")}</div><div class="pad">${button(icon("people", 15) + " 新建群聊", "new-group", "", "wide ghost")}</div>`;
  }
  function chatView(ui) {
    const s = ui.data, t = s.threads.find((t2) => t2.id === ui.route.id);
    if (!t) return empty("会话不在当前存档", "可能切换了聊天或分支，请返回消息列表。");
    const busy = ui.engine.runner.active?.module === "chat";
    return `<div class="chat-scroll"><div class="chat-meta">${t.kind === "group" ? e(t.members.map((n) => contactName(s, n)).join("、")) : "仅你和" + e(t.title) + "参与此会话"}</div>${t.messages.length ? tpDeleteBar("chat:" + t.id, t.messages.length, "消息") : ""}${t.historyMembersNote ? hint(t.historyMembersNote, true) : ""}${t.messages.map((m) => {
      const me = m.role === "user", c = s.contacts.find((c2) => c2.id === m.author);
      return `<div class="message ${me ? "me" : ""}">${avatar(me ? null : c, "small")}<div class="message-body">${!me && t.kind === "group" ? `<div class="message-name">${e(c?.name || "成员")}</div>` : ""}<div class="bubble">${m.mediaId ? `<img data-media="${e(m.mediaId)}" alt="手机图片附件">` : ""}${e(m.text)}</div><div class="bubble-tools"><span>${e(m.story || time(m.ts))}</span>${m.source === "proactive" ? "<span>主动来信</span>" : ""}${!me ? `<button data-action="speak" data-id="${e(m.id)}" aria-label="朗读消息">${icon("volume", 12)}</button>` : ""}<button data-action="delete-chat-msg" data-id="${e(t.id + "|" + m.id)}" aria-label="删除此消息" title="删除此消息">${icon("trash", 11)}</button></div></div></div>`;
    }).join("")}${busy ? `<div class="message">${avatar(s.contacts.find((c) => c.id === t.members[0]), "small")}<div class="bubble typing"><i></i><i></i><i></i></div></div>` : ""}<div data-chat-end></div></div>`;
  }
  function composerView(ui) {
    const t = ui.data?.threads.find((t2) => t2.id === ui.route.id);
    if (!t) return "";
    // 【2.9.6】输入框在 HTML 里留空：草稿由 renderer 的 renderComposer 用 .value 写进去。
    // 以前把草稿直接拼进 <textarea>…</textarea>：草稿里带 < & 这类字符会被当标签解析，
    // 而且只要「待发条」数量一变，整个输入框节点都会被换掉，手机键盘与输入法会被打断。
    const n = t.pending.length;
    return `<div class="composer"><div class="pending-strip" data-slot="pending"${n ? "" : " hidden"}><span data-slot="pending-text">${n ? e(n + " 条待发 · 尚未交给模型") : ""}</span><button data-action="clear-pending" data-id="${e(t.id)}">清空</button></div><div class="compose-row"><button class="icon-btn" data-action="chat-tools" aria-label="消息附件与工具">${icon("plus", 20)}</button><textarea id="phone-composer" data-thread="${e(t.id)}" placeholder="写一句，慢慢说…" aria-label="消息输入框" rows="1" maxlength="2000" autocomplete="off"></textarea><button class="send" data-action="send" data-id="${e(t.id)}" aria-label="发送消息">${icon("send", 19)}</button></div><div class="compose-tools"><button data-action="queue" data-id="${e(t.id)}">${icon("clock", 14)}仅暂存</button><button data-action="memory-thread" data-id="${e(t.id)}">${icon("memory", 14)}记住这段</button><span class="spacer"></span><button data-action="emoji">＋ 表情</button></div></div>`;
  }
  function contactsView(ui) {
    const s = ui.data, rows = [...s.contacts].sort((a, b) => Number(contactAvailable(b)) - Number(contactAvailable(a))), removed = (s.removedContacts || []).length;
    return `<div class="pad">${hint("带锁的人物暂时不能发消息。角色卡人物默认已全部解锁（可在 设置 里改成按剧情逐个解锁）；也可以从世界书里选人一键导入。")}<div class="buttons">${button(icon("plus", 14) + " 添加联系人", "edit-contact")}${button(icon("book", 14) + " 从世界书导入", "import-wb-contacts")}${button(icon("people", 14) + " 建一个群", "new-group")}</div>${rows.length ? tpDeleteBar("contacts", rows.length, "联系人") : ""}</div><div class="list">${rows.length ? rows.map((c) => `<button class="list-row ${!contactAvailable(c) ? "profile-locked" : ""}" data-action="contact" data-id="${e(c.id)}">${avatar(c)}<div class="body"><b>${e(c.name)}</b><p>${e(c.status)}</p></div>${!contactAvailable(c) ? icon("lock", 14) : icon("arrow", 14)}</button>`).join("") : empty("通讯录是空的", "可以手动添加，或从世界书里选人导入。", "people")}</div>${removed ? `<div class="pad">${button("已移除的角色卡人物（" + removed + "）· 恢复", "restore-contacts")}</div>` : ""}`;
  }
  function contactView(ui) {
    const s = ui.data, c = s.contacts.find((c2) => c2.id === ui.route.id);
    if (!c) return empty("联系人不存在");
    const histories = visibleHistory(c, ui.snapshot);
    return `<div class="pad"><div class="profile-hero">${avatar(c, "large")}<h2>${e(c.name)}</h2><p>${e(c.status)}</p><div class="buttons">${tag(c.age === null ? "年龄未确认" : c.age + "岁")}${tag(contactAvailable(c) ? "已建立联系" : "尚不可联系")}${c.story && contactAvailable(c) && !(c.story.recognized && c.story.reachable) ? tag("剧情里尚未相认/联系", "gold") : ""}${c.wb ? tag("世界书 · " + c.wb.book) : ""}</div><div class="buttons">${contactAvailable(c) ? button(icon("chat", 15) + " 发消息", "new-thread", c.id, "primary") : ""}${button(icon("edit", 15) + " 编辑资料", "edit-contact", c.id)}${button("删除联系人", "delete-contact", c.id, "danger")}</div></div>${hint("资料是作者参考，不表示玩家已知道全部私人过往。旧稿中的未来样本不自动成为当前事实。")}<details class="details"><summary>人物设定与阶段校准</summary><p>${e(c.bio || "尚无补充")}</p>${c.extraNotes ? "<p>新增补充：" + e(c.extraNotes) + "</p>" : ""}</details>${(c.references || []).map((r) => '<details class="details"><summary>' + e(r.name) + " · " + e(r.book) + "</summary><p>" + e(r.content) + "</p></details>").join("")}<div class="buttons">${button("从当前绑定世界书补充资料", "read-persona", c.id)}</div><div class="section-label">本人经历 · 按当前阶段显示</div>${histories.length ? histories.map((h) => `<details class="details"><summary>${e(h.title)}</summary><small>${e(h.time || "未注明")}</small><p>${e(h.text)}</p></details>`).join("") : empty("还没有可显示的过往", "可以保留原设定，在实际交谈中逐渐了解。", "book")}<div class="buttons">${button(icon("bell", 15) + " " + (c.proactive ? "暂停此人主动来信" : "允许此人主动来信"), "contact-proactive", c.id)}${button(icon("image", 15) + " 上传头像", "avatar-upload", c.id)}${button(icon("download", 15) + " 导出档案包", "contact-pack-export", c.id)}</div></div>`;
  }
  function feedView(ui) {
    const s = ui.data;
    return `<div class="feed-header">${landscape}<div class="caption">日常也值得，被看见。</div></div><div class="subnav"><button class="chip active">朋友的日常</button><button class="chip" data-action="new-post">${icon("plus", 13)}写动态</button><button class="chip" data-action="generate-post">${icon("spark", 13)}生成动态…</button></div>${s.feed.length ? `<div style="padding:6px 17px 0">${tpDeleteBar("feed", s.feed.length, "动态")}</div>` : ""}${s.feed.length ? [...s.feed].reverse().map((p) => {
      const c = s.contacts.find((c2) => c2.id === p.author);
      return `<article class="post"><div class="post-head">${avatar(p.author === "user" ? null : c)}<div class="meta"><b>${e(contactName(s, p.author))}</b><small>${e(p.story || time(p.ts))} · ${p.source === "demo" ? "演示动态" : "生活动态"}</small></div><button class="icon-btn" data-action="delete-post" data-id="${e(p.id)}" aria-label="删除此条动态">${icon("more", 16)}</button></div><p class="post-body">${e(p.text)}</p>${p.mediaId ? `<div class="post-image"><img data-media="${e(p.mediaId)}" alt="动态照片"></div>` : p.theme && p.theme !== "none" ? `<div class="post-image">${landscape}<span class="image-caption">MOMENTS OF EVERYDAY · 装饰画</span></div>` : ""}<div class="post-footer"><button class="${p.likes.includes("user") ? "liked" : ""}" data-action="like" data-id="${e(p.id)}">${icon("heart", 15)} ${p.likes.length || "喜欢"}</button><button data-action="comment" data-id="${e(p.id)}">${icon("chat", 15)} 评论</button><button data-action="share-post" data-id="${e(p.id)}">分享</button><button data-action="post-reply" data-id="${e(p.id)}">请回复</button></div>${p.comments.length ? `<div class="comments">${p.comments.map((c2) => `<div><b>${e(contactName(s, c2.author))}：</b>${e(c2.text)}</div>`).join("")}</div>` : ""}</article>`;
    }).join("") : empty("今天还没发动态", "发一件小事，或请一位角色写下他/她的日常。", "feed")}`;
  }
  function outboxView(ui) {
    const rows = ui.data.threads.filter((t) => t.pending.length);
    const totalPending = rows.reduce((n, t) => n + t.pending.length, 0);
    return `<div class="pad">${hint("待发不是已发送。只有你按发送或回复，内容才会交给模型；后台不会偷看未发送草稿。")}${totalPending ? tpDeleteBar("outbox", totalPending, "待发消息") : ""}${rows.length ? rows.map((t) => `<div class="card"><h3>${e(t.title)}</h3>${t.pending.map((p, i) => `<p class="preview-row">${i + 1}. ${e(p.text)}</p>`).join("")}<div class="buttons">${button("打开会话", "thread", t.id)}${button("发送这些消息", "send-pending", t.id, "primary")}</div></div>`).join("") : empty("待发箱空空的", "想说的话，可以先留一会儿。", "mail")}</div>`;
  }

