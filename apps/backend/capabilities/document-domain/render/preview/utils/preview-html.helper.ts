export type PreviewImage = { id: string; data: string; contentType: string };

export function createPdfViewerHtml(pdfBase64: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PDF Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #525659;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #toolbar {
      background: #323639;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: white;
      font-size: 13px;
    }
    #toolbar button {
      background: #4a4a4a;
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    #toolbar button:hover { background: #5a5a5a; }
    #toolbar span { margin-left: auto; }
    #pdf-container {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      gap: 10px;
    }
    .pdf-page-wrapper {
      position: relative;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      margin-bottom: 10px;
    }
    canvas {
      display: block;
      max-width: 100%;
    }
    .loading {
      color: white;
      font-size: 16px;
      padding: 40px;
    }
    .textLayer {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 0.2;
      line-height: 1.0;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }
    .textLayer > span {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: pointer;
      transform-origin: 0% 0%;
      user-select: none;
      -webkit-user-select: none;
    }
    .textLayer ::selection {
      background: transparent;
    }
    .textLayer ::-moz-selection {
      background: transparent;
    }
    .textLayer br {
      display: none;
    }
    .textLayer .carbone-highlight {
      background-color: rgba(255, 193, 7, 0.4) !important;
      border: 2px dashed #ffc107 !important;
    }
    .textLayer .element-highlight {
      background-color: rgba(0, 123, 255, 0.3) !important;
      border: 2px solid #007bff !important;
      border-radius: 2px;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
  <div id="toolbar">
    <button id="prev-page">Previous</button>
    <span id="page-info">Page 1 of 1</span>
    <button id="next-page">Next</button>
    <button id="zoom-out">Zoom -</button>
    <span id="zoom-level">100%</span>
    <button id="zoom-in">Zoom +</button>
  </div>
  <div id="pdf-container">
    <div class="loading">Loading PDF...</div>
  </div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdfData = '${pdfBase64}';
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.0;

    const container = document.getElementById('pdf-container');
    const pageInfo = document.getElementById('page-info');
    const zoomLevel = document.getElementById('zoom-level');

    async function renderPage(num) {
      pageRendering = true;
      try {
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: scale });
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper';
        pageWrapper.style.width = viewport.width + 'px';
        pageWrapper.style.height = viewport.height + 'px';

        const canvas = document.createElement('canvas');
        canvas.id = 'pdf-canvas';
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        pageWrapper.appendChild(canvas);

        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = viewport.width + 'px';
        textLayerDiv.style.height = viewport.height + 'px';
        pageWrapper.appendChild(textLayerDiv);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
          enableWebGL: false,
          renderInteractiveForms: true
        };
        await page.render(renderContext).promise;

        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport,
          textDivs: []
        });

        container.innerHTML = '';
        container.appendChild(pageWrapper);
        pageInfo.textContent = 'Page ' + num + ' of ' + pdfDoc.numPages;

        pageRendering = false;
        if (pageNumPending !== null) {
          renderPage(pageNumPending);
          pageNumPending = null;
        }
      } catch (err) {
        container.innerHTML = '<div class="loading">Error rendering page</div>';
        pageRendering = false;
      }
    }

    function queueRenderPage(num) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num);
      }
    }

    function onPrevPage() {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum);
    }

    function onNextPage() {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum);
    }

    function onZoomIn() {
      scale = Math.min(scale + 0.25, 3);
      zoomLevel.textContent = Math.round(scale * 100) + '%';
      queueRenderPage(pageNum);
    }

    function onZoomOut() {
      scale = Math.max(scale - 0.25, 0.5);
      zoomLevel.textContent = Math.round(scale * 100) + '%';
      queueRenderPage(pageNum);
    }

    document.getElementById('prev-page').addEventListener('click', onPrevPage);
    document.getElementById('next-page').addEventListener('click', onNextPage);
    document.getElementById('zoom-in').addEventListener('click', onZoomIn);
    document.getElementById('zoom-out').addEventListener('click', onZoomOut);

    const binaryString = atob(pdfData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    pdfjsLib.getDocument({
      data: bytes,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      disableFontFace: false,
      fontExtraMaxSize: 1024 * 1024 * 10,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise.then(function(pdf) {
      pdfDoc = pdf;
      pageInfo.textContent = 'Page ' + pageNum + ' of ' + pdf.numPages;
      renderPage(pageNum);
    }).catch(function(error) {
      container.innerHTML = '<div class="loading">Error loading PDF: ' + error.message + '</div>';
    });
  </script>
</body>
</html>`;
}

export function parsePptSlideXml(xmlContent: string): string {
  const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
  const texts = textMatches.map((match) => match.replace(/<a:t>|<\/a:t>/g, ''));
  return `<div class="slide-content"><p>${texts.join('</p><p>')}</p></div>`;
}

export function wrapPreviewHtml(
  content: string,
  images: PreviewImage[] = [],
  extraContent = ''
): string {
  const imageStyles = images
    .map(
      (img) =>
        `.image-${img.id} { background-image: url('data:${img.contentType};base64,${img.data}'); }`
    )
    .join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      min-height: 100vh;
    }
    .document-container {
      background: white;
      max-width: 800px;
      margin: auto;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      min-height: 600px;
    }
    h1 { font-size: 24px; margin: 20px 0 10px; color: #1a1a1a; }
    h2 { font-size: 20px; margin: 18px 0 8px; color: #333; }
    h3 { font-size: 16px; margin: 14px 0 6px; color: #444; }
    p { margin: 10px 0; line-height: 1.8; color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    td, th { border: 1px solid #e0e0e0; padding: 10px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    img { max-width: 100%; height: auto; }
    .sheet-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .sheet-tab {
      padding: 8px 16px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }
    .sheet-tab.active { background: #1890ff; color: white; border-color: #1890ff; }
    .slide-nav-container { display: flex; gap: 8px; margin-bottom: 16px; justify-content: center; }
    .slide-nav { padding: 8px 16px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
    .slide-nav.active { background: #1890ff; color: white; }
    .slide { display: none; }
    .slide.active { display: block; }
    .slide-content { padding: 40px; text-align: center; }
    .embedded-image { max-width: 100%; height: auto; }
    ${imageStyles}
  </style>
</head>
<body>
  <div class="document-container">
    ${extraContent}
    ${content}
  </div>
</body>
</html>`;
}

export function getPreviewImageContentType(ext: string): string {
  const types: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  };
  return types[ext] || 'image/png';
}
