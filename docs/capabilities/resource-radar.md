---
artifact_type: capability
status: current
created: 2026-06-15
updated: 2026-06-15
source_of_truth: src-tauri/src/radar.rs
---

# 资源 Radar

资源 Radar 用一套本地资源 CRUD 管理手动条目和外部来源条目。当前外部来源只有 GitHub Stars，通过用户主动点击同步，依赖本机 `gh` CLI 当前认证账号。

## 当前能力

- 手动新增、编辑、删除、搜索、筛选、收藏和打开资源链接。
- 通过 `gh api user/starred --paginate` 手动同步 GitHub Stars。
- 按资源类型、来源和标签筛选。
- 展示 GitHub 仓库语言、Topics、Stars 数量、来源描述和来源有效状态。

## 数据所有权

- 用户字段：资源类型、用户标签、备注和收藏状态。
- 来源字段：名称、URL、来源描述、语言、Topics、Stars 数量、仓库更新时间、来源有效状态和最后同步时间。
- GitHub 同步只更新来源字段，不覆盖用户字段。
- GitHub Topics 用于展示和筛选，但不写入用户标签。

## 同步规则

- GitHub Stars 使用 `source = github_star` 和 `external_id = owner/repo` 唯一识别。
- 完整拉取和解析成功后，所有数据库变更在单次事务中执行。
- 重复同步不会创建重复资源。
- 取消 Star 只将来源标记为失效，不删除本地资源；再次 Star 后恢复有效。
- 手动资源使用 `source = manual`，不参与 GitHub Stars 同步。

## 边界

- 不做后台抓取、定时同步、LLM 分类、摘要或评分。
- 不在 Workbench 中保存 GitHub Token。
- 不因来源失效自动删除用户资源。

## 验证

- Rust 测试覆盖旧表升级、手动 CRUD、重复同步、用户字段保护、取消与恢复 Star。
- 前端测试覆盖来源筛选、同步入口、同步中防重复触发和来源失效文字提示。
