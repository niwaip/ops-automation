import React from 'react';
import { tryParseJsonValue } from '@/features/executions/shared/lib/common';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';

const renderJsonValue = (value: unknown, path = 'root'): React.ReactNode => {
  const parsedValue = tryParseJsonValue(value);

  if (typeof parsedValue === 'string') {
    return `"${parsedValue}"`;
  }

  if (typeof parsedValue === 'number' || typeof parsedValue === 'boolean') {
    return String(parsedValue);
  }

  if (parsedValue === null) {
    return 'null';
  }

  if (Array.isArray(parsedValue)) {
    return (
      <>
        [
        {parsedValue.length > 0 && (
          <div style={{ paddingLeft: 16 }}>
            {parsedValue.map((item, index) => (
              <div key={`${path}.${index}`}>
                {renderJsonValue(item, `${path}.${index}`)}
                {index < parsedValue.length - 1 ? ',' : ''}
              </div>
            ))}
          </div>
        )}
        ]
      </>
    );
  }

  if (parsedValue && typeof parsedValue === 'object') {
    const entries = Object.entries(parsedValue as Record<string, unknown>);
    return (
      <>
        {'{'}
        {entries.length > 0 && (
          <div style={{ paddingLeft: 16 }}>
            {entries.map(([key, item], index) => {
              const fixedLink =
                key === 'temporalLink' && typeof item === 'string'
                  ? replaceLocalhostWithCurrentHost(item)
                  : undefined;

              return (
                <div key={`${path}.${key}`}>
                  <span>"{key}": </span>
                  {fixedLink ? (
                    <a href={fixedLink} target="_blank" rel="noopener noreferrer">
                      {fixedLink}
                    </a>
                  ) : (
                    renderJsonValue(item, `${path}.${key}`)
                  )}
                  {index < entries.length - 1 ? ',' : ''}
                </div>
              );
            })}
          </div>
        )}
        {'}'}
      </>
    );
  }

  return String(parsedValue);
};

interface JsonPreviewProps {
  value?: unknown;
  renderedValue?: React.ReactNode;
  marginTop?: number;
}

export function JsonPreview({ value, renderedValue, marginTop = 0 }: JsonPreviewProps) {
  return (
    <pre
      style={{
        margin: 0,
        marginTop,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--bg-secondary)',
        padding: 12,
        borderRadius: 8,
        overflow: 'auto',
      }}
    >
      {renderedValue ?? renderJsonValue(value)}
    </pre>
  );
}
