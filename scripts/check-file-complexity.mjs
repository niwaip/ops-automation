#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const RED_LINE = 1600;
const WARN_LINE = 1200;

const EXCLUDE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".pnpm-store",
  ".cache",
  "coverage",
  ".next",
  "build",
  "generated",
  "var",
  "data",
  ".turbo",
  "temp",
  "tmp",
  "playwright-profiles",
  "playwright-cli-artifacts",
  "renders",
  "storage",
  "sample-contracts",
  "fixtures",
  "public",
  "test-fixtures",
]);

const CHECK_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py"]);

const EXEMPT_FILES = new Set([
  "fixed-activity-templates.ts",
  "codegen-api.py",
  "database-design.schema.sql",
]);

const violations = [];
const warnings = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (EXCLUDE_DIRS.has(name) || name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dir, name);

    if (entry.isDirectory()) {
      if (fullPath.includes("prisma") || fullPath.includes("migrations")) {
        continue;
      }
      walk(fullPath);
    } else if (entry.isFile()) {
      if (EXEMPT_FILES.has(name)) {
        continue;
      }
      const ext = path.extname(name).toLowerCase();
      if (!CHECK_EXTENSIONS.has(ext)) {
        continue;
      }
      if (
        name.endsWith(".spec.ts") ||
        name.endsWith(".test.ts") ||
        name.endsWith(".spec.tsx") ||
        name.endsWith(".test.tsx") ||
        name.endsWith(".spec.js") ||
        name.endsWith(".test.js")
      ) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n").length;
        const relPath = path.relative(process.cwd(), fullPath);

        if (lines > RED_LINE) {
          violations.push({ lines, path: relPath });
        } else if (lines > WARN_LINE) {
          warnings.push({ lines, path: relPath });
        }
      } catch {
        // ignore read errors
      }
    }
  }
}

walk(process.cwd());

console.log("=".repeat(72));
console.log("  Code Complexity Quality Gate (AGENTS.md File Size Thresholds)");
console.log("=".repeat(72));

if (warnings.length > 0) {
  console.log(`\n[WARN] ${warnings.length} files exceed the recommended 1200-line threshold:`);
  warnings.sort((a, b) => b.lines - a.lines);
  for (const w of warnings) {
    console.log(`  - ${String(w.lines).padStart(4)} lines: ${w.path}`);
  }
}

if (violations.length > 0) {
  console.log(`\n[ERROR] ${violations.length} files exceed the 1600-LINE RED LINE:`);
  violations.sort((a, b) => b.lines - a.lines);
  for (const v of violations) {
    console.log(`  ! ${String(v.lines).padStart(4)} lines: ${v.path}`);
  }
  console.log("\nPlease refactor and split these files according to AGENTS.md rules.\n");
  process.exit(1);
}

console.log("\n[PASS] All business source files comply with the 1600-line red line rule.");
if (warnings.length === 0) {
  console.log("[PASS] All business source files are within the 1200-line recommendation.");
}
console.log("=".repeat(72));
process.exit(0);
