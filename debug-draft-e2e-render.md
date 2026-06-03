# Debug Session: draft-e2e-render

- Status: OPEN
- Date: 2026-06-03
- Goal: 使用草稿 ID `1febbc18-1f17-4c49-a4b2-9bfb38fffeaf` 执行“草稿 -> 生成代码 -> 渲染”的端到端验证，并定位失败阶段与根因。

## Hypotheses

1. 草稿在生成代码阶段失败，导致后续没有可执行 artifact。
2. 生成代码成功，但 validate-saved-artifact / 运行时校验使用的函数名、输入或超时参数不匹配。
3. 运行时代码已经进入 Carbone 渲染，但传给 `/studio/render-resolved` 的标准数据、模板绑定或 skill/template 解析错误，最终返回 500。
4. 现有 e2e 测试脚本与当前 control-plane / platform / auth 接口契约有漂移，导致并非草稿本身问题。

## Evidence Log

- 待收集。

## Next Step

- 定位现有 e2e 测试脚本与草稿相关接口，使用 `admin/admin123` 认证后复现“草稿 -> 生成代码 -> 渲染”全链路，并记录每一步返回。
