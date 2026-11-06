import { Module } from '@nestjs/common';
import { McpPersonalController } from './mcp-personal.controller';
@Module({ controllers: [McpPersonalController] })
export class McpClientModule {}
