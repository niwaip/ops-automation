interface JsonPreviewProps {
  value: unknown;
}

export function JsonPreview({ value }: JsonPreviewProps) {
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "var(--bg-card)",
        border: "1px solid var(--bg-secondary)",
        padding: 12,
        borderRadius: 10,
      }}
    >
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}
