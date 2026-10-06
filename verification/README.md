# 验证记录（v2.9.2）

本机实跑，全部在离线 Node 环境完成（不需要酒馆）：

```bash
node tools/build.js /tmp/rebuild.js   # 改前基线：与 v2.9.1 发布版逐字节一致（sha256 7c71f556…）
node tools/smoke_test.js              # 115 项全绿（改前 121：删掉只服务外部 SoulLink 桥的 [2] 段 7 项，新增 2 项）
node tools/smoke_delegate.js          # 16 项全绿（楼层记忆归属互斥）
node tools/release.js                 # 重算 52 个切片的 sha256，产出三个发布件
```

产物：

| 文件 | 字符数 | sha256 |
| --- | --- | --- |
| `dist/tsukiyo-phone-v2.9.2.js` | 1231233 | `80e5c14f9847af489555c91e60d99fa7664dbb5f3000496ac1efc5094ebe8ac0` |
| `dist/tsukiyo-phone-v2.9.2.embedded.js` | 1424429 | `e2ba5ca39548817d04aa2454e35d10dab02413e8db1dc2f8785ea4129367f316` |

本次改动清单（相对 v2.9.1）：

```
删除  src/services/soullink-bridge.js            外部 SoulLink 扩展桥（约 290 行）
新增  src/core/engine.js                         PhoneEngine 组装类（从上面那个切片搬回）
修改  src/ui/views-settings.js                   删掉 soullinkCard、收紧文案
修改  src/ui/commands.js                         删 7 个 soullink-* 分支、soul-import-extension、死代码 oldPhone
修改  src/center/ui.js                           删掉夹带的 SOULLINK_SECTIONS / soulDefaults
修改  src/ui/views-planner.js                    删死代码 plannerView
修改  src/services/memory-studio.js              删死代码 msMode / msKeywordsOf
修改  src/services/soul.js                       新增 SoulStudio.exportRoster()（修 BUG）
修改  src/_prelude.js / src/index.js             版本 2.9.2、头部与描述
修改  src/manifest.json                          切片表（52 条，sha256 全部重算）
新增  tools/release.js / tools/embedded-preset.json
修改  tools/{build.js,smoke_test.js,smoke_delegate.js}
修改  README.md / CHANGELOG.md / docs/模块索引.md
新增  docs/v2.9.2_整改说明.md
```
