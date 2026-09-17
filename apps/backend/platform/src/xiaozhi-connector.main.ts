import { NestFactory } from '@nestjs/core';
import { XiaozhiConnectorModule } from './xiaozhi-connector.module';

async function main() {
  const app = await NestFactory.createApplicationContext(XiaozhiConnectorModule);
  process.on('SIGTERM', () => void app.close());
  process.on('SIGINT', () => void app.close());
}

void main();
