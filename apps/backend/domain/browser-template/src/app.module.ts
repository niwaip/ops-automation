import { Module } from '@nestjs/common';
import { TemplateModule } from './modules/template/template.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    TemplateModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
