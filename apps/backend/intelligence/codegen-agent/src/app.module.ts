import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ExportModule } from './modules/export';
import { GeneratorModule } from './modules/generator';
import { VerificationModule } from './modules/verification';

@Module({
  imports: [GeneratorModule, VerificationModule, ExportModule],
  controllers: [HealthController],
})
export class AppModule {}
