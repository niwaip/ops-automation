import { Module } from '@nestjs/common';
import { ControlPlaneClient } from './control-plane.client';

@Module({
  providers: [ControlPlaneClient],
  exports: [ControlPlaneClient],
})
export class ControlPlaneClientModule {}
