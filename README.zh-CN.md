# Chromex

[![CI](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml/badge.svg)](https://github.com/GENEXIS-AI/chromex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/GENEXIS-AI/chromex?style=social)](https://github.com/GENEXIS-AI/chromex/stargazers)
[![English](https://img.shields.io/badge/readme-English-111827.svg)](./README.md)
[![한국어](https://img.shields.io/badge/readme-한국어-2563eb.svg)](./README.ko.md)
[![日本語](https://img.shields.io/badge/readme-日本語-dc2626.svg)](./README.ja.md)
[![简体中文](https://img.shields.io/badge/readme-简体中文-16a34a.svg)](./README.zh-CN.md)

Chromex 是一个 Chrome MV3 侧边栏助手，通过本地 native bridge 将 Chrome 连接到 Codex。它可以处理当前页面、已选择的标签页、上传文件、语音输入、图片和浏览器工作流，同时避免把凭据存入扩展存储。

Published by **GenexisAI CHOI**.

![Chromex browser side-panel assistant](./assets/chromex-hero.png)

## Star History

<a href="https://www.star-history.com/#GENEXIS-AI/chromex&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=GENEXIS-AI/chromex&type=Date" />
  </picture>
</a>

## 功能概览

- 在用户请求时，基于当前网页、已选择的打开标签页、截图、上传文件、PDF、Office 文件、图片和浏览器历史进行对话。
- 总结和比较页面内容、YouTube 视频、新闻文章、研究页面、PDF 和 arXiv 论文。
- 通过 Codex 图片工作流编辑或生成图片，并在本地处理输出。
- 支持语音转写、实时语音模式、页面感知建议、自定义配置文件和可选 Codex skills。
- 通过 Chrome content scripts 执行浏览器控制工作流，并在页面内显示可见的活动状态。

## 5 分钟安装

普通用户最快路径:

1. 打开 [latest GitHub Release](https://github.com/GENEXIS-AI/chromex/releases/latest)。
2. 从 release assets 下载 [`chromex-unpacked-extension.zip`](https://github.com/GENEXIS-AI/chromex/releases/latest/download/chromex-unpacked-extension.zip)。
3. 解压 ZIP。
4. 在 Chrome 中打开 `chrome://extensions`。
5. 启用 **Developer mode**。
6. 点击 **Load unpacked**，选择解压后的 `chromex-extension` 文件夹。
7. 从 Chrome 工具栏或侧边栏打开 Chromex，并按引导完成设置。

Release ZIP 文件会附加在 GitHub Releases 中，不会直接提交到仓库文件树。如果直接下载链接无法打开，请进入 [latest release page](https://github.com/GENEXIS-AI/chromex/releases/latest)，在 **Assets** 中下载 `chromex-unpacked-extension.zip`。

扩展 ZIP 只安装 Chrome UI。本地 bridge 还需要从源码 checkout 或 `chromex-public-source.zip` 中单独安装一次。

开发者源码安装:

```bash
git clone https://github.com/GENEXIS-AI/chromex.git
cd chromex
npm install
npm run build
node scripts/install-native-host.mjs
```

然后打开 `chrome://extensions`，启用 **Developer mode**，点击 **Load unpacked**，选择:

```text
packages/extension/dist
```

### Windows 本地 Bridge 设置

在 Windows 上，请先安装 Node.js 20 LTS 或更新版本，然后先安装并确认 Codex CLI:

```powershell
npm install -g @openai/codex
codex --version
```

然后在 `chromex` 源码文件夹中用 **PowerShell** 运行:

```powershell
npm install
npm run build
node scripts/install-native-host.mjs --browser=chrome
```

然后打开 `chrome://extensions`，点击 Chromex 的 **Reload**，再在 Chromex 侧边栏中点击 **Check connection**。

如果侧边栏仍显示正在等待本地 bridge:

1. 确认 Chromex 是从 release 的 `chromex-extension` 文件夹或 `packages/extension/dist` 加载的。
2. 复制 `chrome://extensions` 中 Chromex 卡片显示的 extension ID。
3. 用该 ID 重新运行安装器。

```powershell
node scripts/install-native-host.mjs <extension-id> --browser=chrome
```

公开 release 的预期 ID 是 `menmlhahmendmkiicbjihgjhppkgaeom`。如果 Chrome 显示不同 ID，请使用 Chrome 中显示的 ID。

如果登录时出现 `Failed to start codex app-server`，说明 Chromex 已连接到本地 bridge，但无法启动 Codex CLI。请再次运行 `codex --version`。如果 Windows 找不到 Codex，请将 optional Codex binary path 设置为 `%APPDATA%\npm\codex.cmd`，或将文件夹设置为 `%APPDATA%\npm`。workspace 文件夹和 Codex executable path 是两个不同设置，不要把项目文件夹填到 Codex binary 字段。

## 运行时边界

Chromex 使用以下边界:

```text
Chrome Extension -> Native Messaging Host -> Local Bridge -> codex app-server
```

源码树结构:

- `packages/extension`: Chrome MV3 侧边栏扩展
- `packages/bridge`: 面向 Codex app-server 和多模态工作流的本地 bridge daemon
- `packages/native-host`: Chrome Native Messaging relay
- `packages/shared`: 共享类型、策略、配置文件和辅助函数

## 语言支持

Chromex 默认自动跟随浏览器语言。用户也可以在 **Settings > General > App UI language** 中手动选择语言。

扩展内置 Chrome `_locales`，覆盖英语、韩语、日语、中文、阿拉伯语、法语、德语、西班牙语、葡萄牙语、印地语、越南语、泰语、土耳其语、乌克兰语以及许多其他 Chrome 兼容 locale。除非用户要求其他语言，模型回复会被指示遵循所选 UI 语言。

## 安全和隐私默认设置

- 扩展不会把原始 OpenAI API key、OAuth token 或 ChatGPT session token 存入 Chrome extension storage。
- Codex OAuth / ChatGPT 登录通过本地 Codex app-server 流程处理。
- API key 登录是可选的本地 fallback，不会在没有用户确认的情况下自动使用。
- 页面内容、标签页数据、截图、浏览器历史、麦克风输入和浏览器操作只会用于用户请求的工作流。
- `history`、`tabs`、屏幕捕获、麦克风和站点访问权限只在功能需要时请求。
- 对话历史默认仅限当前会话。持久化本地聊天历史需要用户主动开启。
- Native host 子进程和 workspace hooks 使用收窄的环境变量 allowlist 运行。
- 生成图片原始文件、临时上传和诊断信息由本地 bridge 处理。

发布或部署修改后的构建前，请阅读 [SECURITY.md](./SECURITY.md) 和 [PRIVACY.md](./PRIVACY.md)。

## 特性

- 以聊天为中心的持久 MV3 侧边栏
- 自动路由页面、文件、图片、历史、语音和浏览器控制请求
- 用于选择一个或多个打开标签页的 `@` picker
- 用于选择配置文件的 `/` picker
- 支持图片、文本、PDF、DOCX、CSV、TSV、XLSX 和 XLSM 附件
- 面向 DOM、vision、hybrid 和 site-adapter 工作流的读取策略
- 面向 YouTube、新闻、研究、邮件、协作、笔记、任务工具、购物、旅行和韩国工作服务的站点感知建议
- YouTube adapter 支持当前时间戳上下文和跳转动作
- 针对上传图片、页面图片或可见屏幕截图的非破坏式图片编辑
- 支持代码块、表格、链接和复制控件的 Markdown 渲染
- 仅在用户启用时加载本地 `.codex/skills/*/SKILL.md` 中的可选 Codex skills

## 开发

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run release:audit
```

可选浏览器 smoke test:

```bash
npm run smoke
```

如果没有兼容浏览器，先安装 Playwright Chromium runtime:

```bash
npm run smoke:install-browser
```

构建后的扩展会输出到:

```text
packages/extension/dist
```

## 发布管理

Chromex 从 `0.1.1` 开始使用普通开源发布历史。版本策略、pull request 流程和发布检查清单见 [RELEASE.md](./RELEASE.md)。

## 故障排查

- **Native host missing or forbidden**: 运行 `npm run build`，然后运行 `node scripts/install-native-host.mjs --browser=chrome`，在 `chrome://extensions` 中重新加载扩展，并检查 Chromex onboarding/system status。如果 Chrome 显示不同 extension ID，请运行 `node scripts/install-native-host.mjs <extension-id> --browser=chrome` 重新安装。
- **模型列表无法加载**: 确认 native bridge 已连接，然后通过 app-server-backed 登录流程登录。
- **页面上下文不可用**: 从目标标签页打开 Chromex，或批准工作流请求的 Chrome 站点权限。
- **Chrome 仍显示旧 UI**: 运行 `npm run build`，重新加载扩展卡片，并确认 Chrome 正在加载 `packages/extension/dist`。
- **浏览器 smoke test 因没有浏览器而失败**: 先运行 `npm run smoke:install-browser`，再运行 `npm run smoke`。

## 许可证

MIT. 见 [LICENSE](./LICENSE)。
