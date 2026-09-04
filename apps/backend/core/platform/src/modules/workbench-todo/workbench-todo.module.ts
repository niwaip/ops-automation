import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkbenchTodoController } from './workbench-todo.controller';
import { WorkbenchTodoService } from './workbench-todo.service';
import { WorkbenchTodoParserService } from './workbench-todo-parser.service';
import { WorkbenchTodoExecutorService } from './workbench-todo-executor.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkbenchTodoController],
  providers: [
    WorkbenchTodoService,
    WorkbenchTodoParserService,
    WorkbenchTodoExecutorService,
  ],
  exports: [WorkbenchTodoService],
})
export class WorkbenchTodoModule {}
