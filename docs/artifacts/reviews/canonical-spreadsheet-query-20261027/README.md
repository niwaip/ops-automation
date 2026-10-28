# SQL式表格查询优化验证

保留WHERE、GROUP BY、HAVING、前缀条件、排序、分页、去重与原生执行证据能力。

- `aggregate_spreadsheet`面向模型只接收`file_path + query`，提供结构化、递归谓词JSON Schema。
- 纯明细只开放结构读取和查询工具，使用简短明细提示词；默认返回原始列及`_row`。
- 派生公式由独立的`analyze_spreadsheet`工具使用tables/calculations；旧参数仍由执行器兼容。
- 明细门禁拒绝分组汇总和未请求去重，即使查询成功且各组恰好只有一条记录。

验证结果：

- 11个相关测试模块共203项通过，包含SQL执行链、明细、派生公式、领域、完成门禁及更新工具兼容性。
- 使用仓库已有Ajv验证18个正反Schema请求，全部符合预期；没有新增运行时依赖。
- 通过仓库根目录`./docker/start-smart.sh dev exec -T session-broker ...`在原用户沙箱启动新Python进程验证。
- 真实杨烨原件返回6条、18个原始字段及来源行号176—181，明细门禁通过。
- 原20:22回合的分组结果现被拒绝，返回`detail_granularity_changed`。
- 5个容器运行模块与当前源码SHA-256一致，原件哈希未变，没有调用新模型或修改原会话。

运行模式：源码目录只读绑定至沙箱，每次dsh命令启动新Python进程。本次以实际挂载、新进程导入与运行指纹确认生效，不需要重启长期运行的Broker或中断用户沙箱。

证据：[单元测试](unittest.log)、[JSON Schema验证](schema-checks.json)、[运行时验证](runtime-verification.json)。

该验证证明接口和确定性执行路径已落地；未重新调用LLM，因此没有声称模型耗时或重试率已降低。
