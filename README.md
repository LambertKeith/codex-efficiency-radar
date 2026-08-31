# Codex Efficiency Radar

在 Codex 中查看不同模型、不同推理强度的社区效率分，并可选地把
`综`（综合智能）与 `工`（软件工程能力）直接显示在 Windows Codex
原生推理强度菜单中。

> 本项目不是 OpenAI 官方插件或官方基准。分数来自
> [CodexRadar](https://codexradar.com/) 社区众测数据，适合辅助比较，
> 不代表模型能力上限或性能保证。

## 功能

- Codex 正规插件：交互面板、模型对比、实时刷新；
- Windows 选择器增强：每个推理档位同一行显示 `综/工` 分数；
- “刷新效率值”菜单项；
- 完整版本与 `app.asar` 哈希保护，Codex 更新后默认拒绝不兼容注入；
- 一键安装、一键卸载；
- 不修改 Microsoft Store 安装包、签名或用户对话数据。

## 一键安装（Windows）

前置条件：

- Windows 10/11；
- Microsoft Store 版 Codex/ChatGPT 桌面应用；
- Git、Node.js 22+ 和 Codex CLI；
- 当前 Codex 版本已列入
  [`compatibility.json`](plugins/codex-efficiency-radar/windows-overlay/compatibility.json)。

```powershell
git clone https://github.com/LambertKeith/codex-efficiency-radar.git
cd codex-efficiency-radar
.\Install.cmd
```

也可以克隆仓库后双击 `Install.cmd`。

安装器会：

1. 校验仓库内已构建的 MCP 服务器；
2. 注册本仓库为 Codex marketplace；
3. 安装 `codex-efficiency-radar` 插件；
4. 将选择器运行时复制到 `%LOCALAPPDATA%\CodexEfficiencyRadar`；
5. 在当前用户“启动”目录创建隐藏常驻入口，并立即启动增强进程。

安装过程不会强制关闭正在使用的 Codex。完成后请完整退出并重新打开
Codex 一次，然后打开“模型 → 推理强度”。

只安装正规插件、不启用原生选择器增强：

```powershell
.\Install.cmd -PluginOnly
```

## 通过 Codex 快速配置

先把 GitHub 仓库添加为 marketplace 并安装插件：

```powershell
codex plugin marketplace add LambertKeith/codex-efficiency-radar
codex plugin add codex-efficiency-radar@codex-efficiency-radar
```

重新打开一个 Codex 任务，然后告诉 Codex：

```text
请使用 codex-efficiency-radar，为我安装 Windows 原生模型选择器增强。
先说明将创建的登录启动项、后台进程和安全边界，得到我的确认后再执行。
```

插件自带的 Skill 会读取安全说明、检查兼容版本，并调用随包安装脚本。
这一步会创建当前用户登录启动项并启动后台进程，因此 Codex 应在实际修改前
获得用户确认。

## 更新

本地克隆安装：

```powershell
git pull --ff-only
.\Install.cmd
```

Marketplace 安装：

```powershell
codex plugin marketplace upgrade codex-efficiency-radar
codex plugin add codex-efficiency-radar@codex-efficiency-radar
```

选择器增强使用精确兼容白名单。Codex 客户端更新后，如果版本或哈希变化，
正规插件仍可使用，但选择器增强会保持关闭，直到仓库增加经过审核的新条目。

## 卸载

```powershell
.\Uninstall.cmd
```

请先完整退出所有 Codex 窗口，避免正在运行的 MCP 进程占用插件缓存。
它会移除登录启动项、后台进程、稳定运行时目录、已安装插件和本仓库 marketplace。
完成后重启 Codex 即可恢复标准选择器。

## 数据口径

- `工`：CodexRadar 软件工程能力 IQ；
- `综`：软件工程能力 IQ 与视觉空间推理 IQ 的算术平均值；
- “刷新”表示重新请求第三方数据源，不表示重新运行评测；
- 源站返回缓存或刷新失败时，插件会标记 `cooldown` 或 `stale` 状态。

## 仓库结构

```text
.agents/plugins/marketplace.json       Codex marketplace
plugins/codex-efficiency-radar/        正规插件、MCP、Skill
  windows-overlay/                     Windows 选择器运行时
scripts/install.ps1                    一键安装编排
scripts/uninstall.ps1                  一键卸载编排
```

## 安全与隐私

选择器增强不是公开的原生 UI 扩展接口。它通过仅监听
`127.0.0.1` 的 Chromium 调试端口连接 Codex 页面，并在运行时增加 DOM
节点。详细风险、兼容保护和卸载边界见
[`SECURITY.md`](plugins/codex-efficiency-radar/SECURITY.md)。

请勿删除或绕过 `compatibility.json` 的哈希检查。若你不接受调试端口或后台
启动项，只使用 `-PluginOnly` 模式。

## 开发

```powershell
pnpm install --frozen-lockfile
pnpm check
```

插件采用 MIT License。CodexRadar 数据及网站内容仍受其各自条款约束。
