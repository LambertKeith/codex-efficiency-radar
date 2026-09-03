---
name: codex-efficiency-radar
description: 展示或刷新 Codex 模型在各推理强度下的综合智能与软件工程能力效率值，并可在 Windows 或 macOS 上配置原生模型选择器增强。用户询问模型档位智力、效率、IQ、软件工程分、打开效率雷达或安装选择器分数时使用。
---

# Codex 智力效率雷达

使用本插件的 MCP 工具读取 CodexRadar 社区评测数据。

## 工作流

1. 用户要查看、比较模型档位时，调用 `show_efficiency_radar` 显示交互面板。
2. 用户明确要求更新数据时，调用 `refresh_efficiency_values`，并将 `force` 设为 `true`。
3. 不要把社区评测分数描述为 OpenAI 官方基准、保证性能或模型能力上限。
4. 说明“综合智能”由软件工程能力与视觉空间推理 IQ 的算术平均得到。
5. 当结果包含 `warnings` 或 `source.refreshState` 为 `stale` 时，明确指出正在显示最近一次成功快照。
6. 当 `source.refreshState` 为 `cooldown` 时，说明源站返回共享缓存；不要声称刷新重新执行了评测。

## 原生选择器增强

当用户明确要求把分数显示在 Codex 原生模型选择器中时：

1. 先说明这不是 OpenAI 官方 UI 扩展接口，而是可选的 Windows/macOS 运行时增强。
2. 读取插件根目录的 `SECURITY.md`，了解调试端口和版本兼容边界。
3. 定位本技能目录的祖先插件根目录：Windows 运行
   `scripts/install-selector-overlay.ps1`，macOS 运行
   `node scripts/install-selector-overlay.mjs`；其他平台明确说明不支持选择器增强。
4. 创建当前用户登录启动项、启用后台进程或重启 Codex 都属于本机状态修改；执行前明确告诉用户将发生什么，并获得确认。
5. 安装器返回代码 `2` 时，说明当前 Codex 版本尚未审核；不要绕过 `compatibility.json`。已安装 `0.5.0+` Resident 的机器会保持原生选择器并自动同步本仓库发布的审核清单；清单匹配后，在当前 Codex 完整退出时自动恢复增强，无需重新安装。
6. Windows 安装器会预检打包应用激活接口；安装期间不会结束正在运行的普通 Codex。后续 Resident 只有在实际激活预检和端口检查都成功后才执行一次受控重启。启动或注入失败时会安全熔断并恢复标准 Codex，不要删除或绕过 `overlay-disabled.json` 后继续强制启动。
7. 安装成功后提醒用户完整退出并重新打开 Codex，然后在模型选择器外层菜单底部验证“效率”按钮；展开后应看到按模型与推理档位组织的紧凑能力面板，刷新按钮位于面板底部。有效组合可点击，并通过 Codex 原生模型行与推理控件生效。旧版菜单与新版滑杆/列表选择器都保留兼容，不再向原生选项行内追加数值徽标。
8. “优选”只表示：以推理档位为相对成本代理，达到同模型峰值双指标均值 95% 的最低档。数据没有价格或时延字段，不要将该标记描述为真实费用性价比。
9. 用户要求卸载时，Windows 运行 `scripts/uninstall-selector-overlay.ps1`，
   macOS 运行 `node scripts/uninstall-selector-overlay.mjs`，再提醒其重启 Codex。
10. 自动兼容同步只接受固定 GitHub HTTPS 地址、官方应用身份、完整 `app.asar` 哈希和已实现的选择器契约；若官方 DOM 变为未知契约，必须更新插件代码，不得通过宽松版本范围或本地自批准强行启用。

## 工具选择

- `show_efficiency_radar`：首次打开面板或切换到指定模型。
- `refresh_efficiency_values`：主动重新核对第三方数据源。
