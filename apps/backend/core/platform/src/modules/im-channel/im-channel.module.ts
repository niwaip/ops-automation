import { Module } from '@nestjs/common';
import { ImChannelController } from './im-channel.controller';
import { ImCredentialCipher } from './im-channel.crypto';
import { ImChannelService } from './im-channel.service';
import { WechatIlinkClient } from './wechat-ilink.client';

@Module({
  controllers: [ImChannelController],
  providers: [ImChannelService, ImCredentialCipher, WechatIlinkClient],
})
export class ImChannelModule {}
