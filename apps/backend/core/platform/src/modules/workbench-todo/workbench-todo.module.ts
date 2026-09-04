import { Module, OnModuleInit } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { WorkbenchTodoController } from "./workbench-todo.controller";
import { WorkbenchTodoService } from "./workbench-todo.service";
import { WorkbenchTodoParserService } from "./workbench-todo-parser.service";
import { WorkbenchTodoExecutorService } from "./workbench-todo-executor.service";
import { TodoSyncPluginRegistry } from "./plugins/todo-sync-plugin.registry";
import { MicrosoftTodoPlugin } from "./plugins/adapters/microsoft-todo.plugin";
import { GoogleTasksPlugin } from "./plugins/adapters/google-tasks.plugin";

@Module({
  imports: [PrismaModule],
  controllers: [WorkbenchTodoController],
  providers: [
    WorkbenchTodoService,
    WorkbenchTodoParserService,
    WorkbenchTodoExecutorService,
    TodoSyncPluginRegistry,
    MicrosoftTodoPlugin,
    GoogleTasksPlugin,
  ],
  exports: [WorkbenchTodoService, TodoSyncPluginRegistry],
})
export class WorkbenchTodoModule implements OnModuleInit {
  constructor(
    private readonly registry: TodoSyncPluginRegistry,
    private readonly msTodoPlugin: MicrosoftTodoPlugin,
    private readonly googleTasksPlugin: GoogleTasksPlugin
  ) {}

  onModuleInit() {
    this.registry.register(this.msTodoPlugin);
    this.registry.register(this.googleTasksPlugin);
  }
}
