import React, { useState, useMemo } from 'react';
import { Card, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { ListSectionHeader } from '@/components/page/PageScaffold';
import {
  executionFlowApi,
  ExecutionFlowTemplateDTO,
} from '@/api/flows';
import { FlowOverviewCards, type FlowQuickFilter } from '../components/FlowOverviewCards';
import { FlowFilterToolbar } from '../components/FlowFilterToolbar';
import { FlowListTable } from '../components/FlowListTable';
import { FlowDetailModal } from '../components/FlowDetailModal';
import { FlowEditModal } from '../components/FlowEditModal';
import { FlowValidateModal } from '../components/FlowValidateModal';
import { FlowImportModal } from '../components/FlowImportModal';

export const FlowsPage: React.FC = () => {
  const { t } = useTranslation(['common', 'admin']);
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [activeFilter, setActiveFilter] = useState<FlowQuickFilter>('all');

  // Modal states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [validateModalVisible, setValidateModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ExecutionFlowTemplateDTO | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ExecutionFlowTemplateDTO | null>(null);

  // Queries
  const templatesQuery = useQuery(
    ['flows', selectedCategory, searchText],
    () =>
      executionFlowApi.list({
        category: selectedCategory,
        search: searchText,
        isActive: true,
      }),
    { staleTime: 30_000 }
  );

  const rawTemplates = templatesQuery.data?.templates || [];

  // Filter templates based on activeFilter from overview cards
  const filteredTemplates = useMemo(() => {
    let list = rawTemplates;
    if (activeFilter === 'public') {
      list = list.filter((t) => t.isPublic);
    } else if (activeFilter === 'verified') {
      list = list.filter((t) => t.validation?.isValid);
    }
    return list;
  }, [rawTemplates, activeFilter]);

  // Mutations
  const deleteMutation = useMutation(executionFlowApi.delete, {
    onSuccess: () => {
      message.success(t('common:success'));
      void queryClient.invalidateQueries(['flows']);
    },
    onError: (err: any) => {
      message.error(err?.message || t('common:error'));
    },
  });

  const cloneMutation = useMutation(
    ({ id, name }: { id: string; name: string }) => executionFlowApi.clone(id, name),
    {
      onSuccess: () => {
        message.success('已创建工作流组合副本');
        void queryClient.invalidateQueries(['flows']);
      },
      onError: (err: any) => {
        message.error(err?.message || '复制失败');
      },
    }
  );

  const handleCreate = () => {
    setEditingTemplate(null);
    setEditModalVisible(true);
  };

  const handleEdit = (template: ExecutionFlowTemplateDTO) => {
    setEditingTemplate(template);
    setEditModalVisible(true);
  };

  const handleViewDetail = (template: ExecutionFlowTemplateDTO) => {
    setSelectedTemplate(template);
    setDetailModalVisible(true);
  };

  const handleValidate = (template: ExecutionFlowTemplateDTO) => {
    setSelectedTemplate(template);
    setValidateModalVisible(true);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleClone = (template: ExecutionFlowTemplateDTO) => {
    cloneMutation.mutate({ id: template.id, name: `${template.name} (副本)` });
  };

  const handleExport = async (template: ExecutionFlowTemplateDTO) => {
    try {
      const result = await executionFlowApi.export(template.id);
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name}-composition.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`已导出组合：${template.name}`);
    } catch (err: any) {
      message.error(err?.message || '导出失败');
    }
  };

  const handleSelectOverviewFilter = (filter: FlowQuickFilter) => {
    setActiveFilter(filter);
  };

  return (
    <div style={{ padding: 24 }}>
      <ListSectionHeader
        title="工作流组合 (Workflow Compositions)"
        subtitle="标准化步骤拓扑与参数抽取协议，供多个技能跨业务场景快速装配、复用及 AI 仿真验证"
      />

      <FlowOverviewCards
        templates={rawTemplates}
        activeFilter={activeFilter}
        onSelectFilter={handleSelectOverviewFilter}
      />

      <Card style={{ borderRadius: 12 }}>
        <FlowFilterToolbar
          searchText={searchText}
          onSearchChange={setSearchText}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          onRefresh={() => void templatesQuery.refetch()}
          onCreate={handleCreate}
          onImport={() => setImportModalVisible(true)}
          loading={templatesQuery.isFetching}
        />

        <FlowListTable
          templates={filteredTemplates}
          isLoading={templatesQuery.isLoading}
          onEdit={handleEdit}
          onViewDetail={handleViewDetail}
          onValidate={handleValidate}
          onClone={handleClone}
          onExport={handleExport}
          onDelete={handleDelete}
        />
      </Card>

      <FlowDetailModal
        open={detailModalVisible}
        selectedTemplate={selectedTemplate}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedTemplate(null);
        }}
        onOpenValidate={(template) => {
          setSelectedTemplate(template);
          setValidateModalVisible(true);
        }}
      />

      <FlowEditModal
        open={editModalVisible}
        editingTemplate={editingTemplate}
        onClose={() => {
          setEditModalVisible(false);
          setEditingTemplate(null);
        }}
        onSuccess={() => void templatesQuery.refetch()}
        onValidateFromEdit={(template) => {
          setSelectedTemplate(template);
          setValidateModalVisible(true);
        }}
      />

      <FlowValidateModal
        open={validateModalVisible}
        selectedTemplate={selectedTemplate}
        onClose={() => {
          setValidateModalVisible(false);
          setSelectedTemplate(null);
        }}
        onApplyAdjustmentSuccess={(updatedTemplate) => {
          setEditingTemplate(updatedTemplate);
          setEditModalVisible(true);
        }}
      />

      <FlowImportModal
        open={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        onSuccess={() => void templatesQuery.refetch()}
      />
    </div>
  );
};

export default FlowsPage;
