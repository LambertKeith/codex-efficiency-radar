# Codex Efficiency Radar

在 Codex 中查看不同模型、不同推理强度的社区效率分，并可选地在 Windows
或 macOS Codex 模型选择器底部增加“查看效率地图”入口。入口展开后以模型能力带
和推理档位卡片展示“综合智能”与“软件工程”两项数值，点击卡片即可应用该组合。

> 本项目不是 OpenAI 官方插件或官方基准。分数来自
> [CodexRadar](https://codexradar.com/) 社区众测数据，适合辅助比较，
> 不代表模型能力上限或性能保证。

## 功能与平台

- 正规 Codex 插件：Windows、macOS、Linux 均可安装，提供交互面板、模型对比和实时刷新；
- 原生选择器增强：兼容旧版菜单与新版 simple / advanced 界面，在选择器外层菜单底部提供不与原内容重叠的独立入口；
- 能力地图弱化传统表格线框；有效组合可点击，并复用 Codex 原生模型行与推理控件完成选择；
- “优选”以推理档位为相对成本代理，标记达到该模型峰值双指标均值 95% 的最低档位，不代表真实价格或时延结论；
- 不再向模型或推理强度选项行内追加数值；能力地图底部提供刷新、失败提示与重试；
- 完整版本、平台、架构与 `app.asar` 哈希保护，Codex 更新后默认拒绝未知构建；
- Windows 通过 AppUserModelID 和系统打包应用激活接口启动 MSIX，不直接执行 `WindowsApps` 中的 EXE；
- 选择器启动失败时自动熔断并停止拦截，必要时恢复标准 Codex，避免反复关闭客户端；
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
Windows 运行时位于 `%USERPROFILE%\.codex\runtimes\codex-efficiency-radar`，
并通过当前用户计划任务 `CodexEfficiencyResident` 在登录时启动。

安装不会中断或强制关闭安装时正在运行的 Codex。安装器若检测到主进程仍存活，
会明确提示完整退出；Resident 会在确认主进程结束后启动增强模式。然后打开
任意模型选择器，验证底部的“查看效率地图”按钮及展开后的能力地图。

Windows 安装器会预检系统打包应用激活接口。后续拦截普通 Codex 时，Resident
会在普通进程仍存活时先实际调用系统激活接口，并确认调试端口可用，再执行一次
受控重启。若任何预检、启动或注入步骤失败，Resident 会写入
`overlay-disabled.json` 后退出，并请求按标准模式恢复 Codex；在重新安装选择器
增强之前不会继续拦截普通 Codex。确认 Codex 可正常启动后，重新运行安装器即可
清除熔断标记并再次启用增强。

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

- “软件工程”：CodexRadar 软件工程能力 IQ；
- “综合智能”：软件工程能力 IQ 与视觉空间推理 IQ 的算术平均值；
- “优选”：仅以推理档位作为相对成本代理，取达到同模型峰值双指标均值 95% 的最低档；数据不包含价格与时延，不能据此推断真实费用性价比；
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
