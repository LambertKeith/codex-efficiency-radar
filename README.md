# Codex Efficiency Radar

在 Codex 中查看不同模型、不同推理强度的社区效率分，并可选地把
`综`（综合智能）与 `工`（软件工程能力）直接显示在 Windows 或 macOS
Codex 原生推理强度菜单中。

> 本项目不是 OpenAI 官方插件或官方基准。分数来自
> [CodexRadar](https://codexradar.com/) 社区众测数据，适合辅助比较，
> 不代表模型能力上限或性能保证。

## 功能与平台

- 正规 Codex 插件：Windows、macOS、Linux 均可安装，提供交互面板、模型对比和实时刷新；
- 原生选择器增强：支持已进入精确兼容白名单的 Windows 和 macOS Codex 构建；
- 完整版本、平台、架构与 `app.asar` 哈希保护，Codex 更新后默认拒绝未知构建；
- 不修改应用安装包、`app.asar`、代码签名、用户对话或 Codex 设置。

Linux 当前没有受支持的 Codex 桌面构建，因此安装器只安装正规插件，不启用选择器增强。

## 一键安装

前置条件：Git、Node.js 22+、pnpm 10+ 和 Codex CLI。

macOS / Linux：

```sh
git clone https://github.com/LambertKeith/codex-efficiency-radar.git
cd codex-efficiency-radar
./Install.sh
```

Windows：

```powershell
git clone https://github.com/LambertKeith/codex-efficiency-radar.git
cd codex-efficiency-radar
.\Install.cmd
```

安装器会校验 MCP 服务器、注册本仓库为 Codex marketplace、安装正规插件，
并在受支持平台上安装选择器运行时。macOS 选择器运行时位于
`~/Library/Application Support/CodexEfficiencyRadar`，登录启动项位于
`~/Library/LaunchAgents/com.lambertkeith.codex-efficiency-radar.plist`。
Windows 运行时仍位于 `%LOCALAPPDATA%\CodexEfficiencyRadar`。

安装不会中断当前 Codex。完成后请完整退出并重新打开 Codex，然后打开
“模型 → 推理强度”验证徽标。

只安装正规插件：

```sh
./Install.sh --plugin-only
```

```powershell
.\Install.cmd -PluginOnly
```

也可直接通过 Codex CLI 安装：

```sh
codex plugin marketplace add LambertKeith/codex-efficiency-radar
codex plugin add codex-efficiency-radar@codex-efficiency-radar
```

## 更新与卸载

本地克隆更新：

```sh
git pull --ff-only
./Install.sh
```

Windows 将最后一行替换为 `.\Install.cmd`。

卸载：

```sh
./Uninstall.sh
```

```powershell
.\Uninstall.cmd
```

卸载选择器增强后请重启 Codex。选择器增强使用精确兼容白名单；客户端更新后，
正规插件仍可使用，但增强会保持关闭，直到仓库增加经过审核的新条目。

## 数据口径

- `工`：CodexRadar 软件工程能力 IQ；
- `综`：软件工程能力 IQ 与视觉空间推理 IQ 的算术平均值；
- “刷新”表示重新请求第三方数据源，不表示重新运行评测；
- 源站返回缓存或刷新失败时，插件会标记 `cooldown` 或 `stale` 状态。

## 安全与隐私

选择器增强不是公开的原生 UI 扩展接口。它通过仅监听 `127.0.0.1` 的
Chromium 调试端口连接 Codex 页面，并在运行时增加 DOM 节点。详细风险、兼容
保护和卸载边界见
[`SECURITY.md`](plugins/codex-efficiency-radar/SECURITY.md)。

请勿删除或绕过
[`compatibility.json`](plugins/codex-efficiency-radar/windows-overlay/compatibility.json)
的哈希检查。若不接受调试端口或后台登录启动项，请使用 plugin-only 模式。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm check
```

CI 在 Windows、macOS 和 Linux 上运行构建与测试，Windows 额外验证 PowerShell
脚本语法。插件采用 MIT License；CodexRadar 数据及网站内容仍受其各自条款约束。
