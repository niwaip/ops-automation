import React, { useState } from 'react';
import {
  Card,
  Upload,
  Typography,
  Space,
  Button,
  message,
  Alert,
  Spin,
} from 'antd';
import {
  InboxOutlined,
  UploadOutlined,
  FileDoneOutlined,
  CheckCircleTwoTone,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  BackupImportResult,
  BackupPreviewResult,
  SystemBackupArchive,
  systemBackupApi,
} from '@/api/system-backup';
import { BackupPreviewModal } from './BackupPreviewModal';

const { Dragger } = Upload;
const { Title, Paragraph } = Typography;

interface BackupImportCardProps {
  onRefreshSummary: () => void;
}

export const BackupImportCard: React.FC<BackupImportCardProps> = ({
  onRefreshSummary,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [previewData, setPreviewData] = useState<BackupPreviewResult | null>(null);
  const [archivePayload, setArchivePayload] = useState<SystemBackupArchive | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<BackupImportResult | null>(null);

  const processFile = async (file: File) => {
    try {
      setAnalyzing(true);
      const text = await file.text();
      let parsed: SystemBackupArchive;
      try {
        parsed = JSON.parse(text);
      } catch {
        message.error('文件解析失败，请确保上传的是有效的 JSON 备份文件');
        return;
      }

      if (!parsed.manifest || !parsed.modules) {
        message.error('无效的备份文件：缺少 manifest 或 modules 规范结构');
        return;
      }

      const preview = await systemBackupApi.previewBackup(parsed);
      setArchivePayload(parsed);
      setPreviewData(preview);
      setPreviewVisible(true);
      message.success('备份文件校验通过，已生成冲突差异报告！');
    } catch (err: any) {
      message.error(`校验失败: ${err.message || '网络异常'}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImportSuccess = (result: BackupImportResult) => {
    setLastImportResult(result);
    setFileList([]);
    setArchivePayload(null);
    setPreviewData(null);
    onRefreshSummary();
  };

  return (
    <Card
      title={
        <Space>
          <UploadOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          <Title level={5} style={{ margin: 0 }}>
            数据导入与系统还原 (Import & Restore)
          </Title>
        </Space>
      }
      style={{ height: '100%', borderRadius: 12 }}
    >
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        上传先前导出的 JSON 备份归档文件。系统将自动进行签名校验、结构解析以及与当前系统现有资产的差异冲突比对，并由您选择覆盖或合并策略。
      </Paragraph>

      <Spin spinning={analyzing} tip="正在解析并比对系统资产冲突...">
        <Dragger
          name="backupFile"
          accept=".json"
          fileList={fileList}
          beforeUpload={(file) => {
            setFileList([file as any]);
            processFile(file);
            return false;
          }}
          onRemove={() => {
            setFileList([]);
            setPreviewData(null);
            setArchivePayload(null);
          }}
          style={{
            padding: '24px 16px',
            background: 'var(--bg-secondary, #fafafa)',
            borderRadius: 10,
            border: '1.5px dashed var(--border-color, #d9d9d9)',
          }}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 10 }}>
            <InboxOutlined style={{ color: '#52c41a', fontSize: 42 }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 500 }}>
            点击选择或拖拽备份 JSON 文件至此区域
          </p>
          <p className="ant-upload-hint" style={{ fontSize: 12, color: '#8c8c8c' }}>
            支持 Ops 自动化平台生成的 ops-system-backup-*.json 备份包
          </p>
        </Dragger>
      </Spin>

      {lastImportResult && (
        <Alert
          style={{ marginTop: 16, borderRadius: 8 }}
          type={lastImportResult.success ? 'success' : 'warning'}
          showIcon
          icon={lastImportResult.success ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : undefined}
          message={lastImportResult.success ? '系统数据还原成功' : '系统数据还原警告'}
          description={
            <div>
              <Paragraph style={{ marginBottom: 4 }}>{lastImportResult.message}</Paragraph>
              {lastImportResult.errors.length > 0 && (
                <ul style={{ paddingLeft: 20, margin: 0, fontSize: 12, color: '#cf1322' }}>
                  {lastImportResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          }
          closable
          onClose={() => setLastImportResult(null)}
        />
      )}

      {previewData && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="primary"
            icon={<FileDoneOutlined />}
            onClick={() => setPreviewVisible(true)}
            style={{ borderRadius: 8 }}
          >
            重新查看校验与冲突报告
          </Button>
        </div>
      )}

      <BackupPreviewModal
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
        previewData={previewData}
        archivePayload={archivePayload}
        onImportSuccess={handleImportSuccess}
      />
    </Card>
  );
};
