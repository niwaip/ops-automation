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
  const textNodes = doc.getElementsByTagNameNS('*', 't');
  
  console.log("Total text nodes:", textNodes.length);
  
  const placeholders = [];
  for (let i = 0; i < textNodes.length; i++) {
    const text = textNodes[i].textContent;
    if (text.includes('{') || text.includes('}')) {
      placeholders.push({ index: i, text });
    }
  }

  console.log("Found placeholder-like texts:", placeholders.length);
  if (placeholders.length > 0) {
    console.log("Sample placeholders:");
    console.log(placeholders.slice(0, 20));
  } else {
    console.log("No placeholder tags ({ or }) found in the docx file!");
    console.log("First 10 text nodes in docx:");
    for (let i = 0; i < Math.min(10, textNodes.length); i++) {
      console.log(`[${i}]: "${textNodes[i].textContent}"`);
    }
  }
}

main().catch(console.error);
