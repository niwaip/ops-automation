const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://ops:ops_secret@localhost:5432/ops"
    }
  }
});

async function main() {
  const executionId = 'b104a2ff-b302-436e-960a-d72a265d4681';
  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: {
      steps: {
        orderBy: { stepIndex: 'asc' }
      }
    }
  });

  if (!execution) {
    console.log("No execution found");
    return;
  }

  console.log("Execution status:", execution.status);
  console.log("Steps count:", execution.steps.length);
  for (const step of execution.steps) {
    console.log(`--- Step ${step.stepIndex} (${step.name || 'unnamed'}) ---`);
    console.log("Type:", step.type);
    console.log("Action:", step.action);
    console.log("Status:", step.status);
    console.log("inputJson:", JSON.stringify(step.inputJson, null, 2));
    console.log("outputJson:", JSON.stringify(step.outputJson, null, 2));
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
