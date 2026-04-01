import { Module } from '@nestjs/common';
import { SessionModule } from './modules/session';
import { LockModule } from './modules/lock';
import { AllocationModule } from './modules/allocation';
import { FreezeModule } from './modules/freeze';

@Module({
  imports: [
    LockModule,
    AllocationModule,
    FreezeModule,
    SessionModule,
  ],
})
export class AppModule {}