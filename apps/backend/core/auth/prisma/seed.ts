import { PrismaClient, UserRoleType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

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
    console.log(`Ensured role: ${role.name}`);
  }

  // 2. Create admin user
  const passwordHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash,
      email: 'admin@example.com',
      role: UserRoleType.admin,
      isActive: true,
    },
    create: {
      username: 'admin',
      passwordHash,
      email: 'admin@example.com',
      role: UserRoleType.admin,
      isActive: true,
    },
  });

  console.log('Created admin user:', admin.username);

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
  const testPasswordHash = await bcrypt.hash('test123', 10);

  const testUser = await prisma.user.upsert({
    where: { username: 'test' },
    update: {
      passwordHash: testPasswordHash,
      email: 'test@example.com',
      role: UserRoleType.employee,
      isActive: true,
    },
    create: {
      username: 'test',
      passwordHash: testPasswordHash,
      email: 'test@example.com',
      role: UserRoleType.employee,
      isActive: true,
    },
  });

  console.log('Created test user:', testUser.username);

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
