const cp = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function () {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://ops:ops_secret@localhost:5432/ops';
  }

  const generatedPrismaDir = path.resolve(__dirname, '../../src/generated/prisma');
  const hasGeneratedClient =
    fs.existsSync(generatedPrismaDir) &&
    fs.readdirSync(generatedPrismaDir).some((f) => f.includes('query_engine') || f === 'runtime');

  if (!hasGeneratedClient) {
    try {
      cp.execSync('pnpm exec prisma generate', {
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'inherit',
      });
    } catch {
      // Best-effort fallback if invoked outside pnpm environment
    }
  }
};

