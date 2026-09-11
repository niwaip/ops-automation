import { Global, Module } from '@nestjs/common';
import { IM_GATEWAY_PRISMA } from '@ops/im-gateway';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: IM_GATEWAY_PRISMA,
      useExisting: PrismaService,
    },
  ],
  exports: [IM_GATEWAY_PRISMA],
})
export class ImGatewayBridgeModule {}
