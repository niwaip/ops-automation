#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const scanRoots = ['apps', 'packages', 'tests'];
const ignoredDirectories = new Set([
  '.git',
  '.pnpm-store',
  '.tmp',
  'build',
  'coverage',
  'dist',
  'generated',
  'managed_components',
  'node_modules',
  'temp',
  'var',
]);
const internalScopes = ['@ops/', '@ops-automation/'];
const allowedNestedWorkspacePairs = new Set();

const errors = [];
const warnings = [];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${toPosix(path.relative(repoRoot, filePath))}: invalid JSON (${error.message})`);
    return null;
  }
}

function walk(directory, visitor) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, visitor);
    } else if (entry.isFile()) {
      visitor(absolutePath);
    }
  }
}

function pathContainsFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return true;
  if (!stats.isDirectory()) return false;

  return fs
    .readdirSync(targetPath, { withFileTypes: true })
    .some((entry) =>
      entry.isDirectory() ? pathContainsFiles(path.join(targetPath, entry.name)) : entry.isFile()
    );
}

const rootPackagePath = path.join(repoRoot, 'package.json');
const rootPackage = readJson(rootPackagePath);
if (rootPackage?.workspaces) {
  errors.push(
    'package.json: remove the duplicate workspaces field; pnpm-workspace.yaml is authoritative'
  );
}

const packageFiles = [rootPackagePath];
for (const scanRoot of scanRoots) {
  walk(path.join(repoRoot, scanRoot), (filePath) => {
    if (path.basename(filePath) === 'package.json') packageFiles.push(filePath);
  });
}

const packagesByName = new Map();
const packages = [];
for (const packageFile of packageFiles) {
  const manifest = packageFile === rootPackagePath ? rootPackage : readJson(packageFile);
  if (!manifest?.name) continue;

  const directory = path.dirname(packageFile);
  const workspacePackage = { directory, file: packageFile, manifest };
  const existing = packagesByName.get(manifest.name);
  if (existing) {
    errors.push(
      `duplicate package name ${manifest.name}: ${toPosix(path.relative(repoRoot, existing.file))} and ${toPosix(path.relative(repoRoot, packageFile))}`
    );
    continue;
  }

  packagesByName.set(manifest.name, workspacePackage);
  packages.push(workspacePackage);
}

const workspaceFile = path.join(repoRoot, 'pnpm-workspace.yaml');
const workspacePatterns = fs
  .readFileSync(workspaceFile, 'utf8')
  .split('\n')
  .map((line) => line.match(/^\s*-\s+['"]([^'"]+)['"]\s*$/)?.[1])
  .filter(Boolean);

function workspacePatternMatches(pattern, relativeDirectory) {
  const expression = pattern
    .split('/')
    .map((segment) => (segment === '*' ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${expression}$`).test(relativeDirectory);
}

for (const pattern of workspacePatterns) {
  const wildcardCount = [...pattern].filter((character) => character === '*').length;
  if (wildcardCount > 1) {
    errors.push(`pnpm-workspace.yaml: overly broad workspace pattern ${pattern}`);
  }
}

for (const workspacePackage of packages) {
  if (workspacePackage.file === rootPackagePath) continue;
  const relativeDirectory = toPosix(path.relative(repoRoot, workspacePackage.directory));
  if (!workspacePatterns.some((pattern) => workspacePatternMatches(pattern, relativeDirectory))) {
    errors.push(
      `pnpm-workspace.yaml: package ${workspacePackage.manifest.name} is not covered (${relativeDirectory})`
    );
  }
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];
const dependencyGraph = new Map();

for (const workspacePackage of packages) {
  const dependencies = new Set();
  dependencyGraph.set(workspacePackage.manifest.name, dependencies);

  for (const field of dependencyFields) {
    for (const [dependencyName, dependencyRange] of Object.entries(
      workspacePackage.manifest[field] ?? {}
    )) {
      const isInternal = internalScopes.some((scope) => dependencyName.startsWith(scope));
      if (!isInternal) continue;

      if (!packagesByName.has(dependencyName)) {
        errors.push(
          `${toPosix(path.relative(repoRoot, workspacePackage.file))}: unknown internal dependency ${dependencyName}`
        );
        continue;
      }

      dependencies.add(dependencyName);
      if (dependencyRange !== 'workspace:*') {
        errors.push(
          `${toPosix(path.relative(repoRoot, workspacePackage.file))}: ${dependencyName} must use workspace:* instead of ${dependencyRange}`
        );
      }
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visitPackage(packageName, chain = []) {
  if (visiting.has(packageName)) {
    const cycleStart = chain.indexOf(packageName);
    errors.push(
      `workspace dependency cycle: ${[...chain.slice(cycleStart), packageName].join(' -> ')}`
    );
    return;
  }
  if (visited.has(packageName)) return;

  visiting.add(packageName);
  for (const dependencyName of dependencyGraph.get(packageName) ?? []) {
    visitPackage(dependencyName, [...chain, packageName]);
  }
  visiting.delete(packageName);
  visited.add(packageName);
}

for (const packageName of dependencyGraph.keys()) visitPackage(packageName);

const sortedPackages = packages
  .filter((workspacePackage) => workspacePackage.file !== rootPackagePath)
  .sort((left, right) => left.directory.length - right.directory.length);
for (let index = 0; index < sortedPackages.length; index += 1) {
  const parentPackage = sortedPackages[index];
  for (let childIndex = index + 1; childIndex < sortedPackages.length; childIndex += 1) {
    const childPackage = sortedPackages[childIndex];
    const relativePath = path.relative(parentPackage.directory, childPackage.directory);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) continue;

    const pair = `${parentPackage.manifest.name} -> ${childPackage.manifest.name}`;
    if (!allowedNestedWorkspacePairs.has(pair)) {
      errors.push(
        `nested workspace packages are ambiguous: ${pair} (${toPosix(path.relative(repoRoot, childPackage.directory))})`
      );
    } else {
      warnings.push(`transitional nested workspace package: ${pair}`);
    }
  }
}

walk(repoRoot, (filePath) => {
  if (
    path.basename(filePath) !== 'pnpm-lock.yaml' ||
    filePath === path.join(repoRoot, 'pnpm-lock.yaml')
  ) {
    return;
  }
  errors.push(`nested lockfile: ${toPosix(path.relative(repoRoot, filePath))}`);
});

for (const legacyDirectory of ['core', 'domain', 'orchestration']) {
  const legacyPath = path.join(repoRoot, 'apps', 'backend', legacyDirectory);
  if (fs.existsSync(legacyPath)) {
    errors.push(`legacy backend plane must not return: apps/backend/${legacyDirectory}`);
  }
}

for (const legacySandboxRuntime of ['docker/user-sandbox/dsh', 'docker/user-sandbox/dsh_modules']) {
  if (pathContainsFiles(path.join(repoRoot, legacySandboxRuntime))) {
    errors.push(
      `legacy sandbox runtime must stay under apps/backend/runtimes/personal-sandbox-runner: ${legacySandboxRuntime}`
    );
  }
}

let generatedPrismaClients = [];
try {
  generatedPrismaClients = [
    ...new Set(
      execFileSync('git', ['-c', 'core.fsmonitor=false', 'ls-files', '--', 'apps'], {
        cwd: repoRoot,
        encoding: 'utf8',
      })
        .split('\n')
        .filter((filePath) => filePath.includes('/generated/prisma/'))
        .map((filePath) => `${filePath.split('/generated/prisma/')[0]}/generated/prisma`)
    ),
  ];
} catch {
  warnings.push('unable to inspect tracked generated Prisma clients without Git metadata');
}
for (const generatedClient of generatedPrismaClients) {
  errors.push(`tracked Prisma client is not allowed: ${generatedClient}`);
}

console.log('='.repeat(72));
console.log('  Workspace Architecture Quality Gate');
console.log('='.repeat(72));
console.log(`Checked ${packages.length - 1} workspace packages.`);

for (const warning of warnings) console.log(`[WARN] ${warning}`);

if (errors.length > 0) {
  for (const error of [...new Set(errors)].sort()) console.error(`[ERROR] ${error}`);
  console.error(`\nArchitecture validation failed with ${new Set(errors).size} error(s).`);
  process.exit(1);
}

console.log('[PASS] Internal dependencies use workspace:* and resolve to unique packages.');
console.log('[PASS] Workspace dependency graph is acyclic.');
console.log('[PASS] Root lockfile and backend plane ownership rules are satisfied.');
console.log('='.repeat(72));
