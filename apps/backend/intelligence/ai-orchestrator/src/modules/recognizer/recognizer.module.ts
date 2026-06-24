import { Module } from '@nestjs/common';
import { RecognizerService } from './recognizer.service';
import { ModelModule } from '../model/model.module';

@Module({
  imports: [ModelModule],
  providers: [RecognizerService],
  exports: [RecognizerService],
})
export class RecognizerModule {}
