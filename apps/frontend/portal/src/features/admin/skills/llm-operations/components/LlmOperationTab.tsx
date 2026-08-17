import { useState } from 'react';
import { Alert, Space, Typography } from 'antd';
import { LlmOperationList } from './LlmOperationList';
import { LlmOperationManagerDrawer } from './LlmOperationManagerDrawer';
import { useLlmOperations } from '../hooks/useLlmOperations';
import { useAuthStore } from '@/shared/store/authStore';
import type { LlmOperationCatalogEntry } from '../types';

const { Text } = Typography;

export function LlmOperationTab() {
  const { entries, loading, error, refresh } = useLlmOperations();
  const actor = useAuthStore((state) => state.user?.id || state.user?.username || '');
  const [selected, setSelected] = useState<LlmOperationCatalogEntry | null>(null);

  if (error) {
    return (
      <Alert
        type="warning"
        message="无法加载 LLM Operation 目录"
        description={error.message}
        showIcon
      />
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Text type="secondary">
        独立模型运行时 · 可管理 Prompt、Schema、策略和不可变版本，共 {entries.length} 个 Operation
      </Text>
      <LlmOperationList entries={entries} loading={loading} onManage={setSelected} />
      <LlmOperationManagerDrawer
        entry={selected}
        actor={actor}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
    </Space>
  );
}
