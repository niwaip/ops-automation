DO $$
DECLARE
  required_table TEXT;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'users',
    'roles',
    'skill_configs',
    'executions',
    'skill_access_requests',
    'builtin_skills',
    'builtin_skill_versions',
    'builtin_skill_deployments',
    'builtin_skill_permission_overrides',
    'builtin_skill_audit_events'
  ]
  LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION
        'Cannot adopt Prisma migration history: required table public.% is missing.',
        required_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'skill_permissions'
      AND column_name = 'granted_by'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION
      'Cannot adopt Prisma migration history: public.skill_permissions.granted_by is not TEXT.';
  END IF;
END $$;
