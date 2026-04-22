import { Module } from '@nestjs/common';
<<<<<<< HEAD
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
=======
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
import { TemporalWorkflowController } from './temporal-workflow.controller';
import { TemporalWorkflowService } from './temporal-workflow.service';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
<<<<<<< HEAD
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [TemporalWorkflowController, ActivityController],
  providers: [TemporalWorkflowService, ActivityService],
  exports: [TemporalWorkflowService, ActivityService],
=======
  controllers: [TemporalWorkflowController, ActivityController],
  providers: [TemporalWorkflowService, ActivityService],
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
})
export class TemporalWorkflowModule {}