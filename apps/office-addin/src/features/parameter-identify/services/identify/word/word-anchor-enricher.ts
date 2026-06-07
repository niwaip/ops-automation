import { DocumentIR } from '../../../../../host/adapters/document-ir';
import { AISuggestion } from '../../../../../app/store';

function normalizeText(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function enrichWordSuggestionAnchors(documentIR: DocumentIR, suggestions: AISuggestion[]): AISuggestion[] {
  const contentControlAnchors = documentIR.anchors.filter((anchor) => anchor.type === 'word-content-control');
  const tableCellAnchors = documentIR.anchors.filter(
    (anchor) => anchor.type === 'word-range' && anchor.ref?.anchorSource === 'table-cell'
  );

  return suggestions.map((suggestion) => {
    const originalText = normalizeText(suggestion.originalText);
    const contextText = normalizeText(suggestion.context || suggestion.details?.context || suggestion.elementPath);

    const exactContentControls = originalText
      ? contentControlAnchors.filter((anchor) => normalizeText(anchor.text) === originalText)
      : [];
    if (exactContentControls.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'content-control',
            contentControlId: exactContentControls[0].ref.id as number,
          },
        },
      };
    }

    const contextualContentControls = contextText
      ? contentControlAnchors.filter((anchor) => {
          const anchorText = normalizeText(anchor.text);
          return anchorText && contextText.includes(anchorText);
        })
      : [];
    if (contextualContentControls.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'content-control',
            contentControlId: contextualContentControls[0].ref.id as number,
          },
        },
      };
    }

    const exactTableCells = originalText
      ? tableCellAnchors.filter((anchor) => normalizeText(anchor.text) === originalText)
      : [];
    if (exactTableCells.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'table-cell',
            tableIndex: exactTableCells[0].ref.tableIndex as number,
            rowIndex: exactTableCells[0].ref.rowIndex as number,
            cellIndex: exactTableCells[0].ref.cellIndex as number,
          },
        },
      };
    }

    const contextualTableCells = contextText
      ? tableCellAnchors.filter((anchor) => {
          const anchorText = normalizeText(anchor.text);
          return anchorText && contextText.includes(anchorText);
        })
      : [];
    if (contextualTableCells.length === 1) {
      return {
        ...suggestion,
        details: {
          ...suggestion.details,
          wordAnchor: {
            type: 'table-cell',
            tableIndex: contextualTableCells[0].ref.tableIndex as number,
            rowIndex: contextualTableCells[0].ref.rowIndex as number,
            cellIndex: contextualTableCells[0].ref.cellIndex as number,
          },
        },
      };
    }

    return suggestion;
  });
}
