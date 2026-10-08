  // src/services/api-router.js
  var ApiRouter = class {
    constructor(bridge, settings) {
      this.bridge = bridge;
      this.settings = settings;
      this.lastRequest = null;
      this.controllers = /* @__PURE__ */ new Set();
    }
    profile(module, override) {
      const p = override ? this.settings.data.profiles.find((p2) => p2.id === override) : this.settings.route(module);
      assert(p, "API方案不存在");
      return p;
    }
    async call(module, { system, user }, { signal, profileId, meta = {}, raw = false, draft = null } = {}) {
      // draft：编辑页的未保存草稿（见 settings.draftProfile），与 profileId 同样跳过模块开关
      if (!profileId && !draft && !this.settings.isEnabled(module)) throw moduleOffError(module);
      const pc = this.settings.data.prompt || {}, pre = !raw && pc.enabled && String(pc.text || "").trim() ? [String(pc.text).trim()] : [];
      const p = draft ? { ...draft } : this.profile(module, profileId), secret = draft ? String(draft.key || "") : this.settings.key(p.id);
      assert(!signal?.aborted, "请求已取消");
      this.lastRequest = { module, profile: p.name, model: p.model || "酒馆当前模型", started: Date.now(), mock: this.bridge.mode === "demo" };
      if (this.bridge.mode === "demo") return demoResponse(module, { system, user, meta, signal });
      const requestId = id("tsukiyo-" + module), controller = new AbortController();
      this.controllers.add(controller);
      const abort = () => controller.abort(signal?.reason || "cancelled");
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort("timeout"), 9e4);
      const cancelHelper = () => {
        try {
          this.bridge.api("stopGenerationById")?.(requestId);
        } catch {
        }
      };
      controller.signal.addEventListener("abort", cancelHelper, { once: true });
      try {
        return await this.bridge.withOwnRequest(async () => {
          if (p.type === "tavern" || p.transport === "helper") {
            const generate = this.bridge.api("generateRaw");
            assert(generate, "此方案需要酒馆助手的 generateRaw；请启用助手，或选择独立接口的浏览器直连");
            const params = { generation_id: requestId, should_stream: false, should_silence: true, max_chat_history: 0, ordered_prompts: [...pre.map((content) => ({ role: "system", content })), { role: "system", content: system }, "user_input"], user_input: user };
            if (p.type !== "tavern") params.custom_api = { apiurl: p.url.replace(/\/chat\/completions\/?$/, ""), source: "custom", model: p.model, ...secret ? { key: secret } : {}, temperature: p.temperature, max_tokens: p.maxTokens };
            const cancelled = new Promise((_, reject) => {
              if (controller.signal.aborted) reject(Error("已停止或超时"));
              else controller.signal.addEventListener("abort", () => reject(Error("已停止或超时，未消费待发消息")), { once: true });
            });
            const result2 = await Promise.race([Promise.resolve().then(() => {
              assert(!controller.signal.aborted, "请求已取消");
              return generate(params);
            }), cancelled]);
            assert(typeof result2 === "string", "助手返回了非文本内容");
            return result2;
          }
          const endpoint = p.url.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/chat/completions";
          const response = await this.bridge.win.fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...secret ? { Authorization: "Bearer " + secret } : {} }, body: JSON.stringify({ model: p.model, messages: [...pre.map((content) => ({ role: "system", content })), { role: "system", content: system }, { role: "user", content: user }], temperature: p.temperature, max_tokens: p.maxTokens, stream: false }), signal: controller.signal, credentials: "omit", redirect: "error" });
          if (!response.ok) {
            const body = await response.text();
            throw Error("API 返回 HTTP " + response.status + "：" + redactError(body, [secret]).slice(0, 180));
          }
          const json = await response.json();
          let result = json.choices?.[0]?.message?.content;
          if (Array.isArray(result)) result = result.map((p2) => p2.text || "").join("");
          assert(typeof result === "string" && result.trim(), "接口没有返回可用文本；请检查模型与兼容格式");
          return result;
        });
      } catch (error) {
        if (controller.signal.aborted) throw Error("已停止或请求超时，原记录和待发内容保留");
        throw Error(redactError(error, [...this.settings.secrets(), secret]));
      } finally {
        this.controllers.delete(controller);
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", cancelHelper);
      }
    }
    async test(profileId, { signal } = {}) {
      if (this.bridge.mode === "demo") return "演示环境：只展示配置，未请求或验证真实 API。";
      const raw = await this.call("chat", { system: "这是一条用户主动触发的连接测试。仅输出 OK。", user: "请回复 OK。" }, { signal, profileId });
      return "接口有响应：" + text(raw, 80);
    }
    dispose() {
      for (const c of this.controllers) c.abort("手机卸载");
      this.controllers.clear();
    }
    async modelsDraft(raw, { signal } = {}) {
      const key = String(raw.key || "");
      let u;
      try {
        u = new URL(raw.url);
      } catch {
        throw Error("先填写正确的API基础地址");
      }
      assert(["http:", "https:"].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash, "地址只能为不含账号/参数的HTTP(S)");
      if (this.bridge.mode === "demo") return ["演示模型 · 未验证真实接口"];
      const base = raw.url.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, ""), controller = new AbortController();
      this.controllers.add(controller);
      const abort = () => controller.abort("已停止");
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(() => controller.abort("模型列表请求超时"), 3e4);
      try {
        const work = async () => {
          assert(!controller.signal.aborted, "请求已停止");
          if (raw.transport === "helper") {
            const fn = this.bridge.api("getModelList");
            assert(fn, "助手未提供模型列表接口，请手动填写模型");
            const list = await fn({ apiurl: base, key });
            return (list || []).map((x) => typeof x === "string" ? x : x.id).filter(Boolean).slice(0, 200);
          }
          const r = await this.bridge.win.fetch(base + "/models", { headers: key ? { Authorization: "Bearer " + key } : {}, signal: controller.signal, credentials: "omit", redirect: "error" });
          assert(r.ok, "模型列表请求失败：HTTP " + r.status);
          const json = await r.json();
          return (json.data || []).map((x) => x.id).filter((x) => typeof x === "string").slice(0, 200);
        };
        const stopped = new Promise((_, reject) => {
          const end = () => reject(Error("模型列表请求已停止或超时，可手动填写模型名称"));
          if (controller.signal.aborted) end();
          else controller.signal.addEventListener("abort", end, { once: true });
        });
        return await Promise.race([work(), stopped]);
      } catch (error) {
        throw Error(redactError(error, [key, ...this.settings.secrets()]));
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.controllers.delete(controller);
      }
    }
    async models(profileId, options = {}) {
      const p = this.profile("chat", profileId);
      assert(p.type !== "tavern", "跟随酒馆模式请在酒馆选择模型");
      return this.modelsDraft({ ...p, key: this.settings.key(p.id) }, options);
    }
  };

