/* 月夜来信 · 小手机 v2.9.3（灵魂档案路由修复 · 批量删除 · 世界书条目预览与管理 · 已有世界书连接 · 同步与异步结果保护）原创实现；升级前备份。 */
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

