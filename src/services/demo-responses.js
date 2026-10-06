  // src/services/demo-responses.js
  async function demoResponse(module, { system = "", user, meta = {}, signal }) {
    await sleep(700, signal);
    let payload = {};
    try {
      payload = JSON.parse(user);
    } catch {
    }
    const c = meta.contact || meta.contacts?.[0];
    if (module === "director") return JSON.stringify({events:[{title:"演示 · 临窗的一阵风",weight:10,secret:"作者备忘：只是一个日常提议。",stages:[{hook:"窗边一张便笺被风吹到桌角，留待玩家决定是否查看。",condition:"正文实际提到便笺"},{hook:"如果有人拾起便笺，可发现它是一份未完成的购物清单。",condition:"正文实际核对清单"}]}]});
    if (module === "parallel") return JSON.stringify({portraits:(payload.npcs||[]).map(c=>({contactId:c.contactId,text:c.name+"在自己的休息处整理手边物品，暂时不知主角现场发生了什么。这是演示草稿。",summary:"整理物品的候选片段"}))});
    if (module === "world") return JSON.stringify({updates:[]});
    if (module === "visual") { const quote = "未夜把稿纸挪离杯沿"; return JSON.stringify({ characters: [{ name: "春山未夜", profile: { state: { "动作": { value: "把稿纸挪离杯沿", evidence: quote } } } }] }); }
    if (module === "chat") {
      const members = meta.thread.members;
      return JSON.stringify({ replies: members.slice(0, meta.thread.kind === "group" ? 2 : 1).map((contactId, i) => ({ contactId, text: i ? "我可以先听听你们的想法，待会儿还要去训练。" : "嗯，那就先从眼前这一件事开始。\n你想先看哪一部分？" })) });
    }
    if (module === "proactive") return JSON.stringify({ send: true, contactId: c.id, text: c.name.includes("朝华") ? "窗外的雨好像小了一点。\n突然想起店里靠窗的位置，今天有人坐在那里吗？" : c.name.includes("真昼") ? "训练提前结束了。我等会儿想绕到店里看看，你现在方便吗？" : "刚才又找到一个不太对的地方，不过先不说谜底。\n你有空的时候，我们一起看看？", reason: "演示：角色根据自己的小事主动联系" });
    if (module === "planner") {
      const members = (meta.contacts || []).slice(0, 3).map((c2) => c2.id);
      return JSON.stringify({ directions: [{ title: "雨停之前，把故事讲完", summary: "从窗边的一页稿纸开始，留出各自表达意见的时间。也可以不急着找出唯一答案。", tone: "合作", reason: "演示：承接当前讨论的稿纸与半小时空闲", members: members.slice(0, 2), beats: [{ day: 0, title: "一行字里的破绽", scene: "未夜圈出人物提前知道线索的那句话，真昼也想听听不同解释。先让彼此说完。", trigger: "仍在店内，尊重真昼只能停留半小时", choices: ["先问未夜觉得哪里不对", "请真昼说说她的直觉"], finish: "正文中实际核对了线索出现的顺序，并记录一个仍待修改的问题" }, { day: 1, title: "给另一个结尾留位子", scene: "如果大家愿意，可以再找一个有空的时段比较两种修改方式，不预设谁说服谁。", trigger: "先确认另一天大家是否有空", choices: ["约一个短暂的试读时间", "把不同意见各写成一小段"], finish: "实际进行试读或明确商定改期，并留下结果" }] }, { title: "一杯咖啡的空闲", summary: "忙碌间隙，不必急着聊什么重要的话题。各人都能有自己的事，也能留一点时间给彼此。", tone: "日常", reason: "演示：小镇日常与休息", members: members.slice(0, 1), beats: [{ day: 0, title: "先问一句，要不要休息", scene: "手边的事情告一段落时，可以提出休息的邀请，也接受对方此刻还不想停。", trigger: "对方没有正在处理紧急事务", choices: ["问问想喝点什么", "自己先去整理杯子"], finish: "实际提出邀请并得到回应，不预定同意" }, { day: 2, title: "不赶时间的下午", scene: "若此前相约成功，在确认的日期留出一小段轻松相处。", trigger: "有真实确认的约定才见面", choices: ["聊聊最近的一件小事", "安静坐一会儿"], finish: "实际见面或改期，记录当事人的回应" }] }, { title: "让一封消息先抵达", summary: "不同地方的雨，把日常的小事连起来。联系可以有分寸，也可以很真诚。", tone: "感情", reason: "演示：异地朋友之间的普通联系", members: members.slice(-1), beats: [{ day: 0, title: "接住那句问候", scene: "朝华问起你们是否在店里。先回应她问的事情，再决定要不要分享今天的小插曲。", trigger: "玩家实际查看了她的消息", choices: ["告诉她店里正在讨论稿子", "问问她那边的雨停了没有"], finish: "玩家实际发送了一条回复，未代写内心与承诺" }, { day: 3, title: "把下次联系说清楚", scene: "在各自都合适的时候，可以商量下次联系的时间，不把想念变成催促。", trigger: "双方有交流意愿且不打扰学校安排", choices: ["询问一个方便通话的时段", "先留一句不用急着回的话"], finish: "实际商量联系安排或明确暂时不约" }] }] });
    }
    if (module === "social" && meta.postId) return JSON.stringify({ send: true, contactId: c.id, text: "嗯，这件小事我也想听你多说一点。", reason: "演示评论回复" });
    if (module === "social") return JSON.stringify({ authorId: c.id, text: "雨停之前，先把手边这一页看完。\n有些答案，慢一点也没关系。", theme: "rain" });
    if (module === "diary" && system?.includes('"events"')) return JSON.stringify({ events: [{ title: "演示·商店街夜市", date: payload.起始日期, time: "18:00", kind: "游玩", place: "本町商店街", members: ["春山未夜"], note: "演示数据" }, { title: "真昼想约练球", date: addDays(payload.起始日期, 2), time: "16:00", kind: "约定", place: "公共球场", members: ["龙石真昼"], note: "演示：训练后有空" }] });
    if (module === "diary" && system?.includes('"entries"')) return JSON.stringify({ entries: (payload.写日记的角色 || []).map((n) => ({ author: n, title: n + "的一天", mood: "平静", text: "演示日记：" + n + "今天过得很普通，把手边的事做完了。" })) });
    if (module === "diary" && system?.includes('"tasks"')) return JSON.stringify({ tasks: [{ title: "演示·把借的伞还回去", category: "约定", target: 1, why: "正文提到" }, { title: "演示·准备模拟考", category: "学习", target: 3 }] });
    if (module === "diary" && system?.includes('"notes"')) return JSON.stringify({ notes: [{ title: "演示·周末", text: "周六下午两点，月夜露台。" }] });
    if (module === "diary") return JSON.stringify({ title: "窗边，还留着一页稿纸", text: "今天的讨论停在一行需要重新核对的文字上。有人只能坐半小时，有人从另一边发来了问候。\n\n还没有决定明天要做什么，也没有替谁写下承诺。先把已经发生的小事记在这里。\n\n此段为离线演示草稿，实际使用时由配置的模型参考当前正文生成。" });
    if (module === "memory") {
      if (!meta.thread) {
        const row = payload.正文?.find((m2) => m2.text.includes("已经一起核对"));
        return JSON.stringify(row ? { done: true, floor: row.floor, quote: "你们已经一起核对了稿纸上人物知情的先后顺序" } : { done: false, floor: 0, quote: "" });
      }
      const m = meta.thread.messages.at(-1);
      return JSON.stringify({ summary: "本批交流延续了当前的小事和彼此的时间安排；提议仍需实际执行。", facts: m ? [{ kind: "phone_fact", text: "在这次交流中说过：" + m.text.slice(0, 100), sourceIds: [m.id], quote: m.text.slice(0, Math.min(60, m.text.length)) }] : [], progress: { done: false } });
    }
    return "{}";
  }

