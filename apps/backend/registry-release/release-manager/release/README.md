# Release 主流程

真实实现位于 `../src/release/`。该层承接发布 API、草稿与详情查询、生命周期协调及 Release Manifest 装配。构建放在 `compiler`，发布前校验放在 `validator`，部署与运行时绑定放在 `publisher`，审计放在 `audit`。
