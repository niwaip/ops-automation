const { Builder } = require('./apps/backend/domain/carbone-engine/dist/lib/builder.js');
const { Parser } = require('./apps/backend/domain/carbone-engine/dist/lib/parser.js');
const { CarboneEngine } = require('./apps/backend/domain/carbone-engine/dist/lib/engine.js');

const buildDataExampleJson = (parameters, tableLoops = []) => {
  const dataObj = {};

  const normalizeSkillParameterPath = (path) => path.replace(/^d\./, '');
  const isPlaceholderSkillParameterPath = (path) => false;

  const setValueAtPath = (target, rawPath, value) => {
    const cleanPath = normalizeSkillParameterPath(rawPath);
    if (!cleanPath || isPlaceholderSkillParameterPath(cleanPath)) {
      return;
    }

    const pathParts = cleanPath.split('.').filter(Boolean);
    let current = target;

    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      
      // Handle array index: items[0] or items[] or items[i]
      const arrayMatch = part.match(/^([^\[]+)\[(\d+|i)?\]$/);
      const isArrayPart = !!arrayMatch;
      const key = arrayMatch ? arrayMatch[1] : part;
      
      let arrayIndex = -1;
      if (arrayMatch && arrayMatch[2] !== undefined) {
         if (arrayMatch[2] === 'i') {
           arrayIndex = 0;
         } else {
           arrayIndex = parseInt(arrayMatch[2], 10);
         }
      } else if (isArrayPart) {
         arrayIndex = 0;
      }
      
      const isLast = i === pathParts.length - 1;

      if (isArrayPart) {
        if (!Array.isArray(current[key])) {
          current[key] = [];
        }
        
        const index = arrayIndex >= 0 ? arrayIndex : 0;
        
        if (isLast) {
          current[key][index] = value;
          return;
        }

        if (!current[key][index] || typeof current[key][index] !== 'object' || Array.isArray(current[key][index])) {
          current[key][index] = {};
        }
        current = current[key][index];
        continue;
      }

      if (isLast) {
        current[key] = value;
        return;
      }

      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }
  };

  for (const p of parameters) {
    const cleanName = normalizeSkillParameterPath(p.name || '');
    if (!cleanName || isPlaceholderSkillParameterPath(cleanName)) {
      continue;
    }
    setValueAtPath(dataObj, cleanName, p.example);
  }

  return JSON.stringify(dataObj, null, 2);
};

const parameters = [
  { name: 'd.qualityLiability', example: 'Test Liability' },
  { name: 'd.items[].materialCode', example: 'M001' }
];

console.log(buildDataExampleJson(parameters));
