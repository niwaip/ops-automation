import React, { useMemo, useState, useCallback } from 'react';
import {
  Button,
  Card,
  Collapse,
  Image,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  CompassOutlined,
  CopyOutlined,
  FileTextOutlined,
  GlobalOutlined,
  PictureOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { extractBrowserImageSources } from './browser';
import { ExpandableMarkdownContent } from './components/ExpandableMarkdownContent';

const { Text } = Typography;

export interface StepOutputViewerProps {
  outputJson: Record<string, unknown> | null | undefined;
  stepName?: string;
  stepAction?: string;
  defaultExpanded?: boolean;
  showVisualEvidence?: boolean;
}

interface ExtractedBrowserStep {
  stepId?: string;
  name?: string;
  action?: string;
  target?: string | null;
  status?: string;
  takeover?: boolean;
  takeoverReason?: string;
  riskLevel?: string;
  riskReason?: string;
}

interface ExtractedContentItem {
  title?: string;
  sourceUrl?: string;
  text?: string;
  markdown?: string;
  profile?: string;
  outputName?: string;
}

interface ParsedStepOutput {
  payload: Record<string, unknown>;
  screenshots: string[];
  cleanContents: ExtractedContentItem[];
  browserSteps: ExtractedBrowserStep[];
  pageUrl?: string;
  pageTitle?: string;
  backend?: string;
  llmContent?: string;
  detailText?: string;
  resultPayload?: unknown;
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  Boolean(val) && typeof val === 'object' && !Array.isArray(val);

const extractStringContent = (val: unknown): string | undefined => {
  if (typeof val === 'string' && val.trim()) {
    return val.trim();
  }
  if (isRecord(val)) {
    if (typeof val.text === 'string' && val.text.trim()) return val.text.trim();
    if (typeof val.markdown === 'string' && val.markdown.trim()) return val.markdown.trim();
    if (typeof val.content === 'string' && val.content.trim()) return val.content.trim();
    if (typeof val.preview === 'string' && val.preview.trim()) return val.preview.trim();
  }
  return undefined;
};

export const parseStepOutput = (
  rawOutput: Record<string, unknown> | null | undefined
): ParsedStepOutput => {
  if (!rawOutput || !isRecord(rawOutput)) {
    return {
      payload: {},
      screenshots: [],
      cleanContents: [],
      browserSteps: [],
    };
  }

  // Unwrap inline / resultRef envelope if present
  const payload: Record<string, unknown> = isRecord(rawOutput.inline)
    ? (rawOutput.inline as Record<string, unknown>)
    : rawOutput;

  // 1. Extract Screenshots
  const screenshotSet = new Set<string>();

  // Use core extractor on both payload and rawOutput
  extractBrowserImageSources(rawOutput).forEach((src) => {
    if (src) screenshotSet.add(src);
  });
  extractBrowserImageSources(payload).forEach((src) => {
    if (src) screenshotSet.add(src);
  });

  // Extract from artifacts array
  const checkArtifacts = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const art of arr) {
      if (isRecord(art)) {
        if (
          typeof art.url === 'string' &&
          (art.type === 'browser_page_screenshot' ||
            art.kind === 'screenshot' ||
            /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(art.url) ||
            (typeof art.mimeType === 'string' && art.mimeType.startsWith('image/')))
        ) {
          screenshotSet.add(art.url);
        }
      }
    }
  };

  checkArtifacts(payload.artifacts);
  checkArtifacts(rawOutput.artifacts);

  // Extract from stepResults
  const directOutput = isRecord(payload.output) ? payload.output : undefined;
  const stepResultsRaw = Array.isArray(payload.stepResults)
    ? payload.stepResults
    : Array.isArray(directOutput?.stepResults)
      ? directOutput.stepResults
    : Array.isArray(rawOutput.stepResults)
      ? rawOutput.stepResults
      : [];

  const browserSteps: ExtractedBrowserStep[] = [];
  const nestedStepOutputs: Record<string, unknown>[] = [];
  // Phase detail APIs may return one recorded browser step directly as
  // { action, status, stepId, output: { text, ... } } instead of stepResults[].
  if (directOutput) {
    nestedStepOutputs.push(directOutput);
    extractBrowserImageSources(directOutput).forEach((src) => {
      if (src) screenshotSet.add(src);
    });
    if (Array.isArray(directOutput.artifacts)) {
      checkArtifacts(directOutput.artifacts);
    }
  }
  for (const stepItem of stepResultsRaw) {
    if (isRecord(stepItem)) {
      browserSteps.push({
        stepId: typeof stepItem.stepId === 'string' ? stepItem.stepId : undefined,
        name: typeof stepItem.name === 'string' ? stepItem.name : undefined,
        action: typeof stepItem.action === 'string' ? stepItem.action : undefined,
        target: typeof stepItem.target === 'string' ? stepItem.target : null,
        status: typeof stepItem.status === 'string' ? stepItem.status : undefined,
        takeover: stepItem.takeover === true,
        takeoverReason: typeof stepItem.takeoverReason === 'string' ? stepItem.takeoverReason : undefined,
        riskLevel: typeof stepItem.riskLevel === 'string' ? stepItem.riskLevel : undefined,
        riskReason: typeof stepItem.riskReason === 'string' ? stepItem.riskReason : undefined,
      });

      if (Array.isArray(stepItem.artifacts)) {
        checkArtifacts(stepItem.artifacts);
      }
      if (isRecord(stepItem.output)) {
        nestedStepOutputs.push(stepItem.output);
        extractBrowserImageSources(stepItem.output).forEach((src) => {
          if (src) screenshotSet.add(src);
        });
        if (Array.isArray(stepItem.output.artifacts)) {
          checkArtifacts(stepItem.output.artifacts);
        }
      }
    }
  }

  // 2. Extract Clean Page Content / Extracted Text
  const cleanContents: ExtractedContentItem[] = [];

  // Legacy browser recordings keep the captured page content under
  // stepResults[i].output.  The action row and the content row are the same
  // runtime step, so surface its text/title/url instead of showing an empty
  // "preview" after a successful goto.
  for (const stepOutput of nestedStepOutputs) {
    const text = extractStringContent(
      stepOutput.text ||
        stepOutput.markdown ||
        stepOutput.extractedText ||
        (isRecord(stepOutput.data) ? stepOutput.data.text : undefined)
    );
    if (text && !cleanContents.some((content) => content.text === text)) {
      cleanContents.push({
        text,
        title: typeof stepOutput.pageTitle === 'string' ? stepOutput.pageTitle : undefined,
        sourceUrl: typeof stepOutput.pageUrl === 'string' ? stepOutput.pageUrl : undefined,
      });
    }
  }

  // Content Candidates
  const contentCandidates = Array.isArray(payload.contentCandidates)
    ? payload.contentCandidates
    : Array.isArray(rawOutput.contentCandidates)
      ? rawOutput.contentCandidates
      : [];

  for (const candidate of contentCandidates) {
    if (isRecord(candidate)) {
      const text = extractStringContent(candidate.text || candidate.markdown || candidate.content);
      if (text) {
        cleanContents.push({
          title: typeof candidate.title === 'string' ? candidate.title : undefined,
          sourceUrl:
            typeof candidate.finalUrl === 'string'
              ? candidate.finalUrl
              : typeof candidate.sourceUrl === 'string'
                ? candidate.sourceUrl
                : undefined,
          text,
          markdown: typeof candidate.markdown === 'string' ? candidate.markdown : undefined,
          profile: typeof candidate.profile === 'string' ? candidate.profile : undefined,
          outputName: typeof candidate.outputName === 'string' ? candidate.outputName : undefined,
        });
      }
    }
  }

  // Check declared content output keys (e.g. step_1_clean_content, clean_content)
  for (const [key, value] of Object.entries(payload)) {
    if (/clean_content|_content$/i.test(key) && value) {
      const text = extractStringContent(value);
      if (text && !cleanContents.some((c) => c.text === text)) {
        cleanContents.push({
          outputName: key,
          text,
        });
      }
    }
  }

  // Check generic text / markdown fields on payload
  if (cleanContents.length === 0) {
    const directText = extractStringContent(payload.text || payload.markdown || payload.extractedText);
    if (directText) {
      cleanContents.push({ text: directText });
    }
  }

  // 3. Extract LLM / Transform Result Content
  let llmContent: string | undefined;
  if (typeof payload.content === 'string' && payload.content.trim()) {
    llmContent = payload.content.trim();
  } else if (typeof payload.summary === 'string' && payload.summary.trim()) {
    llmContent = payload.summary.trim();
  } else if (typeof payload.transformedText === 'string' && payload.transformedText.trim()) {
    llmContent = payload.transformedText.trim();
  }

  // 4. Extract Page State
  const pageState = isRecord(payload.pageState) ? payload.pageState : isRecord(rawOutput.pageState) ? rawOutput.pageState : undefined;
  const latestStepOutput = nestedStepOutputs[nestedStepOutputs.length - 1];
  const pageUrl =
    typeof pageState?.pageUrl === 'string'
      ? pageState.pageUrl
      : typeof latestStepOutput?.pageUrl === 'string'
        ? latestStepOutput.pageUrl
        : cleanContents[0]?.sourceUrl || browserSteps[0]?.target || undefined;
  const pageTitle =
    typeof pageState?.pageTitle === 'string'
      ? pageState.pageTitle
      : typeof latestStepOutput?.pageTitle === 'string'
        ? latestStepOutput.pageTitle
        : cleanContents[0]?.title || undefined;

  // 5. Extract Presentation / Result
  const presentation = isRecord(payload.presentation) ? payload.presentation : isRecord(rawOutput.presentation) ? rawOutput.presentation : undefined;
  const detailText =
    typeof presentation?.detailText === 'string' && presentation.detailText !== 'success'
      ? presentation.detailText
      : undefined;
  const resultPayload = payload.result !== undefined ? payload.result : rawOutput.result;

  return {
    payload,
    screenshots: Array.from(screenshotSet),
    cleanContents,
    browserSteps,
    pageUrl,
    pageTitle,
    backend: typeof payload.backend === 'string' ? payload.backend : undefined,
    llmContent,
    detailText,
    resultPayload,
  };
};

export const StepOutputViewer: React.FC<StepOutputViewerProps> = ({
  outputJson,
  defaultExpanded = false,
  showVisualEvidence = true,
}) => {
  const parsed = useMemo(() => parseStepOutput(outputJson), [outputJson]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    message.success('已复制到剪贴板');
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  // Generate a friendly summary label for the collapse header
  const headerSummary = useMemo(() => {
    const tags: React.ReactNode[] = [];
    if (showVisualEvidence && parsed.screenshots.length > 0) {
      tags.push(
        <Tag key="ss" color="blue" icon={<PictureOutlined />}>
          {`截图 (${parsed.screenshots.length})`}
        </Tag>
      );
    }
    if (parsed.cleanContents.length > 0) {
      const totalChars = parsed.cleanContents.reduce(
        (sum, c) => sum + (c.text?.length || 0),
        0
      );
      tags.push(
        <Tag key="cc" color="green" icon={<FileTextOutlined />}>
          {`提取正文 (${totalChars} 字)`}
        </Tag>
      );
    }
    if (parsed.llmContent) {
      tags.push(
        <Tag key="llm" color="purple" icon={<RobotOutlined />}>
          {`AI 总结 (${parsed.llmContent.length} 字)`}
        </Tag>
      );
    }
    if (showVisualEvidence && parsed.browserSteps.length > 0) {
      tags.push(
        <Tag key="bs" color="cyan" icon={<CompassOutlined />}>
          {`浏览器动作 (${parsed.browserSteps.length} 步)`}
        </Tag>
      );
    }
    if (tags.length === 0 && outputJson) {
      const keys = Object.keys(outputJson);
      return `查看步骤输出 (${keys.slice(0, 4).join('、')}${keys.length > 4 ? '...' : ''})`;
    }
    return <Space size={4} wrap>{tags}</Space>;
  }, [parsed, outputJson, showVisualEvidence]);

  if (!outputJson || Object.keys(outputJson).length === 0) {
    return null;
  }

  return (
    <Collapse
      size="small"
      ghost
      defaultActiveKey={defaultExpanded ? ['output'] : undefined}
      items={[
        {
          key: 'output',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                步骤输出:
              </Text>
              {typeof headerSummary === 'string' ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {headerSummary}
                </Text>
              ) : (
                headerSummary
              )}
            </div>
          ),
          children: (
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              {/* 1. 优先展示：页面截图 Gallery */}
              {showVisualEvidence && parsed.screenshots.length > 0 && (
                <Card
                  size="small"
                  styles={{ body: { padding: 12 } }}
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Space size={6}>
                      <PictureOutlined style={{ color: 'var(--primary-color)' }} />
                      <Text strong style={{ fontSize: 13 }}>
                        页面截图
                      </Text>
                      <Tag color="blue" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                        {`${parsed.screenshots.length} 张`}
                      </Tag>
                    </Space>
                    {parsed.pageUrl && (
                      <a
                        href={parsed.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: 'var(--primary-color)' }}
                      >
                        <GlobalOutlined style={{ marginRight: 4 }} />
                        {parsed.pageUrl.slice(0, 45)}
                        {parsed.pageUrl.length > 45 ? '...' : ''}
                      </a>
                    )}
                  </div>
                  <Image.PreviewGroup>
                    <Space wrap size={12}>
                      {parsed.screenshots.map((src, idx) => (
                        <div
                          key={`shot-${idx}`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Image
                            src={src}
                            alt={`Step Screenshot ${idx + 1}`}
                            style={{
                              width: 260,
                              height: 160,
                              objectFit: 'cover',
                              borderRadius: 6,
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-card)',
                            }}
                          />
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {`截图 ${idx + 1}`}
                          </Text>
                        </div>
                      ))}
                    </Space>
                  </Image.PreviewGroup>
                </Card>
              )}

              {/* 2. 优先展示：提取的正文内容 */}
              {parsed.cleanContents.map((contentItem, idx) => {
                const itemKey = `content-${idx}`;
                return (
                  <Card
                    key={itemKey}
                    size="small"
                    styles={{ body: { padding: 12 } }}
                    style={{
                      background: 'var(--bg-secondary)',
                      borderRadius: 8,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Space size={6} wrap>
                        <FileTextOutlined style={{ color: 'var(--success-color)' }} />
                        <Text strong style={{ fontSize: 13 }}>
                          {contentItem.outputName || (contentItem.title ? `正文: ${contentItem.title}` : '提取页面正文')}
                        </Text>
                        {contentItem.profile && (
                          <Tag color="cyan" style={{ fontSize: 11 }}>
                            {contentItem.profile}
                          </Tag>
                        )}
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {`(${contentItem.text?.length || 0} 字符)`}
                        </Text>
                      </Space>
                      <Space size={8}>
                        {contentItem.sourceUrl && (
                          <a
                            href={contentItem.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, color: 'var(--primary-color)' }}
                          >
                            <GlobalOutlined style={{ marginRight: 4 }} />
                            来源页面
                          </a>
                        )}
                        {contentItem.text && (
                          <Tooltip title="复制正文">
                            <Button
                              size="small"
                              type="text"
                              icon={copiedKey === itemKey ? <CheckOutlined style={{ color: 'var(--success-color)' }} /> : <CopyOutlined />}
                              onClick={() => handleCopy(contentItem.text!, itemKey)}
                            >
                              {copiedKey === itemKey ? '已复制' : '复制'}
                            </Button>
                          </Tooltip>
                        )}
                      </Space>
                    </div>
                    <div
                      style={{
                        margin: 0,
                        padding: '10px 14px',
                        background: 'var(--bg-card)',
                        borderRadius: 6,
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <ExpandableMarkdownContent text={contentItem.text || ''} />
                    </div>
                  </Card>
                );
              })}

              {/* 3. AI / LLM 处理结果 */}
              {parsed.llmContent && (
                <Card
                  size="small"
                  styles={{ body: { padding: 12 } }}
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Space size={6}>
                      <RobotOutlined style={{ color: 'var(--primary-color)' }} />
                      <Text strong style={{ fontSize: 13 }}>
                        AI 处理 / 总结结果
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {`(${parsed.llmContent.length} 字符)`}
                      </Text>
                    </Space>
                    <Tooltip title="复制结果">
                      <Button
                        size="small"
                        type="text"
                        icon={copiedKey === 'llm' ? <CheckOutlined style={{ color: 'var(--success-color)' }} /> : <CopyOutlined />}
                        onClick={() => handleCopy(parsed.llmContent!, 'llm')}
                      >
                        {copiedKey === 'llm' ? '已复制' : '复制'}
                      </Button>
                    </Tooltip>
                  </div>
                  <div
                    style={{
                      margin: 0,
                      padding: '10px 14px',
                      background: 'var(--bg-card)',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <ExpandableMarkdownContent text={parsed.llmContent || ''} />
                  </div>
                </Card>
              )}

              {/* 4. 浏览器动作记录 (Browser Step Actions) */}
              {showVisualEvidence && parsed.browserSteps.length > 0 && (
                <Card
                  size="small"
                  styles={{ body: { padding: 10 } }}
                  style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ marginBottom: 8 }}>
                    <Space size={6}>
                      <CompassOutlined style={{ color: 'var(--primary-color)' }} />
                      <Text strong style={{ fontSize: 12 }}>
                        浏览器操作动作记录
                      </Text>
                      <Tag color="cyan" style={{ fontSize: 11, marginInlineEnd: 0 }}>
                        {`${parsed.browserSteps.length} 个步骤`}
                      </Tag>
                      {parsed.backend && (
                        <Tag style={{ fontSize: 11, marginInlineEnd: 0 }}>
                          {`backend: ${parsed.backend}`}
                        </Tag>
                      )}
                    </Space>
                  </div>
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    {parsed.browserSteps.map((bStep, idx) => (
                      <div
                        key={`bstep-${idx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          background: 'var(--bg-card)',
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        <Space size={8} wrap>
                          <Tag style={{ marginInlineEnd: 0, fontSize: 11 }}>
                            {`#${idx + 1}`}
                          </Tag>
                          <Text strong style={{ color: 'var(--primary-color)', fontSize: 12 }}>
                            {bStep.action || 'step'}
                          </Text>
                          {bStep.target && (
                            <Text type="secondary" style={{ fontSize: 12, maxWidth: 360 }} ellipsis>
                              {bStep.target}
                            </Text>
                          )}
                          {bStep.name && bStep.name !== bStep.action && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {`(${bStep.name})`}
                            </Text>
                          )}
                        </Space>
                        {bStep.riskLevel && bStep.riskLevel !== 'normal' && (
                          <Tag color={bStep.riskLevel === 'high' ? 'error' : 'warning'} style={{ fontSize: 10 }}>
                            {bStep.riskLevel}
                          </Tag>
                        )}
                      </div>
                    ))}
                  </Space>
                </Card>
              )}

              {/* 5. 摘要内容 / presentation.detailText */}
              {parsed.detailText && (
                <div>
                  <Text strong style={{ fontSize: 12 }}>
                    摘要内容
                  </Text>
                  <div
                    style={{
                      marginTop: 4,
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <ExpandableMarkdownContent text={parsed.detailText} />
                  </div>
                </div>
              )}

              {/* 6. result 字段（如果与已提取的内容不同）*/}
              {parsed.resultPayload !== undefined &&
                typeof parsed.resultPayload !== 'string' &&
                Object.keys(isRecord(parsed.resultPayload) ? (parsed.resultPayload as object) : {}).length > 0 &&
                !parsed.cleanContents.some((c) => c.text === JSON.stringify(parsed.resultPayload)) && (
                  <div>
                    <Text strong style={{ fontSize: 12 }}>
                      result
                    </Text>
                    <pre
                      style={{
                        marginTop: 4,
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 6,
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 300,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(parsed.resultPayload, null, 2)}
                    </pre>
                  </div>
                )}

              {/* 7. 完整 outputJson (折叠在底部，供查看原始数据) */}
              <Collapse
                size="small"
                ghost
                items={[
                  {
                    key: 'raw-json',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          完整 outputJson (原始数据)
                        </Text>
                        <Button
                          size="small"
                          type="text"
                          icon={<CopyOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(JSON.stringify(outputJson, null, 2), 'raw-json');
                          }}
                          style={{ fontSize: 11, height: 22 }}
                        >
                          复制 JSON
                        </Button>
                      </div>
                    ),
                    children: (
                      <pre
                        style={{
                          margin: 0,
                          padding: '8px 12px',
                          background: 'var(--bg-secondary)',
                          borderRadius: 6,
                          fontSize: 11,
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          maxHeight: 350,
                          overflow: 'auto',
                        }}
                      >
                        {JSON.stringify(outputJson, null, 2)}
                      </pre>
                    ),
                  },
                ]}
              />
            </Space>
          ),
        },
      ]}
    />
  );
};
