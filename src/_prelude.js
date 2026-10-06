/* 月夜来信 · 小手机 v2.9.2（记忆工作台 · 楼层记忆归属互斥 · 分层摘要 · 本地召回 · 状态账本 · 楼层收纳 · 百宝月夜书联动） ｜ 本版为一次“减重”整改：① 删除「外部 SoulLink 扩展桥」——它需要你先安装第三方酒馆扩展、并把手机记录写回别人的扩展设置，功能与小手机内置的「灵魂链接（NPC 档案 + 发送前推演）」重复，设置页与主页两处同名入口容易误解；现在只保留内置灵魂链接，数据全部在手机自己的存档里（不依赖、不读取任何外部扩展）；② 顺带清掉与本次相关及历年遗留的死代码（无调用点的旧页面 / 旧导入函数 / 重复导出函数），并把 PhoneEngine 组装类从 soullink-bridge.js 切片搬回它本该在的 core/engine.js；③ 修复「灵魂链接 → 导出名单」按钮调用了一个不存在的方法（会报错）的问题。原创实现 · 不含用户 API 密钥或聊天存档 */
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

