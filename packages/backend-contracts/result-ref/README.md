# Result Ref Contract

跨步骤和跨服务只传递稳定引用。消费者必须声明字段投影，默认不能读取完整结果。
过渡期可携带小型 `preview`，完整 payload 由 Control Plane 授权读取。
