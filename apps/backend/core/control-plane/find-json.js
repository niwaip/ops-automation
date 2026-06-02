const fs = require('fs');
const path = require('path');

function walk(dir, results = []) {
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          if (!file.startsWith('.') && file !== 'node_modules') {
            walk(filePath, results);
          }
        } else {
          if (file.includes('1febbc18')) {
            results.push(filePath);
          }
        }
      } catch (err) {
        // ignore stat errors
      }
    });
  } catch (err) {
    // ignore readDir errors
  }
  return results;
}

const root = '/Users/chain/Documents/MyProject/ops-automation/.data';
console.log("Matching files in .data:");
console.log(walk(root));
