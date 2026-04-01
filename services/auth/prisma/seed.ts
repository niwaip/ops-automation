import { PrismaClient, UserRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      email: 'admin@example.com',
      role: UserRoleType.admin,
      isActive: true,
    },
  });

  console.log('Created admin user:', admin.username);

  // Create test user
  const testPasswordHash = await bcrypt.hash('test123', 10);

  const testUser = await prisma.user.upsert({
    where: { username: 'test' },
    update: {},
    create: {
      username: 'test',
      passwordHash: testPasswordHash,
      email: 'test@example.com',
      role: UserRoleType.employee,
      isActive: true,
    },
  });

  console.log('Created test user:', testUser.username);

  console.log('Database seeded successfully!');
  console.log('');
  console.log('Login credentials:');
  console.log('  Admin: username=admin, password=admin123');
  console.log('  Test:  username=test, password=test123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });