import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  imports: [
    PrismaModule,
    ExecutionModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'jwt_secret_key_change_in_production',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
