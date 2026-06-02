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
  
  // Find the template config
  const templates = await prisma.$queryRaw`
    SELECT id, file_name, template_config 
    FROM carbone_templates 
    WHERE id = ${templateId}::uuid
  `;
  
  console.log("Template Config:", JSON.stringify(templates, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
