"""Optional commercial metric vocabulary; no Excel-specific bindings."""

VERSION = "1"
METRICS = [{'name': '订单金额',
  'patterns': ['订单金额', '订单总额', '成交金额'],
  'expected_type': 'number',
  'id': 'commerce.order_amount'},
 {'name': '销售总额',
  'patterns': ['销售总额', '销售额', '总销额'],
  'expected_type': 'number',
  'id': 'commerce.sales_amount'},
 {'name': '库存金额',
  'patterns': ['库存金额', '库存成本', '存货价值'],
  'expected_type': 'number',
  'id': 'commerce.inventory_value'}]
CONCEPTS = []
GUIDANCE = "订单、销售与库存指标必须绑定实际来源字段；不可套用财务盈利能力指标。"
