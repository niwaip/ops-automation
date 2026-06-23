import React from 'react';
import { Card, Spin } from 'antd';
import { TemplatePreview } from '@/features/recorder/components';
import type { CompiledTemplate, ValidationResult } from '@/services/recorder.service';

interface RecorderCompilePanelProps {
  isDarkTheme: boolean;
  isCompiling: boolean;
  compilingLabel: string;
  template: CompiledTemplate | null;
  validation: ValidationResult | null;
  onSave: (template: CompiledTemplate) => void;
  saving: boolean;
}

const RecorderCompilePanel: React.FC<RecorderCompilePanelProps> = ({
  isDarkTheme,
  isCompiling,
  compilingLabel,
  template,
  validation,
  onSave,
  saving,
}) => {
  if (isCompiling) {
    return (
      <Card
        style={{
          borderRadius: 16,
          boxShadow: isDarkTheme
            ? '0 8px 24px rgba(0, 0, 0, 0.24)'
            : '0 4px 20px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Spin tip={compilingLabel}>
          <div style={{ height: 200 }} />
        </Spin>
      </Card>
    );
  }

  return (
    <TemplatePreview template={template} validation={validation} onSave={onSave} saving={saving} />
  );
};

export default RecorderCompilePanel;
