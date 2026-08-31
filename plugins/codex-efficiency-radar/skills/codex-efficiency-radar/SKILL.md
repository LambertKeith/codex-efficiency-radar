---
name: codex-efficiency-radar
description: 展示或刷新 Codex 模型在各推理强度下的综合智能与软件工程能力效率值，并可在 Windows 上配置原生模型选择器增强。用户询问模型档位智力、效率、IQ、软件工程分、打开效率雷达或安装选择器分数时使用。
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

## Windows 选择器增强

当用户明确要求把分数显示在 Codex 原生模型选择器中时：

1. 先说明这不是 OpenAI 官方 UI 扩展接口，而是可选的 Windows 运行时增强。
2. 读取插件根目录的 `SECURITY.md`，了解调试端口和版本兼容边界。
3. 定位本技能目录的祖先插件根目录，并运行 `scripts/install-selector-overlay.ps1`。
4. 创建当前用户登录启动项、启用后台进程或重启 Codex 都属于本机状态修改；执行前明确告诉用户将发生什么，并获得确认。
5. 安装器返回代码 `2` 时，说明当前 Codex 版本尚未审核；不要绕过 `compatibility.json`。
6. 安装成功后提醒用户完整退出并重新打开 Codex，然后在“模型 → 推理强度”中验证。
7. 用户要求卸载时，运行 `scripts/uninstall-selector-overlay.ps1`，再提醒其重启 Codex。

## 工具选择

- `show_efficiency_radar`：首次打开面板或切换到指定模型。
- `refresh_efficiency_values`：主动重新核对第三方数据源。
