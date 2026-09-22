import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FullscreenOutlined,
  SafetyCertificateOutlined,
  UpOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Card, Space, Tag } from 'antd';
import { useState, useMemo } from 'react';
import type { CoordinationAttachment } from '../../../api/workbenchCoordination';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';
import { HtmlReportPreviewModal } from './HtmlReportPreviewModal';

export interface AuditReportData {
  title: string;
  rating?: string;
  score?: number;
  overallRisk?: 'HIGH' | 'MEDIUM' | 'LOW';
  statsText?: string;
  alerts: string[];
  executionId?: string;
  htmlAttachment?: CoordinationAttachment;
}

interface ComplianceAuditCardProps {
  reportData?: AuditReportData | null;
  htmlAttachment?: CoordinationAttachment | null;
  defaultExpanded?: boolean;
  defaultCardCollapsed?: boolean;
}

export function ComplianceAuditCard({
  reportData,
  htmlAttachment: propHtmlAttachment,
  defaultExpanded = false,
  defaultCardCollapsed = true,
}: ComplianceAuditCardProps) {
  const [isCardCollapsed, setIsCardCollapsed] = useState(defaultCardCollapsed);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const activeHtml = propHtmlAttachment || reportData?.htmlAttachment;
  const resolvedHtmlUrl = replaceLocalhostWithCurrentHost(activeHtml?.url);

  const riskLevel = useMemo(() => {
    if (reportData?.overallRisk) return reportData.overallRisk;
    const rating = reportData?.rating || '';
    if (rating.includes('高危') || (reportData?.score !== undefined && reportData.score < 60)) {
      return 'HIGH';
    }
    if (rating.includes('中') || (reportData?.score !== undefined && reportData.score < 80)) {
      return 'MEDIUM';
    }
    return 'LOW';
  }, [reportData?.overallRisk, reportData?.rating, reportData?.score]);

  // 解析条款风控统计汇总
  const statsSummary = useMemo(() => {
    if (!reportData?.statsText) return null;
    const text = reportData.statsText;
    const totalMatch = text.match(/共\s*(\d+)\s*项条款/);
    const highMatch = text.match(/🔴\s*高危\s*(\d+)\s*项/);
    const missingMatch = text.match(/⚡\s*必备缺失\s*(\d+)\s*项/);
    const medMatch = text.match(/🟡\s*中风险\s*(\d+)\s*项/);
    const passMatch = text.match(/🟢\s*合规通过\s*(\d+)\s*项/);

    return {
      total: totalMatch ? totalMatch[1] : '0',
      high: highMatch ? parseInt(highMatch[1], 10) : 0,
      missing: missingMatch ? parseInt(missingMatch[1], 10) : 0,
      med: medMatch ? parseInt(medMatch[1], 10) : 0,
      pass: passMatch ? parseInt(passMatch[1], 10) : 0,
    };
  }, [reportData?.statsText]);

  if (!reportData && !activeHtml) return null;

  const cardTitle = (reportData?.title || '合同合规智能审查')
    .replace(/^[🤖\s]+/u, '')
    .replace(/[【】]/g, '')
    .trim();

  return (
    <Card
      size="small"
      style={{
        borderRadius: 8,
        border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
        background: 'var(--bg-card, transparent)',
      }}
      styles={{
        body: isCardCollapsed ? { display: 'none' } : { padding: '12px 14px' },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => setIsCardCollapsed(!isCardCollapsed)}
          >
            <Space size={8} align="center">
              {isCardCollapsed ? (
                <DownOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
              ) : (
                <UpOutlined style={{ fontSize: 11, color: 'var(--text-tertiary)' }} />
              )}
              <SafetyCertificateOutlined style={{ color: 'var(--primary-color, #1677ff)', fontSize: 16 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {cardTitle}
              </span>
              {riskLevel === 'HIGH' ? (
                <Tag color="error" bordered={false} icon={<CloseCircleOutlined />} style={{ margin: 0, fontWeight: 500 }}>
                  {reportData?.score !== undefined ? `${reportData.score} 分 · 高危预警` : '高危漏洞预警'}
                </Tag>
              ) : riskLevel === 'MEDIUM' ? (
                <Tag color="warning" bordered={false} icon={<WarningOutlined />} style={{ margin: 0, fontWeight: 500 }}>
                  {reportData?.score !== undefined ? `${reportData.score} 分 · 中度风险` : '中度风险预警'}
                </Tag>
              ) : (
                <Tag color="success" bordered={false} icon={<CheckCircleOutlined />} style={{ margin: 0, fontWeight: 500 }}>
                  {reportData?.score !== undefined ? `${reportData.score} 分 · 合规良好` : '合规通过'}
                </Tag>
              )}
            </Space>
          </div>

          <Space size={10} align="center">
            {reportData?.executionId ? (
              <a
                href={`/executions?id=${reportData.executionId}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: 'var(--primary-color, #1677ff)', textDecoration: 'none' }}
              >
                执行单号 #{reportData.executionId.slice(0, 8)} ↗
              </a>
            ) : null}
            <Button
              type="link"
              size="small"
              icon={isCardCollapsed ? <DownOutlined /> : <UpOutlined />}
              onClick={() => setIsCardCollapsed(!isCardCollapsed)}
              style={{ fontSize: 12, padding: 0 }}
            >
              {isCardCollapsed ? '展开审查报告详情' : '折叠审查报告'}
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* 条款风控统计：简洁纯净排版 */}
        {statsSummary ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span>风控排查汇总：共 <strong style={{ color: 'var(--text-primary)' }}>{statsSummary.total}</strong> 项条款</span>
            {statsSummary.high > 0 && (
              <span style={{ color: 'var(--error-color, #ef4444)', fontWeight: 600 }}>
                ● 高危 {statsSummary.high} 项
              </span>
            )}
            {statsSummary.missing > 0 && (
              <span style={{ color: 'var(--warning-color, #f59e0b)', fontWeight: 600 }}>
                ● 必备缺失 {statsSummary.missing} 项
              </span>
            )}
            {statsSummary.med > 0 && (
              <span style={{ color: 'var(--warning-color, #fa8c16)', fontWeight: 600 }}>
                ● 中风险 {statsSummary.med} 项
              </span>
            )}
            {statsSummary.pass > 0 && (
              <span style={{ color: 'var(--success-color, #10b981)', fontWeight: 600 }}>
                ● 合规通过 {statsSummary.pass} 项
              </span>
            )}
          </div>
        ) : reportData?.statsText ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {reportData.statsText}
          </div>
        ) : null}

        {/* 关键聚合：流程自动生成的 HTML 审查诊断报告文档（支持全屏预览） */}
        {activeHtml ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 6,
              background: 'var(--bg-secondary, rgba(148, 163, 184, 0.06))',
              border: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <Space size={8} style={{ minWidth: 0, flex: 1 }}>
              <FileTextOutlined style={{ color: 'var(--primary-color, #1677ff)', fontSize: 18 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {activeHtml.name || '合同合规审查报告.html'}
                  </span>
                  <Tag color="blue" bordered={false} style={{ margin: 0, fontSize: 11 }}>
                    系统自动生成
                  </Tag>
                </div>
                {activeHtml.size ? (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {(activeHtml.size / 1024).toFixed(1)} KB · HTML 诊断交互报告
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    HTML 诊断交互报告
                  </div>
                )}
              </div>
            </Space>

            <Space size={8}>
              <Button
                type="primary"
                size="small"
                icon={<FullscreenOutlined />}
                onClick={() => setIsPreviewOpen(true)}
                style={{
                  borderRadius: 6,
                  height: 28,
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                全屏预览
              </Button>
              {resolvedHtmlUrl ? (
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  href={resolvedHtmlUrl}
                  target="_blank"
                  download={activeHtml.name || '合同合规审查报告.html'}
                  style={{ borderRadius: 6, height: 28, fontSize: 12 }}
                >
                  下载查验
                </Button>
              ) : null}
            </Space>
          </div>
        ) : null}

        {/* 关键风险条款摘要（高对比度、清晰背景、不刺眼、无乱色） */}
        {reportData?.alerts && reportData.alerts.length > 0 ? (
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(isExpanded ? reportData.alerts : reportData.alerts.slice(0, 1)).map((rawAlertText, idx) => {
                const alertText = typeof rawAlertText === 'string' ? rawAlertText : String(rawAlertText ?? '');
                const isRed = alertText.includes('🔴') || alertText.includes('高危');
                const isWarning = alertText.includes('⚡') || alertText.includes('缺失') || alertText.includes('🟡');

                const colonIdx = alertText.indexOf('：') !== -1 ? alertText.indexOf('：') : alertText.indexOf(':');
                const rawPrefix = colonIdx !== -1 ? alertText.slice(0, colonIdx) : '';
                const rawBody = colonIdx !== -1 ? alertText.slice(colonIdx + 1) : alertText;

                const cleanPrefix = rawPrefix.replace(/\*\*/g, '').trim();
                const cleanBody = rawBody.replace(/\*\*/g, '').trim();

                const borderColor = isRed ? 'var(--error-color, #ef4444)' : isWarning ? 'var(--warning-color, #f59e0b)' : 'var(--border-color)';
                const tagColor = isRed ? 'error' : isWarning ? 'warning' : 'default';

                return (
                  <div
                    key={idx}
                    style={{
                      fontSize: 12,
                      lineHeight: 1.6,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'var(--bg-secondary, rgba(148, 163, 184, 0.06))',
                      border: '1px solid var(--border-color, rgba(148, 163, 184, 0.15))',
                      borderLeft: `3px solid ${borderColor}`,
                    }}
                  >
                    <div style={{ wordBreak: 'break-word' }}>
                      {cleanPrefix ? (
                        <Tag
                          color={tagColor}
                          bordered={false}
                          style={{
                            marginRight: 8,
                            fontSize: 11,
                            padding: '1px 6px',
                            fontWeight: 600,
                          }}
                        >
                          {cleanPrefix}
                        </Tag>
                      ) : null}
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {cleanBody}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {reportData.alerts.length > 1 ? (
              <div style={{ textAlign: 'right', marginTop: 4 }}>
                <Button
                  type="link"
                  size="small"
                  icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                  onClick={() => setIsExpanded(!isExpanded)}
                  style={{ fontSize: 11, padding: 0, height: 'auto', color: 'var(--primary-color, #1677ff)' }}
                >
                  {isExpanded
                    ? '收起风控预警详情'
                    : `展开查看完整风控预警 (共 ${reportData.alerts.length} 项)`}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 在线直接预览弹窗 */}
      <HtmlReportPreviewModal
        open={isPreviewOpen}
        fileUrl={activeHtml?.url}
        fileName={activeHtml?.name || '合同合规审查报告.html'}
        title={cardTitle}
        onClose={() => setIsPreviewOpen(false)}
      />
    </Card>
  );
}

/**
 * 剥离文本中的智能审查/生成等大段技术报告，仅保留纯经办流转附言与上一节点说明
 */
export function stripAuditReportFromContent(content?: string): string | undefined {
  if (!content) return undefined;

  let cleaned = content;

  // 1. 移除形如 🤖 **【...】** 的机器人报告/生成块，直到下一个流转节点说明或文本结尾
  cleaned = cleaned.replace(
    /(?:^|\n)\s*🤖[\s\S]*?(?=(?:\n\s*-\s*\*\*上一节点说明|\n\s*请\s*\(@|\n\s*经办人|\n\s*📌|\n\s*⚠️|$))/g,
    '\n'
  );

  // 2. 移除残留的执行单号链接行，如 - **执行单号**：[#xxx](/executions)
  cleaned = cleaned.replace(/(?:^|\n)\s*-\s*\*\*执行单号\*\*[:：]?[^\n]*/g, '');

  // 3. 移除残留的独立指标行（综合评级、综合合规评分、条款风控统计等）
  cleaned = cleaned.replace(/(?:^|\n)\s*-\s*\*\*(?:综合评级|综合合规评分|条款风控统计)\*\*[:：]?[^\n]*/g, '');

  // 4. 清理连续多余空行与两端空白
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned || undefined;
}

/**
 * 过滤预警列表中的评级、评分、单号等重复元信息，并按风险严重程度优先排序
 */
function cleanAndSortAlerts(rawAlerts: string[]): string[] {
  const filtered = rawAlerts
    .map((item) => (typeof item === 'string' ? item.replace(/^-\s*/, '').trim() : ''))
    .filter((item) => {
      if (!item) return false;
      return (
        !item.includes('综合评级') &&
        !item.includes('综合合规评分') &&
        !item.includes('条款风控统计') &&
        !item.includes('执行单号')
      );
    });

  // 高危 (🔴/高危) 优先，必备缺失 (⚡/缺失) 次之
  return filtered.sort((a, b) => {
    const aHigh = a.includes('🔴') || a.includes('高危');
    const bHigh = b.includes('🔴') || b.includes('高危');
    if (aHigh && !bHigh) return -1;
    if (!aHigh && bHigh) return 1;
    const aMissing = a.includes('⚡') || a.includes('缺失');
    const bMissing = b.includes('⚡') || b.includes('缺失');
    if (aMissing && !bMissing) return -1;
    if (!aMissing && bMissing) return 1;
    return 0;
  });
}

/**
 * 从 rawContent 或 reviewReport 结构体中智能提取合规审查报告数据
 */
export function extractAuditReportFromTask(
  rawContent?: string,
  reviewReport?: any,
  attachments?: CoordinationAttachment[]
): {
  auditReport: AuditReportData | null;
  cleanedRawContent?: string;
  htmlAttachment?: CoordinationAttachment | null;
} {
  let htmlAttachment: CoordinationAttachment | null = null;

  // 1. 优先使用当前 reviewReport 显式绑定的工件 (artifacts / htmlReportUrl)
  if (reviewReport) {
    if (Array.isArray(reviewReport.artifacts) && reviewReport.artifacts.length > 0) {
      const art = reviewReport.artifacts.find(
        (a: any) =>
          a.name?.toLowerCase().endsWith('.html') ||
          a.mimeType === 'text/html' ||
          a.url?.toLowerCase().endsWith('.html')
      );
      if (art) {
        htmlAttachment = {
          name: art.name || art.fileName || (reviewReport.title ? `${reviewReport.title}.html` : '合同合规智能审查报告.html'),
          url: art.url || art.downloadUrl,
          size: art.size || art.sizeBytes,
          mimeType: art.mimeType || 'text/html',
        };
      }
    }
    if (!htmlAttachment && reviewReport.htmlReportUrl) {
      htmlAttachment = {
        name: reviewReport.title ? `${reviewReport.title}.html` : '合同合规智能审查报告.html',
        url: reviewReport.htmlReportUrl,
        mimeType: 'text/html',
      };
    }
  }

  // 2. 备用：若 reviewReport 未携带直接工件，从 attachments 中倒序查找最新生成的 HTML 审查报告
  if (!htmlAttachment && Array.isArray(attachments)) {
    const htmlAttachments = attachments.filter(
      (a) =>
        Boolean(a) &&
        (a.name?.toLowerCase().endsWith('.html') ||
          a.name?.toLowerCase().endsWith('.htm') ||
          a.mimeType === 'text/html')
    );
    if (htmlAttachments.length > 0) {
      htmlAttachment = htmlAttachments[htmlAttachments.length - 1];
    }
  }

  // 3. 从 reviewReport 直接构造
  if (reviewReport && reviewReport.overallRisk) {
    const alerts = cleanAndSortAlerts(reviewReport.summaryItems || []);
    return {
      auditReport: {
        title: reviewReport.title || '合同合规智能审查',
        overallRisk: reviewReport.overallRisk,
        score: reviewReport.riskScore,
        statsText: reviewReport.metrics
          ? `共 ${reviewReport.metrics.totalClauses || 0} 项条款（🔴 高危 ${reviewReport.metrics.highRiskCount || 0} 项，⚡ 必备缺失 ${reviewReport.metrics.missingClausesCount || 0} 项，🟡 中风险 ${reviewReport.metrics.mediumRiskCount || 0} 项，🟢 合规通过 ${reviewReport.metrics.passCount || 0} 项）`
          : undefined,
        alerts,
        executionId: reviewReport.executionId,
        htmlAttachment: htmlAttachment || undefined,
      },
      cleanedRawContent: stripAuditReportFromContent(rawContent),
      htmlAttachment,
    };
  }

  // 4. 从 rawContent 提取文本块
  if (rawContent && rawContent.includes('合同合规智能审查')) {
    const auditRegex = /(?:^|\n)(🤖\s*\*\*【([^】]+)】\*\*[:：]?[\s\S]*?)(?=(?:\n\s*-\s*\*\*上一节点说明|\n\s*请\s*\(@|\n\s*经办人|\n\s*📌|\n\s*⚠️|$))/;
    const match = rawContent.match(auditRegex);
    if (match) {
      const blockTitle = match[2]?.trim() || '合同合规智能审查';
      const blockText = match[1];
      const cleanedRawContent = stripAuditReportFromContent(rawContent);

      const lines = blockText.split('\n');
      let rating: string | undefined;
      let score: number | undefined;
      let statsText: string | undefined;
      const rawAlerts: string[] = [];
      let executionId: string | undefined;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('综合评级') || trimmed.includes('综合合规评分')) {
          const m = trimmed.match(/[：:]\s*(.+)$/);
          if (m) {
            rating = rating || m[1];
            const scoreMatch = m[1].match(/(\d+)\s*分/);
            if (scoreMatch) score = parseInt(scoreMatch[1], 10);
          }
        } else if (trimmed.includes('条款风控统计')) {
          const m = trimmed.match(/[：:]\s*(.+)$/);
          if (m) statsText = m[1];
        } else if (trimmed.includes('执行单号')) {
          const m = trimmed.match(/\[#?([a-zA-Z0-9_-]+)\]/);
          if (m) executionId = m[1];
        } else if (
          trimmed.startsWith('- ') &&
          (trimmed.includes('预警') ||
            trimmed.includes('条款') ||
            trimmed.includes('缺失') ||
            trimmed.includes('🔴') ||
            trimmed.includes('⚡') ||
            trimmed.includes('🟡'))
        ) {
          rawAlerts.push(trimmed.replace(/^-\s*/, ''));
        }
      }

      return {
        auditReport: {
          title: blockTitle,
          rating,
          score,
          statsText,
          alerts: cleanAndSortAlerts(rawAlerts),
          executionId,
          htmlAttachment: htmlAttachment || undefined,
        },
        cleanedRawContent,
        htmlAttachment,
      };
    }
  }

  return {
    auditReport: htmlAttachment
      ? {
          title: '合同合规智能审查报告',
          alerts: [],
          htmlAttachment,
        }
      : null,
    cleanedRawContent: stripAuditReportFromContent(rawContent),
    htmlAttachment,
  };
}
