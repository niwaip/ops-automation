import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "src");

const restrictedImportSources = new Set(["react", "antd", "react-router-dom"]);
const restrictedGlobals = /\b(window|document|localStorage|sessionStorage|XMLHttpRequest)\b/;

const violations = [];

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (entry.name.endsWith(".tsx")) {
      violations.push(`${path.relative(rootDir, fullPath)}: user-core 禁止出现 .tsx 文件`);
      continue;
    }

    if (!entry.name.endsWith(".ts")) {
      continue;
    }

    const content = await readFile(fullPath, "utf8");

    for (const source of restrictedImportSources) {
      const importPattern = new RegExp(`from\\s+["']${source}["']|import\\s+["']${source}["']`, "g");
      if (importPattern.test(content)) {
        violations.push(`${path.relative(rootDir, fullPath)}: 禁止依赖 ${source}`);
      }
    }

    if (restrictedGlobals.test(content)) {
      violations.push(`${path.relative(rootDir, fullPath)}: 禁止直接引用浏览器全局对象`);
    }
  }
};

await walk(srcDir);

if (violations.length > 0) {
  console.error("user-core 边界检查失败:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("user-core 边界检查通过");
