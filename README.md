# OCA-Duplex

OCA-Duplex 是一套本地优先的 Codex × Obsidian 知识工作台。它读取用户自己的 Codex 可见对话，按工作目录路由到对应项目，再写入个人 Obsidian Vault。

它不会绑定开发者电脑、Codex 账号或 Vault。每位用户使用自己的 Codex 登录和自己的 Obsidian Vault；开源仓库不包含任何凭据。

## 推荐安装：Windows 桌面版

下载 GitHub Release 中的：

```text
OCA-Duplex_<版本>_x64-setup.exe
```

安装后直接打开 OCA-Duplex，首次启动向导会完成：

1. 选择 Obsidian Vault。
2. 选择纯中文或 English 目录结构。
3. 选择安全模式、手动模式或全部模式。
4. 在安全模式中添加“Codex 工作目录 → Obsidian 项目名”映射。

桌面安装器已经包含 OCA Core sidecar，用户不需要安装 Node.js。

仍需用户自己安装并登录：

- 新版 ChatGPT Windows 桌面应用（包含 Codex），或独立 Codex CLI：用于读取该用户自己的 Codex 任务。
- Obsidian：用于打开和编辑知识库；后台写入本质上是本地 Markdown 文件操作。

桌面应用可以唤起 Obsidian。ChatGPT/Codex 不会被打包进本项目，也不会共享开发者登录状态。OCA-Duplex 只读取本机用户的 Codex 任务，不读取普通 ChatGPT 对话。

### “立即同步”提示无法启动 Codex

OCA-Duplex 需要在当前 Windows 用户的普通桌面权限下启动 `codex.exe` 并读取该用户自己的 `.codex` 状态目录。如果应用是从 Codex 内的本地文件链接直接启动，可能继承只读沙箱权限。

处理方法：

1. 完全退出 OCA-Duplex。
2. 从 Windows 开始菜单或桌面快捷方式重新打开 OCA-Duplex。
3. 确认新版 ChatGPT 桌面应用已登录，且其中的 Codex 能正常打开任务。
4. 再点击“立即同步”。

`0.3.0` 会优先直启 ChatGPT 应用附带的 `codex.exe`，并在设置中显示集成状态和版本；启动权限、缺少运行时和状态目录权限问题会显示为可读诊断，不再显示乱码堆栈。

## 0.3.0 桌面版改进

- 中英文界面与 Vault 目录同步切换，不再只迁移目录而保留中文界面。
- 首次设置页统一对齐并提高字号；右侧检查器扩大并使用可读字号。
- “更多”菜单提供刷新、设置和打开 Obsidian 等真实操作。
- 手动模式会先列出 Codex 任务供用户勾选；安全模式可在设置中管理项目映射。
- 显示 ChatGPT Codex 本地运行时状态，移除外部网页字体依赖。

### 0.3.1 ChatGPT 运行时兼容修复

- 优先使用新版 ChatGPT 在用户目录释放的 Codex 运行时，避免 WindowsApps 受保护副本的启动限制。
- 设置页同时显示运行时版本和实际可执行文件路径，便于诊断多版本冲突。
- 兼容 `codex-cli 0.144.x`，并在 ChatGPT 晚于 OCA-Duplex 启动时提示重启 OCA-Duplex。

## 项目隔离

安全模式使用明确映射，优先级高于标题和关键词：

```text
D:\AI漫剧       → AI漫剧
D:\产品研究     → 产品研究
D:\个人网站     → 个人网站
```

因此同一主题出现在不同工作目录时，也不会被混写进错误项目。

## 纯中文 / 纯英文结构

中文示例：

```text
Vault/
├─ 收件箱/
├─ 项目/
│  └─ OCA-Duplex/
│     ├─ 待整理/
│     ├─ 原始对话/
│     ├─ 学习总结/
│     ├─ 知识库/
│     ├─ 提示词/
│     ├─ 输出成果/
│     ├─ 决策记录/
│     └─ 同步记录/
├─ 全局知识库/
├─ 全局来源/
├─ 全局提示词/
└─ 系统/
```

英文档案使用 `Projects / Conversations / Learning Summaries / Knowledge / Prompts / Outputs / Decisions / Sync Logs`，不会夹杂中文或编号。

语言可切换，但系统会先生成迁移预览并检查冲突；只有明确确认后才移动目录，失败会回滚。

## 内容模型

同一个 Codex 任务采用持续学习模型：

- 一份原始对话：持续追加多轮消息。
- 一份学习总结：更新当前结论，同时保留按轮次排列的学习历程。
- 知识库：区分 `新增 / 更新 / 合并 / 冲突 / 替代`。
- 知识状态：`候选 / 已验证 / 已替代 / 已归档`。
- 决策和输出成果：只有对话中存在对应证据时才生成。

系统不会再为同一任务的每一轮重复制造 Digest、知识和成果副本。

## 三种读取模式

- 安全模式（默认）：只读取明确授权的项目目录。
- 手动模式：用户选择具体 Codex 任务。
- 全部模式：检查最近所有任务，再执行项目路由；适合明确需要集中归档的用户。

模式可以随时切换。全部模式会清楚提示它可能读取多个工作目录中的任务。

## 隐私与可靠性

默认值：

- 只读取用户消息和 Codex 可见回复，不读取隐藏思维链。
- 默认不保存工具执行结果。
- 配置、审计、事务备份和运行状态不提交 Git。
- 写入前显示项目、任务和目标文件预览。
- 每次写入是事务；中途失败会恢复本轮已修改文件。
- 审计日志只保存时间、操作、项目、目标路径、结果和事务编号，不复制对话正文。
- 非 OCA 管理的用户笔记不会被自动覆盖。

## CLI 版

CLI 适合服务器、脚本和高级用户，需要 Node.js 20+：

```powershell
npm install -g oca-duplex
cd D:\YourObsidianVault
oca-duplex init --language zh-CN
oca-duplex doctor
oca-duplex watch
```

常用命令：

```powershell
oca-duplex sync                          # dry-run
oca-duplex sync --write                  # 写入，不提交 Git
oca-duplex sync --write --commit         # 写入并精确提交本轮文件
oca-duplex layout                        # 查看目录档案
oca-duplex layout --language en-US       # 预览语言迁移
oca-duplex layout --language en-US --apply --yes
oca-duplex workspace list
oca-duplex mode safe|manual|all
```

## 从源码开发

核心测试和前端构建：

```powershell
npm ci
npm test
npm --prefix desktop ci
npm --prefix desktop run build
```

Windows 桌面包：

```powershell
npm run build:sidecar
npm --prefix desktop run tauri build
```

Tauri 2 在 Windows 构建时需要 stable Rust、Microsoft C++ Build Tools 和 Windows SDK。最终用户不需要这些开发工具。

## 开源发布

仓库包含 Windows CI 和基于 Git tag 的 Release 工作流。推送 `v*` 标签后，GitHub Actions 会在干净的 Windows 构建机上重新测试、生成 sidecar，并创建 NSIS 安装器草稿。

## 许可

Apache License 2.0。OCA-Duplex 是独立开源项目，不包含 OpenAI Codex、Obsidian、本机账号或用户凭据。
