import { Module } from '@nestjs/common';
import { RecognizerService } from './recognizer.service';

@Module({
  providers: [RecognizerService],
  exports: [RecognizerService],
})
export class RecognizerModule {}