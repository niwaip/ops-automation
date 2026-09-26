DO $$
DECLARE
  required_table TEXT;
  required_column RECORD;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'executions',
    'execution_steps',
    'execution_phases',
    'execution_phase_steps',
    'execution_phase_artifacts',
    'execution_takeovers',
    'execution_plans',
    'execution_artifacts',
    'skill_schedules'
  ]
  LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION
        'Shared execution schema verification failed: public.% is missing.',
        required_table;
    END IF;
  END LOOP;

  FOR required_column IN
    SELECT *
    FROM (
      VALUES
        ('executions', 'execution_mode'),
        ('executions', 'takeover_status'),
        ('execution_steps', 'plan_node_id'),
        ('execution_steps', 'lease_owner'),
        ('execution_steps', 'lease_expires_at')
    ) AS expected(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = required_column.table_name
        AND column_name = required_column.column_name
    ) THEN
      RAISE EXCEPTION
        'Shared execution schema verification failed: public.%.% is missing.',
        required_column.table_name,
        required_column.column_name;
    END IF;
  END LOOP;
END $$;
