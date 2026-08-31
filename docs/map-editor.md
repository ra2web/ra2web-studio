# FA2 地图编辑器移植 — 目标与验收

仓库：`ra2web-studio`  
对照源码：`/Users/bxy/Desktop/ra2web/fa2`（EA `CNC_TS_and_RA2_Mission_Editor`）  
基线 tag：`map-editor-baseline`

## 总目标

把 Final Alert 2 的地图编辑能力完整迁入 ra2web-studio，使工作室能**新建、打开、编辑、保存**红警 2 / Yuri's Revenge 的 `.map` / `.mpr`，在桌面指针和移动端触摸下都可用，并用自动化测试锁住 FA2 兼容行为。

## 分目标

| 阶段 | Tag | 内容 |
|------|-----|------|
| P0 文档模型 | `map-editor-p0-document` | INI + IsoMapPack5/OverlayPack 编解码；新建/打开/保存往返 |
| P1 视口 | `map-editor-p1-viewport` | 等距画布、缩放平移、小地图、触摸手势 |
| P1 编辑器 | `map-editor-p1-editor` | 新建/读写/对象/逻辑面板/触摸工具盘 |
| P2 剧院 | `map-editor-p2-theater` | theater.ini + TMP 等距渲染、瓦片浏览器、AutoLAT、悬崖/岸线 |
| P3 逻辑 | `map-editor-p3-logic` | FAData 触发器参数、AITrigger、Base Node、改尺寸、校验、对象属性 |
| P4 贴图 | `map-editor-p4-sprites` | Overlay/单位 SHP（werhd ImageFinder） |
| P5 拷贝与小地图 | `map-editor-p5-copy-minimap` | `[Countries]`/`[Houses]`、RA2/YR 新建、区域拷贝粘贴、编辑器内小地图、SpecialFlags、Marble 预览开关、载具 VXL 地格预览 |
| P6 悬崖与 SmoothAt | `map-editor-p6-smooth-cliff` | FA2 SmoothAt 3×3 LAT、Front/Back CliffModifier（FAData 崖块表） |
| P7 隧道/岸线/桥 | `map-editor-p7-tubes-shore` | FA2 Tube 8 向 autocreate、CreateShore、Overlay 桥/墙接缝、随机地形物 |
| P8 TMP 与朝向 | `map-editor-p8-tmp-facing` | 从剧院 TMP 读 Shore/Cliff 目录与 bZHeight；SmoothAt `its!=iss`；VXL/SHP 地格预览按朝向（HVA frame 0） |
| P9 矿石与矿脉 | `map-editor-p9-ore-veins` | FA2 SmoothTiberium、宝石、VeinHole/Veins、AllowTiberium |
| P10 脚本与地图工具 | `map-editor-p10-scripts-tools` | FA2 UserScripts 解析/解释器、VariableNames 面板、全图 AutoCreateShores、搜索航点、矩形 HeightenTile、附加 INI |
| P11 坡度与改尺寸 | `map-editor-p11-slopes-resize` | FA2 CreateSlopesAt、ResizeMap left/top、全图改高度、CAll 式 INI 编辑、Tags 面板 |
| P12 高程传播与整图 | `map-editor-p12-autolevel` | FA2 ChangeTileHeight/AutoLevel、OverlayData、整图拷贝、AITriggerTypesEnable |
| P13 脚本交互与隐藏 | `map-editor-p13-scripts-ui` | UserScripts 交互命令（Message/Ask/UInput*/AddTrigger）、Cloak 隐藏瓦片集/格子（仅显示） |
| P14 单格高程与队伍 | `map-editor-p14-teams-tile` | FA2 Raise/Lower Tile（SetHeightAt）、TeamTypes 全字段、ScriptTypes TMissions、单人过场字段 |
| P15 逻辑全字段与轮廓 | `map-editor-p15-logic-fields` | FA2 AITriggerTypes 18 字段、阵营增删/PrepareHouses、单人剩余 Basic、LocalSize、CheckMap、建筑轮廓 |
| P16 测试与交付 | `map-editor-p16-tests` | 单元 + 组件 + e2e；阶段 tag 齐全；对照 FA2 剩余选项面 |

## 验收标准

1. `git tag map-editor-baseline` 存在，且每个可用阶段有对应 annotated tag。
2. 可新建地图：theater、宽高（16–400 且 W+H≤512）、单人/多人、起始高度；多人图带航点 0–7。
3. 打开并保存后，游戏引擎可读的核心段完整：`[Map]` `[Basic]` `[Lighting]` `[SpecialFlags]` `[IsoMapPack5]` `[OverlayPack]` `[OverlayDataPack]` `[Units]` `[Infantry]` `[Aircraft]` `[Structures]` `[Terrain]` `[Smudge]` `[Waypoints]` `[Houses]` `[Countries]` `[Triggers]` `[Events]` `[Actions]` `[Tags]` `[CellTags]` `[ScriptTypes]` `[TaskForces]` `[TeamTypes]` `[AITriggerTypes]` `[Tubes]` `[VariableNames]` `[Preview]`/`[PreviewPack]`。
4. 地形笔刷、高程、Overlay（矿石等）、对象放置与删除、区域拷贝/粘贴、撤销（地形快照最多 64 步）可用。
5. 触发器/队伍/阵营/光照/SpecialFlags/隧道可编辑且写回 INI。
6. 触摸：单指绘制（当前工具）、双指平移缩放、长按打开属性；窄屏工具盘可收起；编辑器内小地图可点击跳转。
7. `npm run test:unit` 覆盖编解码往返、编辑命令、触摸命中；相关组件测试通过。

## 非目标（明确不做）

- 在 macOS 上编译 FA2 原生 exe
- 游戏内 Play 启动
- 完整 Marble Madness 美术替换（可保留开关位）

## 对照 FA2 仍待移植（P16+）

- 真 `marble.mix` Marble Madness 美术（见非目标）
- FA2 选项类/插件面（MapTool DLL、Simple view、游戏内 Play）
