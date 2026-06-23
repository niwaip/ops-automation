import { PrismaClient, UserRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const TEST_USERNAME = process.env.TEST_USERNAME || 'test';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'test123';
const SKIP_TEST_USER = ['1', 'true', 'yes'].includes(
  (process.env.SKIP_TEST_USER || '').toLowerCase()
);

async function main() {
  console.info('Seeding database...');

  // 1. Create System Roles
  const roles = [
    {
      name: 'admin',
      description: '系统管理员',
      isSystem: true,
      permissions: { all_skills: true },
    },
    {
      name: 'employee',
      description: '普通员工',
      isSystem: true,
      permissions: {},
    },
    {
      name: 'agent',
      description: '自动化代理',
      isSystem: true,
      permissions: {
        replay_start: true,
        replay_stop: true,
        agent_create: true,
      },
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {
        isSystem: role.isSystem,
        description: role.description,
        permissions: role.permissions,
      },
      create: {
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.permissions,
      },
    });
    console.info(`Ensured role: ${role.name}`);
  }

  // 2. Create admin user
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {
      passwordHash,
      email: ADMIN_EMAIL,
      role: UserRoleType.admin,
      isActive: true,
    },
    create: {
      username: ADMIN_USERNAME,
      passwordHash,
      email: ADMIN_EMAIL,
      role: UserRoleType.admin,
      isActive: true,
    },
  });

  console.info('Created admin user:', admin.username);

  // Link admin user to admin role
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: admin.id,
          roleId: adminRole.id,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    });
  }

  // 3. Create test user
  if (!SKIP_TEST_USER) {
    const testPasswordHash = await bcrypt.hash(TEST_PASSWORD, 10);

    const testUser = await prisma.user.upsert({
      where: { username: TEST_USERNAME },
      update: {
        passwordHash: testPasswordHash,
        email: TEST_EMAIL,
        role: UserRoleType.employee,
        isActive: true,
      },
      create: {
        username: TEST_USERNAME,
        passwordHash: testPasswordHash,
        email: TEST_EMAIL,
        role: UserRoleType.employee,
        isActive: true,
      },
    });

    console.info('Created test user:', testUser.username);

    // Link test user to employee role
    const employeeRole = await prisma.role.findUnique({ where: { name: 'employee' } });
    if (employeeRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: testUser.id,
            roleId: employeeRole.id,
          },
        },
        update: {},
        create: {
          userId: testUser.id,
          roleId: employeeRole.id,
        },
      });
    }
  }

  console.info('Database seeded successfully!');
  console.info('');
  console.info('Login credentials:');
  console.info(`  Admin: username=${ADMIN_USERNAME}, password=${ADMIN_PASSWORD}`);
  if (!SKIP_TEST_USER) {
    console.info(`  Test:  username=${TEST_USERNAME}, password=${TEST_PASSWORD}`);
  }
}

async function run() {
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void run();
