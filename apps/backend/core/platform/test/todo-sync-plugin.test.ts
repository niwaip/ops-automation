import { TodoSyncPluginRegistry } from "../src/modules/workbench-todo/plugins/todo-sync-plugin.registry";
import { MicrosoftTodoPlugin } from "../src/modules/workbench-todo/plugins/adapters/microsoft-todo.plugin";
import { GoogleTasksPlugin } from "../src/modules/workbench-todo/plugins/adapters/google-tasks.plugin";
import { TodoPriority, TodoStatus } from "../src/modules/workbench-todo/dto/workbench-todo.dto";

describe("TodoSyncPlugin Architecture & Adapters", () => {
  let registry: TodoSyncPluginRegistry;
  let mockPrisma: any;
  let msPlugin: MicrosoftTodoPlugin;
  let gPlugin: GoogleTasksPlugin;

  beforeEach(() => {
    mockPrisma = {
      scopedMemory: {
        findFirst: jest.fn(),
      },
    };
    registry = new TodoSyncPluginRegistry();
    msPlugin = new MicrosoftTodoPlugin(mockPrisma as any);
    gPlugin = new GoogleTasksPlugin(mockPrisma as any);
  });

  it("should register plugins dynamically without altering core todo service", () => {
    registry.register(msPlugin);
    registry.register(gPlugin);

    const list = registry.list();
    expect(list.length).toBe(2);
    expect(list.map((p) => p.providerId)).toEqual(["microsoft_todo", "google_tasks"]);
  });

  it("should gracefully skip sync if user has not authorized Microsoft connection", async () => {
    mockPrisma.scopedMemory.findFirst.mockResolvedValue(null);

    const isEnabled = await msPlugin.isEnabled("user-1");
    expect(isEnabled).toBe(false);

    const exportResult = await msPlugin.exportTodo("user-1", {
      id: "todo-1",
      title: "测试待办",
      priority: TodoPriority.high,
      status: TodoStatus.pending,
    });

    expect(exportResult.skipped).toBe(true);
    expect(exportResult.success).toBe(false);
    expect(exportResult.reason).toContain("未授权");
  });

  it("should export todo to Microsoft Graph task contract when enabled", async () => {
    mockPrisma.scopedMemory.findFirst.mockResolvedValue({
      valueJson: {
        providerType: "microsoft_oauth",
        encryptedAccessToken: "enc_token_123",
      },
    });

    const isEnabled = await msPlugin.isEnabled("user-1");
    expect(isEnabled).toBe(true);

    const exportResult = await msPlugin.exportTodo("user-1", {
      id: "todo-1",
      title: "重要技术评审",
      description: "核对架构设计方案",
      priority: TodoPriority.urgent,
      status: TodoStatus.pending,
      dueDate: new Date("2026-09-05T10:00:00Z"),
    });

    expect(exportResult.success).toBe(true);
    expect(exportResult.externalId).toBe("ms-todo-todo-1");
  });

  it("should dispatch todo creation across all active plugins via registry", async () => {
    registry.register(msPlugin);
    registry.register(gPlugin);

    // 假设用户只开启了 Microsoft，未开启 Google
    mockPrisma.scopedMemory.findFirst.mockImplementation((args: any) => {
      return Promise.resolve({
        valueJson: {
          providerType: "microsoft_oauth",
          encryptedAccessToken: "valid_token",
        },
      });
    });

    const results = await registry.dispatchTodoCreated("user-1", {
      id: "todo-99",
      title: "全平台多端同步任务",
      priority: TodoPriority.medium,
      status: TodoStatus.pending,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].providerId).toBe("microsoft_todo");
    expect(results[0].success).toBe(true);
  });
});
