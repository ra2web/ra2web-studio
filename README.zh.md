# RA2Web Studio

**[English](README.md)**

一个为 **RA2WEB** 打造的在线 **【兼容红警2】** MIX 文件编辑器。支持在浏览器中直接查看、编辑和导出游戏资源，无需安装任何客户端。

---

## ✨ 功能特性

### 支持 16+ 种文件格式

| 格式 | 描述 | 查看器 |
|------|------|--------|
| **MIX / MMX / YRO** | 【兼容红警2】资源包（加密/非加密） | 目录列表，嵌套导航 |
| **SHP** | 2D 精灵图像 | 多帧预览 + 调色板 |
| **VXL** | 3D 体素模型 | 2D 帧采样 + Three.js 3D 视图 |
| **HVA** | 体素动画 | 3D 坐标轴 Section 变换预览 |
| **TMP / TEM / SNO / URB / …** | 地图图块 | 图块网格预览 + 调色板 |
| **PCX** | 图像 | 调色板支持预览 |
| **PAL** | 调色板 | 颜色方格显示 |
| **WAV** | 音频 | 浏览器内置播放器 |
| **BIK** | 视频 | 通过 FFmpeg.wasm 转码为 WebM 播放 |
| **CSF** | 字符串表 | 可搜索 Key/Value 表，支持复制 |
| **MAP / MPR** | 地图文件 | 小地图预览（含出生点标注） |
| **INI / TXT** | 配置 / 文本 | Monaco 语法编辑器 |
| **DAT** | LMD / 二进制 | 自动格式识别 |
| **其他** | 未知格式 | 十六进制查看器兜底 |

### 调色板系统
- 自动解析：同名查找 → XCC 规则表 → 回退
- 可手动指定调色板
- 支持素材内嵌调色板（SHP/VXL）
- 智能调色板缓存，重渲染速度快

### 导出功能
- **原始文件导出**：任意资源按原样导出
- **SHP → PNG / JPG / GIF**：可选帧，自动关联 PAL/HVA
- **MIX 重建**：向 MIX 包导入文件并重新导出

### 游戏资源管理
- 从**游戏目录**或**压缩包**（tar.gz / exe / 7z / zip）导入
- 通过 **OPFS** 持久化存储（刷新页面无需重新导入）
- 分层资源体系：基座 → 补丁 → Mod 覆盖
- 支持 **LMD**（本地 Mix 数据库）和 **GMD**（全局 Mix 数据库 / XCC 格式）
- 支持嵌套 MIX 导航（深入子 MIX 文件）

### 编辑功能
- 向 MIX 包内添加/替换文件
- 重建并导出修改后的 MIX

### 国际化（i18n）
- 界面支持**英文**（默认）和**简体中文**
- 跟随浏览器语言，手动切换后自动保存到 localStorage

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- 现代浏览器（支持 ES2020+）

### 安装与运行

```bash
npm install
npm run dev
# 浏览器访问 http://localhost:3000
```

### 构建生产版本

```bash
npm run build
npm run preview
```

### 自动化测试

```bash
npm run test:unit
npm run test:e2e
```

如果本机 `3000` 端口已经被其他服务占用，可以临时覆盖 Playwright 启动端口：

```bash
PLAYWRIGHT_PORT=3100 npm run test:e2e
```

真实归档导入冒烟测试：

```bash
npm run test:e2e:smoke-import
```

- 默认 E2E 和 CI 使用最小 MIX 夹具种子，不依赖真实游戏文件。
- 冒烟测试读取环境变量 `RA2WEB_STUDIO_IMPORT_ARCHIVE`，默认路径为 `/Users/bxy/Downloads/fully-music.exe`。
- 这条冒烟测试只用于本机验证，不进入默认 CI 流水线。

---

## 📁 项目结构

```
ra2web-studio/
├── src/
│   ├── components/
│   │   ├── MixEditor.tsx          # 主编辑器框架
│   │   ├── Toolbar.tsx            # 导入/导出操作
│   │   ├── FileTree.tsx           # 带搜索的文件树
│   │   ├── PreviewPanel.tsx       # 格式分发预览面板
│   │   ├── PropertiesPanel.tsx    # 文件元数据面板
│   │   ├── ImportProgressPanel.tsx
│   │   ├── common/                # 对话框、SearchableSelect
│   │   ├── export/                # ExportDialog
│   │   └── preview/               # 16 个格式专用查看器
│   ├── data/                      # 二进制解析器（MIX、SHP、VXL、TMP、CSF、HVA、WAV、PCX…）
│   │   └── encoding/              # Blowfish、Format3/5/80、LZO1x
│   ├── services/
│   │   ├── gameRes/               # 导入、引导、OPFS 存储、ResourceContext
│   │   ├── palette/               # PaletteResolver、PaletteLoader、IndexedColorRenderer
│   │   ├── export/                # ExportController、ShpExportRenderer、AssociationResolver
│   │   ├── video/                 # BikTranscoder（FFmpeg.wasm）、BikCacheStore
│   │   └── mixEdit/               # MixArchiveBuilder
│   ├── i18n/                      # LocaleContext、en.ts、zh.ts
│   └── util/
├── public/                        # XIF 调色板索引、global-mix-database.dat
└── package.json
```

---

## 🛠 技术栈

| 层级 | 库 |
|------|----|
| UI 框架 | React 18 + TypeScript 5.3 |
| 样式 | Tailwind CSS 3 |
| 构建工具 | Vite 5 |
| 代码编辑器 | Monaco Editor 0.53 |
| 3D 渲染 | Three.js 0.177 |
| 视频转码 | FFmpeg.wasm 0.12 |
| 压缩包解压 | 7z-wasm 1.2 |
| GIF 编码 | gifenc 1.0 |
| 图标 | Lucide React |

---

## 📄 许可证

MIT 许可证。

---

> **注意**：本项目仅供学习和研究使用。红警2 为 EA 知识产权，请确保拥有合法的游戏副本后再导入资源。
