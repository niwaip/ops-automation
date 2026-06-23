import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TemplateModule } from '../template/template.module';
import { GeneratorModule } from '../generator/generator.module';
import { AnalyzerModule } from '../analyzer/analyzer.module';
import { NotificationModule } from '../notification/notification.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, TemplateModule, GeneratorModule, AnalyzerModule, NotificationModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
