---
artifact_type: capability
status: current
updated: 2026-06-17
source_of_truth: src/contexts/AppUpdateContext.tsx
---

# App 更新

## Source Of Truth

- 前端更新状态：`src/contexts/AppUpdateContext.tsx`
- Tauri updater 调用：`src/lib/api/updateApi.ts`
- 左下角更新提示：`src/components/UpdateBadge.tsx`
- 更新弹窗和设置页轻入口：`src/components/AppUpdatePanel.tsx`
- Tauri 插件和权限：`src-tauri/src/lib.rs`、`src-tauri/capabilities/default.json`
- 更新端点和公钥：`src-tauri/tauri.conf.json`

## Current Behavior

Workbench 启动后会静默检查 GitHub Releases 的 updater 元数据。检查失败不会在左下角显示错误；用户手动在设置页检查更新时才展示失败原因。

当检测到新版本时，左下角“本地模式”附近显示更新提示。该提示只是提醒和快捷入口，点击后打开“软件更新”弹窗，不会直接下载、安装或重启。

同一个最新版本首次被发现时，App Shell 会显示一次轻提示，提示中提供“查看更新”入口。已提示版本记录在前端本地状态中，只影响是否重复展示 toast，不影响后续更新检查结果。

“软件更新”弹窗展示当前版本、最新版本、更新说明、发布时间和状态。用户确认后才能下载并安装更新；下载中展示进度，安装完成后需要用户点击重启入口完成更新。

设置页“软件更新”区域只展示简洁状态、手动检查和查看更新入口；主要更新流程不放在设置页长滚动内容中。

如果远程 Release 尚未包含 `latest.json`，手动检查会提示需要先发布带更新产物的 GitHub Release，而不是展示 Tauri updater 的原始英文错误。

## Release Requirements

更新来源为 GitHub Releases：

```text
https://github.com/cuber-hyk/Workbench/releases/latest/download/latest.json
```

发布更新包时必须使用与 `src-tauri/tauri.conf.json` 中 `plugins.updater.pubkey` 匹配的私钥签名。私钥不进入仓库，当前生成位置为：

```text
C:\Users\胡运宽\.workbench\workbench-updater.key
```

私钥密码保存在本机，不进入仓库：

```text
C:\Users\胡运宽\.workbench\workbench-updater-password.txt
```

如果私钥丢失，后续已安装版本将无法验证使用旧公钥签名的新更新包，需要重新规划升级路径。

## Boundaries

- 不自动强制更新。
- 不在普通更新场景使用启动弹窗。
- 不在后台静默重启。
- 不更新 Skills、资源 Radar 条目或项目配置。
- 不把更新失败作为左下角常驻告警。
