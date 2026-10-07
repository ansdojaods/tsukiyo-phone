/* 月夜来信 · 小手机 v2.9.6（私信输入法修复：输入框不再被重绘打断 · 拼字中不误发 · 手机端回车换行、电脑回车发送 · 发送后焦点留在输入框）升级前备份；自动同步不会逐次要求审批。 */
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

