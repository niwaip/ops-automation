-- Backfill the existing weather capability into the standard planning contract.
-- Runtime code remains capability-agnostic; locale/domain vocabulary belongs here.
UPDATE "skill_configs"
SET
  "trigger_keywords" = (
    SELECT jsonb_agg(keyword ORDER BY keyword)
    FROM (
      SELECT DISTINCT jsonb_array_elements_text(
        COALESCE("trigger_keywords", '[]'::jsonb) ||
        '["天气", "查天气", "天气怎么样"]'::jsonb
      ) AS keyword
    ) normalized_keywords
  ),
  "params_schema" = jsonb_set(
    COALESCE("params_schema", '{}'::jsonb),
    '{properties,city,x-enum-aliases}',
    '{
      "Beijing": ["北京", "北京市"],
      "Shanghai": ["上海", "上海市"],
      "Guangzhou": ["广州", "广州市"],
      "Shenzhen": ["深圳", "深圳市"],
      "Hangzhou": ["杭州", "杭州市"],
      "Nanjing": ["南京", "南京市"],
      "Chengdu": ["成都", "成都市"],
      "Wuhan": ["武汉", "武汉市"],
      "Xian": ["西安", "西安市", "Xi''an"],
      "Chongqing": ["重庆", "重庆市"],
      "Tianjin": ["天津", "天津市"],
      "Suzhou": ["苏州", "苏州市"]
    }'::jsonb,
    true
  ),
  "api_endpoints" = jsonb_set(
    COALESCE("api_endpoints", '{}'::jsonb),
    '{runtimeMetadata,routingAliases}',
    '["天气", "查天气", "天气怎么样"]'::jsonb,
    true
  ),
  "updated_at" = NOW()
WHERE "name" = '天气查询'
  AND COALESCE("params_schema"->'properties'->'city'->'enum', '[]'::jsonb) ? 'Shanghai';
