import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportEntity } from './report.entity';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TemplateModule } from '../template/template.module';
import { GeneratorModule } from '../generator/generator.module';
import { AnalyzerModule } from '../analyzer/analyzer.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportEntity]),
    TemplateModule,
    GeneratorModule,
    AnalyzerModule,
    NotificationModule,
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}