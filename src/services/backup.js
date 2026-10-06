  // src/services/backup.js
  async function exportBackup(repo, media, { includeMedia = true } = {}) {
    const snap = repo.bridge.capture(), data = repo.choose(snap);
    validatePhone(data);
    const mediaIds = referencedMedia(data);
    const files = includeMedia ? await media.collect(mediaIds) : [];
    assert(repo.bridge.same(snap), "导出期间场景已变化，请重试");
    return { format: "tsukiyo-phone-backup", version: 1, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), scopeHint: fingerprint(snap.owner), story: snap.story, mediaIncluded: includeMedia, phone: clone(data), media: files.map((m) => ({ id: m.id, data: m.data, mime: m.mime })), notice: "不含API方案密钥。不包含完整酒馆对话历史或stat_data。聊天文本中用户自行填写的秘密仍会被导出。" };
  }
  function inspectBackup(raw) {
    safeJson(raw);
    assert(raw.format === "tsukiyo-phone-backup" && raw.version === 1, "不是兼容的月夜来信备份");
    const phone = normalizePhone(raw.phone);
    assert(Array.isArray(raw.media) && raw.media.length <= 240, "图片列表无效");
    const ids = /* @__PURE__ */ new Set();
    for (const m of raw.media) {
      assert(m.id && !ids.has(m.id) && safeImageData(m.data), "图片内容无效或编号重复");
      ids.add(m.id);
    }
    if (raw.mediaIncluded) for (const m of referencedMedia(phone)) assert(ids.has(m), "完整备份缺少引用的图片：" + m);
    return { phone, media: clone(raw.media), summary: { contacts: phone.contacts.length, threads: phone.threads.length, messages: phone.threads.reduce((n, t) => n + t.messages.length, 0), memories: phone.memories.length, plans: phone.plans.length, media: raw.media.length }, mediaIncluded: raw.mediaIncluded === true };
  }
  async function restoreBackup(repo, media, inspected, snapshot2) {
    assert(repo.bridge.same(snapshot2), "确认期间聊天/分支变化，未恢复");
    if (snapshot2.phoneDigest) assert(fingerprint(repo.choose(snapshot2)) === snapshot2.phoneDigest, "确认期间手机记录变化，未覆盖");
    const data = clone(inspected.phone);
    data.settings.auto.enabled = false;
    data.settings.auto.consentAt = 0;
    data.automation.next = {};
    const map = /* @__PURE__ */ new Map();
    for (const m of inspected.media) {
      assert(repo.bridge.same(snapshot2), "恢复期间聊天已变化");
      const old = await media.get(m.id);
      const nextId = old && old.data !== m.data ? id("restored-media") : m.id;
      await media.put({ ...m, id: nextId, scope: snapshot2.owner, createdAt: Date.now() });
      map.set(m.id, nextId);
    }
    for (const c of data.contacts) if (map.has(c.avatar)) c.avatar = map.get(c.avatar);
    for (const t of data.threads) for (const m of [...t.messages, ...t.pending]) if (map.has(m.mediaId)) m.mediaId = map.get(m.mediaId);
    for (const p of [...data.album, ...data.feed]) if (map.has(p.mediaId)) p.mediaId = map.get(p.mediaId);
    return repo.mutate((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, data);
    }, { snapshot: snapshot2, guard: (s) => !snapshot2.phoneDigest || fingerprint(s) === snapshot2.phoneDigest, label: "恢复手机存档（自动化保持关闭）" });
  }
  function downloadJson(win, name, value) {
    const blob = new win.Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" }), url = win.URL.createObjectURL(blob), a = win.document.createElement("a");
    a.href = url;
    a.download = name;
    win.document.body.append(a);
    a.click();
    a.remove();
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1e3);
  }

