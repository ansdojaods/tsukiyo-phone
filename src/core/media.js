  // src/core/media.js
  var MediaStore = class {
    constructor(win, { demo = false } = {}) {
      this.win = win;
      this.dbName = demo ? "tsukiyo-phone-demo-media-v1" : "tsukiyo-phone-media-v1";
      this.dbPromise = null;
      this.cache = /* @__PURE__ */ new Map();
    }
    open() {
      if (this.dbPromise) return this.dbPromise;
      this.dbPromise = new Promise((resolve, reject) => {
        assert(this.win.indexedDB, "当前环境没有可靠的图片存储，请在完整酒馆页面中使用");
        const req = this.win.indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(Error("图片数据库无法打开"));
        req.onblocked = () => reject(Error("图片数据库被其他页面占用"));
      }).catch((e2) => {
        this.dbPromise = null;
        throw e2;
      });
      return this.dbPromise;
    }
    async get(mediaId) {
      if (typeof mediaId === "string" && mediaId.startsWith("url:")) return { id: mediaId, data: mediaId.slice(4), remote: true, mime: "" };
      if (this.cache.has(mediaId)) return this.cache.get(mediaId);
      const db = await this.open();
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction("media", "readonly"), r = tx.objectStore("media").get(mediaId);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(Error("读取图片失败"));
      });
      if (value) this.cache.set(mediaId, value);
      return value;
    }
    async put(value) {
      assert(value.id && value.scope && safeImageData(value.data), "图片数据无效或超过大小限制");
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("media", "readwrite");
        tx.objectStore("media").put(value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(Error("图片保存失败，请检查浏览器配额"));
        tx.onabort = () => reject(Error("图片保存被中止"));
      });
      this.cache.set(value.id, value);
      return value;
    }
    async upload(file, scope) {
      assert(file && file.size <= 10 * 1024 * 1024, "请选择10MB以内的图片");
      assert(["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type), "只支持 JPG/PNG/WebP/GIF 图片，不运行 SVG");
      const raw = await new Promise((resolve, reject) => {
        const r = new this.win.FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(Error("图片读取失败"));
        r.readAsDataURL(file);
      });
      const image = await new Promise((resolve, reject) => {
        const img = new this.win.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(Error("图片无法解码"));
        img.src = raw;
      });
      const ratio = Math.min(1, 1200 / Math.max(image.width, image.height)), canvas = this.win.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.8);
      assert(safeImageData(data), "压缩后图片仍过大");
      return this.put({ id: id("media"), scope, data, createdAt: Date.now(), mime: "image/jpeg" });
    }
    async collect(ids) {
      const rows = [];
      for (const id2 of new Set(ids.filter(Boolean))) {
        const m = await this.get(id2);
        assert(m, "图片 " + id2 + " 在本机缺失，不能声称备份完整");
        rows.push(m);
      }
      return rows;
    }
    dispose() {
      this.cache.clear();
      this.dbPromise?.then((db) => db.close()).catch(() => {
      });
    }
  };
  function referencedMedia(data) {
    const ids = [];
    for (const c of data.contacts) if (c.avatar) ids.push(c.avatar);
    for (const t of data.threads) for (const m of [...t.messages, ...t.pending]) if (m.mediaId) ids.push(m.mediaId);
    for (const p of data.feed) if (p.mediaId) ids.push(p.mediaId);
    for (const p of data.album) if (p.mediaId) ids.push(p.mediaId);
    return [...new Set(ids)].filter((x) => !String(x).startsWith("url:"));
  }

