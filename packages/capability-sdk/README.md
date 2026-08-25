# Capability Pack SDK

企业业务能力接入的最小稳定边界。业务包通过 Manifest、冻结合同和 Runtime Adapter
接入，不修改 Control Plane 的中央路由分支。

`certified`/`production` Manifest 会强制校验版本、合同摘要、正反向路由样例、风险、
Owner、Runbook、幂等声明和 Runtime Probe；`production` 还要求 SLO、资源预算、
Canary 证据与回滚版本。
