const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

async function main() {
  const docxPath = '/Users/chain/Documents/MyProject/ops-automation/.data/carbone-engine/templates/1febbc18-1f17-4c49-a4b2-9bfb38fffeaf.docx';
  if (!fs.existsSync(docxPath)) {
    console.error("Docx file not found");
    return;
  }

  const buffer = fs.readFileSync(docxPath);
  const zip = new JSZip();
  await zip.loadAsync(buffer);

  const documentXml = await zip.file('word/document.xml')?.async('text');
  if (!documentXml) {
    console.error("document.xml not found");
    return;
  }

  const doc = new DOMParser().parseFromString(documentXml, 'text/xml');
  const paragraphs = doc.getElementsByTagNameNS('*', 'p');
  
  console.log("Total paragraphs:", paragraphs.length);
  
  let printedCount = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const textNodes = paragraphs[i].getElementsByTagNameNS('*', 't');
    let pText = '';
    for (let j = 0; j < textNodes.length; j++) {
      pText += textNodes[j].textContent;
    }
    
    // Clean up spaces
    pText = pText.trim();
    if (pText.length > 0 && (pText.includes('{') || pText.includes('}') || pText.includes('甲方') || pText.includes('合同'))) {
      console.log(`P[${i}]: "${pText}"`);
      printedCount++;
      if (printedCount >= 30) break;
    }
  }
}

main().catch(console.error);
