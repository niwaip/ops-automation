import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getControlPlaneRole } from './config/control-plane-role';

async function bootstrapWorker(): Promise<void> {
  const role = getControlPlaneRole();
  if (role !== 'dispatcher' && role !== 'schedule') {
    throw new Error(
      `worker-main requires CONTROL_PLANE_ROLE=dispatcher|schedule, received ${role}`
    );
  }
  await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  new Logger('ControlPlaneWorker').log(`Control Plane ${role} worker started`);
}

void bootstrapWorker();
