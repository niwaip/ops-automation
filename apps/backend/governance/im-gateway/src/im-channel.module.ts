import { Module } from '@nestjs/common';
import { ImChannelController } from './im-channel.controller';
import { ImCredentialCipher } from './im-channel.crypto';
import { ImChannelService } from './im-channel.service';
import { WechatIlinkClient } from './wechat-ilink.client';
import { WechatMediaAdapter } from './wechat-media.adapter';
import { WechatOutboundQueueService } from './wechat-outbound-queue.service';

@Module({
  controllers: [ImChannelController],
  providers: [
    ImChannelService,
    ImCredentialCipher,
    WechatIlinkClient,
    WechatMediaAdapter,
    WechatOutboundQueueService,
  ],
  exports: [
    ImChannelService,
    ImCredentialCipher,
    WechatIlinkClient,
    WechatMediaAdapter,
    WechatOutboundQueueService,
  ],
})
export class ImChannelModule {}
