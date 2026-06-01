const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://ops:ops_secret@localhost:5432/ops' } }
});
async function main() {
  const workflows = await prisma.temporalWorkflow.findMany();
  for (const matched of workflows) {
    if (matched.generatedCode && matched.generatedCode.includes('if not locale:\n            return value\n        locale_candidates')) {
      let newCode = matched.generatedCode.replace(
        'if not locale:\n            return value\n        locale_candidates',
        'if not locale:\n            for candidate in ["cn", "zh", "jp", "ja"]:\n                if candidate in value and value[candidate] is not None:\n                    return value[candidate]\n            return value\n        locale_candidates'
      );
      await prisma.temporalWorkflow.update({
        where: { id: matched.id },
        data: { generatedCode: newCode }
      });
      console.log('Successfully updated generatedCode for', matched.name);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());