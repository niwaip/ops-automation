import { PrismaClient, UserRoleType } from '../src/prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error('ADMIN_PASSWORD is required');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {
      description: '系统管理员',
      isSystem: true,
      permissions: { all_skills: true },
    },
    create: {
      name: 'admin',
      description: '系统管理员',
      isSystem: true,
      permissions: { all_skills: true },
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      email,
      role: UserRoleType.admin,
      isActive: true,
    },
    create: {
      username,
      passwordHash,
      email,
      role: UserRoleType.admin,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
    },
  });

  console.info(`Admin user ensured: ${username}`);
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void run();
