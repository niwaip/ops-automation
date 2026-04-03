import { Module } from '@nestjs/common';
import { BrowserCommandService } from './browser-command.service';
import { BrowserCommandController } from './browser-command.controller';
import { ModelModule } from '../model/model.module';

@Module({
  imports: [ModelModule],
  controllers: [BrowserCommandController],
  providers: [BrowserCommandService],
  exports: [BrowserCommandService],
})
export class BrowserCommandModule {}