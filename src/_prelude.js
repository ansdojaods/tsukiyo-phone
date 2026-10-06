/* 月夜来信 · 小手机 v2.9.1（记忆工作台 · 楼层记忆归属互斥 · 分层摘要 · 本地召回 · 状态账本 · 楼层收纳 · 百宝月夜书联动） ｜ 在 v2.9.0「记忆工作台 · 公开API联动」基础上的社区优化版：① 新增「楼层记忆归属互斥」——检测到百宝月夜书挂了「剧情剪辑台」（window.STBaiBaiBook.memoryEditor）时，手机侧停止生成楼层摘要、停止注入楼层记忆，只保留手机内通信记忆，避免两边各写一份摘要造成重复注入与缺口口径打架；② 记忆工作台顶部显示引擎接管状态与它的只读镜像（覆盖 / 缺口 / 摘要数 / 上次召回），提供「重新探测引擎」与「接管期间仍注入手机内记忆」开关；③ 没检测到引擎时一切照旧，手机自己管，功能不缺失。原创实现 · 不含用户 API 密钥或聊天存档 */
var TSUKIYO_PRESET = /*@@PRESET@@*/null/*@@END@@*/;
var TsukiyoPhoneBundle = (() => {
  var PRESET = typeof TSUKIYO_PRESET === "object" && TSUKIYO_PRESET && Array.isArray(TSUKIYO_PRESET.contacts) ? TSUKIYO_PRESET : null;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

