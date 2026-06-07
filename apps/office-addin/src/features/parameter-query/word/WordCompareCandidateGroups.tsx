import React, { useEffect, useState } from 'react';
import type { TemplateFieldCandidate } from '../../../api/carbone-api';
import type { WordCompareCandidateDisplayGroup, WordCompareDisplayLanguage } from './query.types';

interface WordCompareCandidateGroupsProps {
  groups: WordCompareCandidateDisplayGroup[];
  onSaveCandidate: (candidateId: string, patch: Partial<TemplateFieldCandidate>) => void;
  onDeleteCandidate: (candidateId: string) => void;
  getCandidateDisplayName: (candidate: TemplateFieldCandidate) => string;
  getLanguageHintLabel: (hint?: WordCompareDisplayLanguage) => string;
}

interface WordCompareCandidateCardProps {
  candidate: TemplateFieldCandidate;
  onSave: (candidateId: string, patch: Partial<TemplateFieldCandidate>) => void;
  onDelete: (candidateId: string) => void;
  getCandidateDisplayName: (candidate: TemplateFieldCandidate) => string;
}

const WordCompareCandidateCard: React.FC<WordCompareCandidateCardProps> = ({
  candidate,
  onSave,
  onDelete,
  getCandidateDisplayName,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(getCandidateDisplayName(candidate));
  const [editSampleValue, setEditSampleValue] = useState(candidate.sampleValue || '');
  const referenceSnippet = String(candidate.matchText || candidate.segmentText || '').trim();

  useEffect(() => {
    setEditName(getCandidateDisplayName(candidate));
    setEditSampleValue(candidate.sampleValue || '');
  }, [candidate, getCandidateDisplayName]);

  const handleSave = () => {
    onSave(candidate.candidateId, {
      fieldIdHint: editName.trim() || undefined,
      sampleValue: editSampleValue.trim(),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(getCandidateDisplayName(candidate));
    setEditSampleValue(candidate.sampleValue || '');
    setIsEditing(false);
  };

  return (
    <div className="word-compare-candidate-card">
      <div className="word-compare-candidate-row">
        <div className="analysis-source-label">参数名</div>
        <div className="analysis-source-value word-compare-candidate-name">
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="请输入参数名"
            />
          ) : (
            getCandidateDisplayName(candidate)
          )}
        </div>
      </div>
      <div className="word-compare-candidate-row">
        <div className="analysis-source-label">参考值</div>
        <div className="analysis-source-value word-compare-candidate-value">
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editSampleValue}
              onChange={(event) => setEditSampleValue(event.target.value)}
              placeholder="请输入样本值"
            />
          ) : (
            candidate.sampleValue || '待补参考值'
          )}
        </div>
      </div>
      {referenceSnippet && (
        <div className="word-compare-candidate-row">
          <div className="analysis-source-label">参考片段</div>
          <div className="analysis-source-value" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {referenceSnippet}
          </div>
        </div>
      )}
      <div className="word-compare-candidate-row">
        <div className="analysis-source-label">锚点</div>
        <div className="analysis-source-value">
          {candidate.anchorText || '未识别锚点'}
        </div>
      </div>
      <div className="suggestion-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
        {isEditing ? (
          <>
            <button type="button" className="confirm-btn" onClick={handleSave}>
              保存
            </button>
            <button type="button" className="cancel-btn" onClick={handleCancel}>
              取消
            </button>
          </>
        ) : (
          <>
            <button type="button" className="dismiss-btn" onClick={() => setIsEditing(true)}>
              编辑
            </button>
            <button type="button" className="dismiss-btn" onClick={() => onDelete(candidate.candidateId)}>
              删除
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export const WordCompareCandidateGroups: React.FC<WordCompareCandidateGroupsProps> = ({
  groups,
  onSaveCandidate,
  onDeleteCandidate,
  getCandidateDisplayName,
  getLanguageHintLabel,
}) => (
  <div className="word-compare-candidate-list">
    {groups.map((group) => (
      group.type === 'sentence_pair' || group.type === 'cell_pair' ? (
        <div
          key={group.key}
          style={{
            border: '1px dashed #cbd5e1',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            background: '#f8fafc',
          }}
        >
          <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
            <span className="word-tag">
              {group.type === 'cell_pair' ? '单元格双语对照' : '双语句子对照'}
            </span>
            {group.type === 'cell_pair' && typeof group.tableIndex === 'number' && (
              <span className="word-tag">表格 {group.tableIndex + 1}</span>
            )}
            {group.type === 'cell_pair' && typeof group.rowIndex === 'number' && (
              <span className="word-tag">行 {group.rowIndex + 1}</span>
            )}
            {group.type === 'cell_pair' && typeof group.cellIndex === 'number' && (
              <span className="word-tag">列 {group.cellIndex + 1}</span>
            )}
            <span className="word-tag">
              {`${getLanguageHintLabel(group.leftLanguage)} ${group.leftCandidates?.length || 0} : ${group.rightCandidates?.length || 0} ${getLanguageHintLabel(group.rightLanguage)}`}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 12,
            }}
          >
            <div>
              <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                <span className="word-tag">{getLanguageHintLabel(group.leftLanguage)}</span>
                <span className="word-tag">候选 {group.leftCandidates?.length || 0}</span>
              </div>
              {(group.leftCandidates || []).map((candidate) => (
                <WordCompareCandidateCard
                  key={candidate.candidateId}
                  candidate={candidate}
                  onSave={onSaveCandidate}
                  onDelete={onDeleteCandidate}
                  getCandidateDisplayName={getCandidateDisplayName}
                />
              ))}
            </div>
            <div>
              <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                <span className="word-tag">{getLanguageHintLabel(group.rightLanguage)}</span>
                <span className="word-tag">候选 {group.rightCandidates?.length || 0}</span>
              </div>
              {(group.rightCandidates || []).map((candidate) => (
                <WordCompareCandidateCard
                  key={candidate.candidateId}
                  candidate={candidate}
                  onSave={onSaveCandidate}
                  onDelete={onDeleteCandidate}
                  getCandidateDisplayName={getCandidateDisplayName}
                />
              ))}
            </div>
          </div>
        </div>
      ) : group.type === 'loop_group' ? (
        <div
          key={group.key}
          style={{
            border: '1px solid #bfdbfe',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            background: '#f8fbff',
          }}
        >
          <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
            <span className="word-tag">循环参数组</span>
            {typeof group.tableIndex === 'number' ? (
              <span className="word-tag">表格 {group.tableIndex + 1}</span>
            ) : null}
            <span className="word-tag">候选 {(group.candidates || []).length}</span>
          </div>
          {(group.loopPairs && group.loopPairs.length > 0) ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {group.loopPairs.map((pair) => (
                <div
                  key={pair.key}
                  style={{
                    border: '1px dashed #cbd5e1',
                    borderRadius: 12,
                    padding: 12,
                    background: '#fff',
                  }}
                >
                  <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                    <span className="word-tag">
                      {typeof pair.cellIndex === 'number' ? `列 ${pair.cellIndex + 1}` : '表头列'}
                    </span>
                    <span className="word-tag">
                      {`${getLanguageHintLabel(pair.leftLanguage)} ${pair.leftCandidates.length} : ${pair.rightCandidates.length} ${getLanguageHintLabel(pair.rightLanguage)}`}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                        <span className="word-tag">{getLanguageHintLabel(pair.leftLanguage)}</span>
                        <span className="word-tag">候选 {pair.leftCandidates.length}</span>
                      </div>
                      {pair.leftCandidates.map((candidate) => (
                        <WordCompareCandidateCard
                          key={candidate.candidateId}
                          candidate={candidate}
                          onSave={onSaveCandidate}
                          onDelete={onDeleteCandidate}
                          getCandidateDisplayName={getCandidateDisplayName}
                        />
                      ))}
                    </div>
                    <div>
                      <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                        <span className="word-tag">{getLanguageHintLabel(pair.rightLanguage)}</span>
                        <span className="word-tag">候选 {pair.rightCandidates.length}</span>
                      </div>
                      {pair.rightCandidates.map((candidate) => (
                        <WordCompareCandidateCard
                          key={candidate.candidateId}
                          candidate={candidate}
                          onSave={onSaveCandidate}
                          onDelete={onDeleteCandidate}
                          getCandidateDisplayName={getCandidateDisplayName}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            (group.candidates || []).map((candidate) => (
              <WordCompareCandidateCard
                key={candidate.candidateId}
                candidate={candidate}
                onSave={onSaveCandidate}
                onDelete={onDeleteCandidate}
                getCandidateDisplayName={getCandidateDisplayName}
              />
            ))
          )}
        </div>
      ) : (
        <div
          key={group.key}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            background: '#fff',
          }}
        >
          <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
            <span className="word-tag">单句参数组</span>
            <span className="word-tag">候选 {(group.candidates || []).length}</span>
          </div>
          {(group.candidates || []).map((candidate) => (
            <WordCompareCandidateCard
              key={candidate.candidateId}
              candidate={candidate}
              onSave={onSaveCandidate}
              onDelete={onDeleteCandidate}
              getCandidateDisplayName={getCandidateDisplayName}
            />
          ))}
        </div>
      )
    ))}
  </div>
);
