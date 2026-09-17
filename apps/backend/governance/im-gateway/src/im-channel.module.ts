import { Module } from '@nestjs/common';
import { ImChannelController } from './im-channel.controller';
import { ImCredentialCipher } from './im-channel.crypto';
import { ImChannelService } from './im-channel.service';
import { WechatIlinkClient } from './wechat-ilink.client';
import { WechatMediaAdapter } from './wechat-media.adapter';
import { WechatOutboundQueueService } from './wechat-outbound-queue.service';
import { PassportMqttGatewayService } from './passport-mqtt.service';
import { XiaozhiChannelController } from './xiaozhi-channel.controller';
import { XiaozhiChannelService } from './xiaozhi-channel.service';
import { XiaozhiTaskService } from './xiaozhi-task.service';
import { ChannelTaskGatewayService } from './channel-task-gateway.service';

@Module({
  controllers: [ImChannelController, XiaozhiChannelController],
  providers: [
    ImChannelService,
    ImCredentialCipher,
    WechatIlinkClient,
    WechatMediaAdapter,
    WechatOutboundQueueService,
    PassportMqttGatewayService,
    XiaozhiChannelService,
    XiaozhiTaskService,
    ChannelTaskGatewayService,
  ],
  exports: [
    ImChannelService,
    ImCredentialCipher,
    WechatIlinkClient,
    WechatMediaAdapter,
    WechatOutboundQueueService,
    PassportMqttGatewayService,
  ],
})
export class ImChannelModule {}
