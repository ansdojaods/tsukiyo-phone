  // src/host/demo.js
  var DemoBridge = class {
    constructor(win) {
      this.win = win;
      this.mode = "demo";
      this.disposed = false;
      this.ownRequests = 0;
      this.injectionReady = true;
      this.lastError = "";
      this.injection = "";
      this.observers = /* @__PURE__ */ new Set();
      this.chat = "demo-a";
      this.turn = 0;
      this.store = {};
      try {
        this.store = JSON.parse(win.localStorage.getItem("tsukiyo-phone:demo:stores") || "{}");
      } catch {
      }
      this.draft = "";
      this.books = {
        "演示世界书": [
          { uid: 0, name: "小夏_人设", enabled: true, content: "姓名: 小夏\n年龄: 17岁\n身份: 花店老板的女儿\n性格: 开朗，爱笑，喜欢向日葵。", strategy: { type: "constant", keys: [] }, extra: {} },
          { uid: 1, name: "小秋_人设", enabled: true, content: "姓名: 小秋\n年龄: 18岁\n身份: 海边书店的店员\n性格: 安静，爱读推理小说。", strategy: { type: "constant", keys: [] }, extra: {} },
          { uid: 2, name: "世界观设定", enabled: true, content: "这是一个靠海的小镇，四月多雨。", strategy: { type: "constant", keys: [] }, extra: {} }
        ]
      };
      this.bindings = { primary: "演示世界书", additional: [], chat: null };
    }
    wbSupported() {
      return true;
    }
    wbWritable() {
      return true;
    }
    async wbNames() {
      return Object.keys(this.books);
    }
    async wbRead(name) {
      assert(this.books[name], "世界书不存在");
      return clone(this.books[name]);
    }
    async wbCreate(name, entries = []) {
      if (this.books[name]) return false;
      this.books[name] = clone(entries).map((e2, i) => ({ ...e2, uid: e2.uid ?? i }));
      return true;
    }
    async wbUpdate(name, updater) {
      assert(this.books[name], "世界书不存在");
      const out = await updater(clone(this.books[name]));
      let next = Math.max(-1, ...this.books[name].map((e2) => e2.uid)) + 1;
      this.books[name] = clone(out).map((e2) => ({ ...e2, uid: e2.uid ?? next++ }));
      for (const f of this.observers) f("worldbook");
      return clone(this.books[name]);
    }
    async wbBindings() {
      return clone({ ...this.bindings, global: [] });
    }
    async wbBind(name, scope = "card") {
      if (scope === "chat") {
        assert(!this.bindings.chat || this.bindings.chat === name, "当前聊天已经绑定了别的世界书");
        const was = this.bindings.chat === name;
        this.bindings.chat = name;
        return !was;
      }
      if ([this.bindings.primary, ...this.bindings.additional].includes(name)) return false;
      this.bindings.additional.push(name);
      return true;
    }
    async wbUnbind(name, scope = "card") {
      if (scope === "chat") {
        const was2 = this.bindings.chat === name;
        if (was2) this.bindings.chat = null;
        return was2;
      }
      const was = this.bindings.additional.includes(name);
      this.bindings.additional = this.bindings.additional.filter((x) => x !== name);
      return was;
    }
    registerSource() {
      return () => {
      };
    }
    api() {
      return void 0;
    }
    context() {
      return {};
    }
    owner() {
      return "demo:" + this.chat;
    }
    capture() {
      assert(!this.disposed, "演示连接已卸载");
      const lineage = Array.from({ length: this.turn + 1 }, (_, i) => fingerprint(this.chat + ":story:" + i));
      return { owner: this.owner(), floor: this.turn, tail: this.turn, lineage, signature: fingerprint(lineage), statSignature: "demo-story-" + this.turn, stat: { 系统: { 作品: "演示" }, NPC动态: { 当前互动NPC: [{ 名字: "春山未夜" }, { 名字: "龙石真昼" }] } }, legacy: null, character: { name: "月夜露台 · 离线演示", avatar: "demo.png" }, userName: "玩家", story: { date: "2019-05-12", time: "16:" + String(10 + this.turn).padStart(2, "0"), place: "月夜露台 · 窗边", weather: "小雨", known: true }, present: ["春山未夜", "龙石真昼"], history: [{ floor: this.turn, role: "assistant", name: "春山未夜", text: this.turn ? "你们已经一起核对了稿纸上人物知情的先后顺序。未夜把仍需修改的一行标了出来。" : "未夜把稿纸挪离杯沿，指着最后一行。真昼收起滴水的雨伞，说自己今天只能坐半小时。" }], backend: "demo" };
    }
    same(snap) {
      if (this.disposed) return false;
      return this.owner() === snap.owner && this.capture().signature === snap.signature && this.capture().statSignature === snap.statSignature;
    }
    candidates(snap) {
      return Object.entries(this.store[snap.owner] || {}).map(([floor, envelope]) => ({ floor: Number(floor), envelope: clone(envelope) })).filter((x) => x.floor <= snap.floor).sort((a, b) => b.floor - a.floor);
    }
    readTarget(snap) {
      assert(this.same(snap), "演示场景已变化");
      return clone(this.store[snap.owner]?.[snap.floor] || null);
    }
    async saveEnvelope(snap, envelope, expected) {
      assert(this.same(snap), "场景已变化");
      assert(fingerprint(this.readTarget(snap)) === expected, "演示存档冲突");
      const next = clone(this.store);
      next[snap.owner] = next[snap.owner] || {};
      next[snap.owner][snap.floor] = clone(envelope);
      this.win.localStorage.setItem("tsukiyo-phone:demo:stores", JSON.stringify(next));
      this.store = next;
      return true;
    }
    initial() {
      return demoData();
    }
    setPrompt(value) {
      this.injection = value;
      this.injectionReady = true;
      return true;
    }
    clearPrompt() {
      this.injection = "";
    }
    isBusy() {
      return false;
    }
    isTyping() {
      return false;
    }
    listen(fn) {
      this.observers.add(fn);
      return () => this.observers.delete(fn);
    }
    fill(value) {
      this.draft = value;
      this.win.dispatchEvent(new this.win.CustomEvent("tsukiyo:demo-draft", { detail: value }));
      return true;
    }
    advance() {
      this.turn++;
      for (const f of this.observers) f("narrative");
    }
    switchChat() {
      this.chat = this.chat === "demo-a" ? "demo-b" : "demo-a";
      this.turn = 0;
      for (const f of this.observers) f("chat");
    }
    async withOwnRequest(fn) {
      return fn();
    }
    dispose() {
      this.clearPrompt();
      this.observers.clear();
      this.disposed = true;
    }
  };

