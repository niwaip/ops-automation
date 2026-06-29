import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DefaultSemanticDomainBootstrapService } from './default-semantic-domain.bootstrap.service';

@Module({
  imports: [PrismaModule],
  providers: [DefaultSemanticDomainBootstrapService],
})
export class BootstrapModule {}
