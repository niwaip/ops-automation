type MatrixInit = ArrayLike<number> | undefined;

class TextExtractionDomMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: MatrixInit) {
    if (!init || init.length < 6) return;
    [this.a, this.b, this.c, this.d, this.e, this.f] = Array.from(init).slice(0, 6);
  }
}

/**
 * PDF.js exposes rendering and text extraction from the same ESM bundle. The
 * bundle constructs an identity DOMMatrix during module initialization even
 * when callers only use getTextContent(). Node does not provide DOMMatrix and
 * the optional native Canvas package is intentionally not required here.
 */
export function ensurePdfJsTextRuntime(): void {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = TextExtractionDomMatrix as unknown as typeof DOMMatrix;
  }
}
