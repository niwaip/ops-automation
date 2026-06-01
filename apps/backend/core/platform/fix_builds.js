const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://ops:ops_secret@localhost:5432/ops' } }
});
async function main() {
  const builds = await prisma.$queryRaw`SELECT id, generated_code FROM capability_builds`;
  let updatedCount = 0;
  for (const build of builds) {
    if (build.generated_code && build.generated_code.includes('if not locale:\n            return value\n        locale_candidates')) {
      let newCode = build.generated_code.replace(
        'if not locale:\n            return value\n        locale_candidates',
        'if not locale:\n            for candidate in ["cn", "zh", "jp", "ja"]:\n                if candidate in value and value[candidate] is not None:\n                    return value[candidate]\n            return value\n        locale_candidates'
      );
      await prisma.$executeRaw`UPDATE capability_builds SET generated_code = ${newCode} WHERE id = ${build.id}::uuid`;
      updatedCount++;
    }
  }
  console.log('Successfully updated', updatedCount, 'builds in capability_builds');
}
main().catch(console.error).finally(() => prisma.$disconnect());