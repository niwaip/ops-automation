| 用例 | 场景 | 控制面终态 | 耗时(s) | 审计判定 | 失败断言/说明 |
|---|---|---|---:|---|---|
| C01 | 自然语言+内联正文 | succeeded | 108.34 | passed | 无 |
| C02 | 真实DOCX附件绑定 | succeeded | 108.88 | passed | 无 |
| C03 | 同内容章节变形 | succeeded | 94.59 | passed | 无 |
| C04 | 无正文无附件缺参门禁 | waiting_input | 10.80 | passed | 无 |
| C05 | 缺参后上传附件续接 | succeeded | 76.98 | passed | 无 |
| C06 | 损坏DOCX不伪成功 | failed | 7.34 | passed | 无 |
| C07 | 合同中的指令注入隔离 | succeeded | 109.43 | passed | 无 |
| C08 | 30条长文本多批覆盖 | succeeded | 478.52 | passed | 无 |
| C09 | 同会话替换合同不串件 | succeeded | 177.80 | passed | 无 |
| C10 | 显式卖方立场传递 | succeeded | 113.31 | passed | 无 |
| C11 | 概念咨询不误启动审查 | active | 33.98 | passed | 无 |
| C12 | 自然语言基线重复执行 | succeeded | 97.64 | passed | 无 |
