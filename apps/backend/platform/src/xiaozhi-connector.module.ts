import { Module } from '@nestjs/common';
import { ChannelTaskGatewayService, IM_GATEWAY_PRISMA, ImCredentialCipher, XiaozhiConnectorService, XiaozhiTaskService } from '@ops/im-gateway';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: IM_GATEWAY_PRISMA, useExisting: PrismaService },
    ImCredentialCipher,
    XiaozhiTaskService,
    ChannelTaskGatewayService,
    XiaozhiConnectorService,
  ],
})
export class XiaozhiConnectorModule {}
