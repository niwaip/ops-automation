import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const [, , inputName, outputName] = process.argv;

if (!inputName || !outputName) {
  console.error('Usage: node scripts/render-manifest.mjs <input> <output>');
  process.exit(1);
}

const addinBaseUrl = (
  process.env.OFFICE_ADDIN_BASE_URL ||
  process.env.VITE_ADDIN_BASE_URL ||
  'https://localhost:3000'
).replace(/\/+$/, '');

const inputPath = path.resolve(projectRoot, inputName);
const outputPath = path.resolve(projectRoot, outputName);

const template = fs.readFileSync(inputPath, 'utf8');
const manifest = template.split('https://localhost:3000').join(addinBaseUrl);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, manifest, 'utf8');

console.log(`Rendered ${inputName} -> ${outputName} with base URL ${addinBaseUrl}`);
