const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://ops:ops_secret@localhost:5432/ops"
    }
  }
});

async function main() {
  const templateId = '1febbc18-1f17-4c49-a4b2-9bfb38fffeaf';
  const templates = await prisma.$queryRaw`
    SELECT id, file_name, markings
    FROM carbone_templates 
    WHERE id = ${templateId}::uuid
  `;
  
  if (templates.length > 0) {
    const markings = templates[0].markings;
    console.log("Markings count:", Array.isArray(markings) ? markings.length : typeof markings);
    console.log("Sample markings (first 3):", JSON.stringify(Array.isArray(markings) ? markings.slice(0, 3) : markings, null, 2));
  } else {
    console.log("Template not found");
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
