# Codex Efficiency Radar

在 Codex 中查看不同模型、不同推理强度的社区效率分，并在 Windows
或 macOS Codex 模型选择器底部增加“效率”入口。入口展开后以紧凑、无表格线的
模型分组展示“综合 / 工程”双值，点击档位即可应用该组合。

> 本项目不是 OpenAI 官方插件或官方基准。分数来自
> [CodexRadar](https://codexradar.com/) 社区众测数据，适合辅助比较，
> 不代表模型能力上限或性能保证。

## 功能与平台

- 完整安装同时包含正规 Codex 插件与原生选择器增强，缺少任一部分都不视为安装成功；
- 原生选择器增强兼容旧版菜单与新版 simple / advanced 界面，在选择器外层菜单底部提供不与原内容重叠的独立入口；
- 能力面板使用短模型名与紧凑档位块，不展示表格线、模型 ID、英文档位或长说明；有效组合可点击，并复用 Codex 原生模型行与推理控件完成选择；
- “优选”以推理档位为相对成本代理，标记达到该模型峰值双指标均值 95% 的最低档位，不代表真实价格或时延结论；
- 不再向模型或推理强度选项行内追加数值；能力地图底部提供刷新、失败提示与重试；
- 完整版本、平台、架构与 `app.asar` 哈希保护，Codex 更新后先保留原生选择器，并自动同步仓库发布的审核清单；
- Windows 通过 AppUserModelID 和系统打包应用激活接口启动 MSIX，不直接执行 `WindowsApps` 中的 EXE；
- 选择器启动失败时自动熔断并停止拦截，必要时恢复标准 Codex，避免反复关闭客户端；
- 不修改应用安装包、`app.asar`、代码签名、用户对话或 Codex 设置。

Linux 当前没有受支持的 Codex 桌面构建，因此完整安装器会在修改插件状态前明确失败。

## 一键安装

前置条件：Git、Node.js 22+ 和 Codex CLI。`pnpm` 仅用于项目开发，不是安装要求。

macOS：

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

安装器会先校验当前 Codex 构建的精确兼容性，再注册本仓库为 Codex marketplace、
安装正规插件和选择器运行时，自动受控重启 Codex，并核对 Resident 的版本、平台、
兼容目标以及真实模型选择器中的“效率”入口和数值内容。
macOS 选择器运行时位于
`~/Library/Application Support/CodexEfficiencyRadar`，登录启动项位于
`~/Library/LaunchAgents/com.lambertkeith.codex-efficiency-radar.plist`。
Windows 运行时位于 `%USERPROFILE%\.codex\runtimes\codex-efficiency-radar`，
并通过当前用户计划任务 `CodexEfficiencyResident` 在登录时启动。

Resident 会持续识别 Codex 客户端版本。遇到未知更新时，它不会注入、不会终止
正在运行的 Codex，也不会退出；它会定期从本仓库固定的 GitHub HTTPS 地址获取
仅含版本、官方应用身份、`app.asar` 哈希和已知选择器契约的审核清单。条目发布后，
当前原生 Codex 完整退出时会自动以增强模式重开，无需用户重新安装插件。远端清单
不能下发或替换 JavaScript 代码，也不能跳过官方应用身份与精确哈希校验。

安装过程会自动受控重启正在运行的 Codex；若 Codex 尚未运行则自动启动。只有正规插件
已启用、增强模式正在持续运行、真实模型选择器底部已经出现“效率”入口，并且能力面板
至少加载了一组完整的“综合 / 工程”数值对时，安装器才返回成功。`armed`、等待重启、
仅有后台进程或仅有调试端口都不是安装成功，用户无需再手动完成激活步骤。

Windows 安装器会预检系统打包应用激活接口。安装时拦截普通 Codex 时，Resident
会在普通进程仍存活时先实际调用系统激活接口，并确认调试端口可用，再执行一次
受控重启。若任何预检、启动或注入步骤失败，Resident 会写入
`overlay-disabled.json` 后退出，并请求按标准模式恢复 Codex；在重新安装选择器
增强之前不会继续拦截普通 Codex。确认 Codex 可正常启动后，重新运行安装器即可
清除熔断标记并再次启用增强。

`Install.sh` 与 `Install.cmd` 是唯一受支持的完整安装入口。裸
`codex plugin add` 不会创建系统级 LaunchAgent 或计划任务，因此属于不完整安装，
不能被视为本项目安装成功。

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
正规插件仍可使用，选择器暂时回退为原生状态。仓库发布经过审核的新条目后，
Resident 最迟在下一次同步周期自动恢复增强。若官方选择器结构变为未知契约，仍需
发布新的插件代码，系统不会用宽松版本范围或未审核 DOM 猜测强行注入。

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
的哈希检查。若不接受调试端口或后台登录启动项，请不要安装本项目；本项目不再提供
绕过必需选择器增强的成功安装模式。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm check
```

CI 在 Windows、macOS 和 Linux 上运行构建与测试，Windows 额外验证 PowerShell
脚本语法。插件采用 MIT License；CodexRadar 数据及网站内容仍受其各自条款约束。
