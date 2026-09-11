CREATE TABLE "task_policy_sets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL,
  "scope_type" VARCHAR(32) NOT NULL,
  "scope_id" VARCHAR(128) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "policy_json" JSONB NOT NULL DEFAULT '{}',
  "digest" VARCHAR(64) NOT NULL,
  "created_by" UUID,
  "published_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_policy_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_command_aliases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_set_id" UUID NOT NULL,
  "canonical_command" VARCHAR(64) NOT NULL,
  "alias" VARCHAR(120) NOT NULL,
  "match_type" VARCHAR(16) NOT NULL DEFAULT 'phrase',
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "source" VARCHAR(32) NOT NULL DEFAULT 'admin',
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "evidence_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_command_aliases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_recipes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_set_id" UUID NOT NULL,
  "recipe_key" VARCHAR(100) NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "required_commands_json" JSONB NOT NULL DEFAULT '[]',
  "optional_commands_json" JSONB NOT NULL DEFAULT '[]',
  "trigger_json" JSONB NOT NULL DEFAULT '{}',
  "steps_json" JSONB NOT NULL DEFAULT '[]',
  "bindings_json" JSONB NOT NULL DEFAULT '[]',
  "completion_claims_json" JSONB NOT NULL DEFAULT '[]',
  "risk_level" VARCHAR(8) NOT NULL DEFAULT 'L0',
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_capability_bindings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_set_id" UUID NOT NULL,
  "capability_role" VARCHAR(64) NOT NULL,
  "capability_id" VARCHAR(255) NOT NULL,
  "capability_version" VARCHAR(100),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "input_mapping_json" JSONB NOT NULL DEFAULT '{}',
  "output_mapping_json" JSONB NOT NULL DEFAULT '{}',
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_capability_bindings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_policy_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_set_id" UUID,
  "proposal_type" VARCHAR(32) NOT NULL,
  "scope_type" VARCHAR(32) NOT NULL,
  "scope_id" VARCHAR(128) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'candidate',
  "patch_json" JSONB NOT NULL,
  "evidence_json" JSONB NOT NULL DEFAULT '[]',
  "confidence" DOUBLE PRECISION NOT NULL,
  "proposed_by" VARCHAR(32) NOT NULL DEFAULT 'llm',
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_policy_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_policy_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_set_id" UUID,
  "actor_user_id" UUID,
  "action" VARCHAR(64) NOT NULL,
  "detail_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_policy_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution_completion_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "execution_id" UUID NOT NULL,
  "step_id" UUID,
  "plan_node_id" VARCHAR(255),
  "claim" VARCHAR(100) NOT NULL,
  "evidence_type" VARCHAR(32) NOT NULL,
  "evidence_json" JSONB NOT NULL DEFAULT '{}',
  "status" VARCHAR(16) NOT NULL DEFAULT 'satisfied',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "execution_completion_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_policy_sets_scope_type_scope_id_version_key"
  ON "task_policy_sets"("scope_type", "scope_id", "version");
CREATE INDEX "task_policy_sets_scope_type_scope_id_status_idx"
  ON "task_policy_sets"("scope_type", "scope_id", "status");
CREATE INDEX "task_policy_sets_status_published_at_idx"
  ON "task_policy_sets"("status", "published_at" DESC);
CREATE UNIQUE INDEX "task_command_aliases_policy_set_id_canonical_command_alias_key"
  ON "task_command_aliases"("policy_set_id", "canonical_command", "alias");
CREATE INDEX "task_command_aliases_canonical_command_status_idx"
  ON "task_command_aliases"("canonical_command", "status");
CREATE UNIQUE INDEX "task_recipes_policy_set_id_recipe_key_version_key"
  ON "task_recipes"("policy_set_id", "recipe_key", "version");
CREATE INDEX "task_recipes_recipe_key_status_idx" ON "task_recipes"("recipe_key", "status");
CREATE UNIQUE INDEX "task_capability_bindings_policy_role_capability_version_key"
  ON "task_capability_bindings"("policy_set_id", "capability_role", "capability_id", "capability_version");
CREATE INDEX "task_capability_bindings_role_status_priority_idx"
  ON "task_capability_bindings"("capability_role", "status", "priority");
CREATE INDEX "task_policy_proposals_scope_status_idx"
  ON "task_policy_proposals"("scope_type", "scope_id", "status");
CREATE INDEX "task_policy_proposals_status_created_at_idx"
  ON "task_policy_proposals"("status", "created_at" DESC);
CREATE INDEX "task_policy_audit_logs_policy_set_created_at_idx"
  ON "task_policy_audit_logs"("policy_set_id", "created_at" DESC);
CREATE INDEX "task_policy_audit_logs_action_created_at_idx"
  ON "task_policy_audit_logs"("action", "created_at" DESC);
CREATE UNIQUE INDEX "execution_completion_claims_execution_claim_node_key"
  ON "execution_completion_claims"("execution_id", "claim", "plan_node_id");
CREATE INDEX "execution_completion_claims_execution_status_idx"
  ON "execution_completion_claims"("execution_id", "status");
CREATE INDEX "execution_completion_claims_step_id_idx"
  ON "execution_completion_claims"("step_id");

ALTER TABLE "task_command_aliases" ADD CONSTRAINT "task_command_aliases_policy_set_id_fkey"
  FOREIGN KEY ("policy_set_id") REFERENCES "task_policy_sets"("id") ON DELETE CASCADE;
ALTER TABLE "task_recipes" ADD CONSTRAINT "task_recipes_policy_set_id_fkey"
  FOREIGN KEY ("policy_set_id") REFERENCES "task_policy_sets"("id") ON DELETE CASCADE;
ALTER TABLE "task_capability_bindings" ADD CONSTRAINT "task_capability_bindings_policy_set_id_fkey"
  FOREIGN KEY ("policy_set_id") REFERENCES "task_policy_sets"("id") ON DELETE CASCADE;
ALTER TABLE "task_policy_proposals" ADD CONSTRAINT "task_policy_proposals_policy_set_id_fkey"
  FOREIGN KEY ("policy_set_id") REFERENCES "task_policy_sets"("id") ON DELETE SET NULL;
ALTER TABLE "task_policy_audit_logs" ADD CONSTRAINT "task_policy_audit_logs_policy_set_id_fkey"
  FOREIGN KEY ("policy_set_id") REFERENCES "task_policy_sets"("id") ON DELETE SET NULL;
ALTER TABLE "execution_completion_claims" ADD CONSTRAINT "execution_completion_claims_execution_id_fkey"
  FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE;
ALTER TABLE "execution_completion_claims" ADD CONSTRAINT "execution_completion_claims_step_id_fkey"
  FOREIGN KEY ("step_id") REFERENCES "execution_steps"("id") ON DELETE SET NULL;

INSERT INTO "task_policy_sets" (
  "id", "name", "scope_type", "scope_id", "status", "version",
  "schema_version", "policy_json", "digest", "published_at"
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  'Platform Task Command Baseline',
  'platform',
  'platform',
  'active',
  '1.0.0',
  'task-policy/v1',
  '{"mode":"fixed_command","onlineLlmTopology":false,"description":"Audited baseline migrated from deterministic planner recipes"}'::jsonb,
  '46e9c513f357737370c1da5735b961f2a1dece2d2dbbfd9629d989ed88502aa9',
  CURRENT_TIMESTAMP
);

INSERT INTO "task_command_aliases" ("policy_set_id", "canonical_command", "alias", "source") VALUES
  ('10000000-0000-4000-8000-000000000001', 'web_extract', '打开网页', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'web_extract', '网页正文', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'search', '搜索', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'search', '查询', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'summarize', '总结', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'summarize', '归纳', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'summarize', '概括', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'transform', '翻译', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'transform', '改写', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'markdown_writer', '输出 markdown', 'builtin'),
  ('10000000-0000-4000-8000-000000000001', 'document_extract', '提取 PDF', 'builtin');

INSERT INTO "task_recipes" (
  "policy_set_id", "recipe_key", "version", "name", "required_commands_json",
  "trigger_json", "steps_json", "bindings_json", "completion_claims_json"
) VALUES
  ('10000000-0000-4000-8000-000000000001', 'web_extract_then_summarize', '1.0.0', '网页提取后总结',
   '["web_extract","summarize"]', '{"all":["web_extract","summarize"]}',
   '[{"ref":"extract","kind":"skill","role":"web_extract"},{"ref":"summarize","kind":"llm_operation","role":"summarize","dependsOn":["extract"]}]',
   '[{"target":"summarize.text","source":"extract.text"}]',
   '["webpage_content_extracted","summary_generated"]'),
  ('10000000-0000-4000-8000-000000000001', 'document_extract_then_summarize', '1.0.0', '文档提取后总结',
   '["document_extract","summarize"]', '{"all":["document_extract","summarize"]}',
   '[{"ref":"extract","kind":"skill","role":"document_extract"},{"ref":"summarize","kind":"llm_operation","role":"summarize","dependsOn":["extract"]}]',
   '[{"target":"summarize.text","source":"extract.text"}]',
   '["document_content_extracted","summary_generated"]'),
  ('10000000-0000-4000-8000-000000000001', 'search_then_summarize', '1.0.0', '搜索后总结',
   '["search","summarize"]', '{"all":["search","summarize"]}',
   '[{"ref":"search","kind":"skill","role":"search"},{"ref":"summarize","kind":"llm_operation","role":"summarize","dependsOn":["search"]}]',
   '[{"target":"summarize.items","source":"search.results"}]',
   '["search_results_produced","summary_generated"]'),
  ('10000000-0000-4000-8000-000000000001', 'search_summarize_write_markdown', '1.0.0', '搜索总结并输出 Markdown',
   '["search","summarize","markdown_writer"]', '{"all":["search","summarize","markdown_writer"]}',
   '[{"ref":"search","kind":"skill","role":"search"},{"ref":"summarize","kind":"llm_operation","role":"summarize","dependsOn":["search"]},{"ref":"write","kind":"skill","role":"markdown_writer","dependsOn":["summarize"]}]',
   '[{"target":"summarize.items","source":"search.results"},{"target":"write.content","source":"summarize.summary"}]',
   '["search_results_produced","summary_generated","markdown_artifact_created"]'),
  ('10000000-0000-4000-8000-000000000001', 'summarize_then_write_markdown', '1.0.0', '总结并输出 Markdown',
   '["summarize","markdown_writer"]', '{"all":["summarize","markdown_writer"]}',
   '[{"ref":"summarize","kind":"llm_operation","role":"summarize"},{"ref":"write","kind":"skill","role":"markdown_writer","dependsOn":["summarize"]}]',
   '[{"target":"write.content","source":"summarize.summary"}]',
   '["summary_generated","markdown_artifact_created"]'),
  ('10000000-0000-4000-8000-000000000001', 'grounded_text_transform', '1.0.0', '基于可信结果进行文本变换',
   '["transform"]', '{"all":["transform"],"requiresContext":true}',
   '[{"ref":"transform","kind":"llm_operation","role":"transform"}]',
   '[{"target":"transform.content","source":{"kind":"session_result","selector":"latest_compatible"}}]',
   '["transformed_text_generated"]'),
  ('10000000-0000-4000-8000-000000000001', 'document_extract', '1.0.0', '提取文档正文',
   '["document_extract"]', '{"all":["document_extract"]}',
   '[{"ref":"extract","kind":"skill","role":"document_extract"}]', '[]',
   '["document_content_extracted"]');

INSERT INTO "task_capability_bindings" (
  "policy_set_id", "capability_role", "capability_id", "priority", "input_mapping_json", "output_mapping_json"
) VALUES
  ('10000000-0000-4000-8000-000000000001', 'web_extract', '2cb6bf18-0c96-4ab4-8df1-9b0e2b9aac6b', 10, '{}', '{}'),
  ('10000000-0000-4000-8000-000000000001', 'search', '4c5f78c2-099c-4717-8d3b-feda6a2fccfd', 10, '{}', '{}'),
  ('10000000-0000-4000-8000-000000000001', 'markdown_writer', 'platform.markdown_writer', 10, '{}', '{}'),
  ('10000000-0000-4000-8000-000000000001', 'document_extract', 'platform.document.pdf-content-extractor', 10, '{}', '{}'),
  ('10000000-0000-4000-8000-000000000001', 'summarize', 'summarize_text', 10, '{"content":"text"}', '{"summary":"summary"}'),
  ('10000000-0000-4000-8000-000000000001', 'summarize_list', 'summarize_list', 10, '{"items":"items"}', '{"summary":"summary"}'),
  ('10000000-0000-4000-8000-000000000001', 'transform', 'transform_text', 10, '{"content":"content","instruction":"instruction"}', '{"content":"content"}');

INSERT INTO "task_policy_audit_logs" ("policy_set_id", "action", "detail_json") VALUES
  ('10000000-0000-4000-8000-000000000001', 'baseline.seeded', '{"version":"1.0.0","source":"migration"}');
