import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { buildSnapshotDiffRows, MISSING_VALUE, type SnapshotDiffRow } from '../utils/capabilitiesHelpers';

const { Text } = Typography;

export interface CapabilityDiffViewerProps {
  leftPayload?: Record<string, unknown>;
  rightPayload?: Record<string, unknown>;
  showOnlyDiff?: boolean;
}

export const CapabilityDiffViewer: React.FC<CapabilityDiffViewerProps> = ({
  leftPayload = {},
  rightPayload = {},
  showOnlyDiff = true,
}) => {
  const allRows = buildSnapshotDiffRows(leftPayload, rightPayload);
  const rows = showOnlyDiff ? allRows.filter((r) => r.status !== 'same') : allRows;

  const columns: ColumnsType<SnapshotDiffRow> = [
    {
      title: 'Path',
      dataIndex: 'path',
      key: 'path',
      width: 240,
      render: (val) => <Text code style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status) => {
        const color =
          status === 'added'
            ? 'green'
            : status === 'removed'
              ? 'red'
              : status === 'changed'
                ? 'orange'
                : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '左边快照 (基准)',
      dataIndex: 'leftValue',
      key: 'leftValue',
      render: (val) => (
        <pre style={{ margin: 0, fontSize: 12, maxHeight: 120, overflow: 'auto' }}>
          {val === MISSING_VALUE ? '<Missing>' : val}
        </pre>
      ),
    },
    {
      title: '右边快照 (对比)',
      dataIndex: 'rightValue',
      key: 'rightValue',
      render: (val) => (
        <pre style={{ margin: 0, fontSize: 12, maxHeight: 120, overflow: 'auto' }}>
          {val === MISSING_VALUE ? '<Missing>' : val}
        </pre>
      ),
    },
  ];

  return (
    <Table
      rowKey="path"
      dataSource={rows}
      columns={columns}
      pagination={false}
      size="small"
      bordered
    />
  );
};
