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
| P2 地形 | `map-editor-p2-terrain` | 刷地/高程/LAT/Overlay/悬崖/平整 |
| P3 对象 | `map-editor-p3-objects` | 步兵/载具/飞机/建筑/地形物/污痕/航点/CellTag/Node |
| P4 逻辑 | `map-editor-p4-logic` | Houses、Triggers、Tags、Scripts、TaskForces、Teams、AITriggers、Lighting、Tubes、Basic |
| P5 移动端 | `map-editor-p5-touch` | 窄屏工具盘、双指缩放、长按属性、不挡画布 |
| P6 测试与交付 | `map-editor-p6-tests` | 单元 + 组件 + e2e；阶段 tag 齐全 |

## 验收标准

1. `git tag map-editor-baseline` 存在，且每个可用阶段有对应 annotated tag。
2. 可新建地图：theater、宽高（16–400 且 W+H≤512）、单人/多人、起始高度；多人图带航点 0–7。
3. 打开并保存后，游戏引擎可读的核心段完整：`[Map]` `[Basic]` `[Lighting]` `[SpecialFlags]` `[IsoMapPack5]` `[OverlayPack]` `[OverlayDataPack]` `[Units]` `[Infantry]` `[Aircraft]` `[Structures]` `[Terrain]` `[Smudge]` `[Waypoints]` `[Houses]` `[Triggers]` `[Events]` `[Actions]` `[Tags]` `[CellTags]` `[ScriptTypes]` `[TaskForces]` `[TeamTypes]` `[AITriggerTypes]` `[Tubes]` `[VariableNames]` `[Preview]`/`[PreviewPack]`。
4. 地形笔刷、高程、Overlay（矿石等）、对象放置与删除、撤销（地形快照最多 64 步）可用。
5. 触发器/队伍/阵营/光照/隧道可编辑且写回 INI。
6. 触摸：单指绘制（当前工具）、双指平移缩放、长按打开属性；窄屏工具盘可收起。
7. `npm run test:unit` 覆盖编解码往返、编辑命令、触摸命中；相关组件测试通过。

## 非目标（明确不做）

- 在 macOS 上编译 FA2 原生 exe
- 游戏内 Play 启动
- 完整 Marble Madness 美术替换（可保留开关位）
