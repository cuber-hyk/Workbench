---
artifact_type: capability
status: current
created: 2026-06-15
updated: 2026-06-20
source_of_truth: src-tauri/src/radar.rs
---

# 资源 Radar

资源 Radar 用一套本地资源 CRUD 管理手动条目和外部来源条目。当前外部来源只有 GitHub Stars，通过用户主动点击同步，依赖本机 `gh` CLI 当前认证账号。

## 当前能力

- 手动新增、编辑、删除、搜索、筛选、收藏和打开资源链接。
- 通过 `gh api user/starred --paginate` 手动同步 GitHub Stars。
- 点击同步 GitHub Stars 时检查本机 GitHub CLI 状态，未配置或未登录时通过右下角提示说明原因并提示 `gh auth login`。
- 按资源类型、领域、来源、语言、收藏、来源状态和重复状态筛选。
- 展示 GitHub 仓库语言、Topics、Stars 数量、来源描述和来源有效状态。
- 为资源维护单选领域 `domain`，默认 `未分类`。
- GitHub Stars URL 唯一匹配手动资源时自动合并来源。
- 多条手动资源匹配同一个 GitHub repo 时创建待处理重复组，由用户选择主资源后合并。

## 数据所有权

- 用户字段：资源类型、领域、用户标签、备注和收藏状态。
- 来源字段：名称、URL、来源描述、语言、Topics、Stars 数量、仓库更新时间、来源有效状态和最后同步时间。
- GitHub 同步只更新来源字段，不覆盖用户字段；URL 唯一匹配手动资源时保留手动资源的用户字段。
- GitHub Topics 用于展示和筛选，但不写入用户标签。
- 手动来源资源不允许保存与另一条手动来源资源相同的规范化 URL。

## 同步规则

- GitHub Stars 使用 `source = github_star` 和 `external_id = owner/repo` 唯一识别。
- 完整拉取和解析成功后，所有数据库变更在单次事务中执行。
- 重复同步不会创建重复资源。
- 没有已有 GitHub 来源资源时，按规范化 GitHub repo URL 查找手动资源。
- 唯一 URL 匹配时把 GitHub Stars 来源挂到该手动资源，来源列表变为 `manual + github_star`。
- 多个 URL 匹配时创建或更新打开状态重复组，不自动选择主资源。
- 名称相似但 URL 不同不触发自动合并。
- 取消 Star 只将来源标记为失效，不删除本地资源；再次 Star 后恢复有效。

## 合并规则

- 用户从重复组候选中选择主资源。
- 主资源保留自己的资源类型和领域。
- 来源列表合并，GitHub 来源描述和元数据写入主资源。
- 用户标签去重合并。
- 副资源备注追加到主资源备注后。
- 收藏状态取 OR。
- 副资源删除，重复组标记为 `resolved`。

## 边界

- 不做后台抓取、定时同步、LLM 分类、摘要或评分。
- 不在 Workbench 中保存 GitHub Token。
- 不自动安装 GitHub CLI。
- 不因来源失效自动删除用户资源。

## 验证

- Rust 测试覆盖旧表升级、手动 CRUD、重复同步、用户字段保护、取消与恢复 Star。
- Rust 测试覆盖 URL 唯一匹配自动合并、多候选重复组、名称相似不合并和重复组合并规则。
- Rust 测试覆盖 GitHub CLI 登录状态分类。
- 前端测试覆盖类型、领域、来源、语言、重复状态筛选、GitHub CLI 缺失提示、同步入口、同步中防重复触发和来源失效文字提示。
