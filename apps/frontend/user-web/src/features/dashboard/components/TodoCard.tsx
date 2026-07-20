import { PlayCircleOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Card, Checkbox, Empty, Input, List, Space, Tag, Typography } from 'antd';
import type { WorkbenchTodo } from '../lib/workbenchTodoStorage';
import { formatMonthDayTime } from '@/shared/utils/dateText';
import styles from '../pages/DashboardPage.module.css';

interface TodoCardProps {
  todoDraft: string;
  todoSummary: {
    total: number;
    pending: number;
    completed: number;
  };
  todos: WorkbenchTodo[];
  onCreateTodo: () => void;
  onDraftChange: (value: string) => void;
  onLaunchAiAssistant: (prompt: string) => void;
  onOpenNewExecution: () => void;
  onToggleTodo: (id: string, completed: boolean) => void;
}

export function TodoCard({
  todoDraft,
  todoSummary,
  todos,
  onCreateTodo,
  onDraftChange,
  onLaunchAiAssistant,
  onOpenNewExecution,
  onToggleTodo,
}: TodoCardProps) {
  return (
    <Card
      className={styles['workbench-panel']}
      title={
        <div className={styles['workbench-panel-header']}>
          <Typography.Text strong className={styles['workbench-panel-title']}>
            Todo
          </Typography.Text>
          <Typography.Text className={styles['workbench-panel-subtitle']}>
            记录今天要做的事，并用 AI 快速整理优先级与行动建议。
          </Typography.Text>
        </div>
      }
      extra={
        <Space>
          <Tag color="blue">待办 {todoSummary.pending}</Tag>
          <Tag color="success">已完成 {todoSummary.completed}</Tag>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div className={styles['workbench-todo-form']}>
          <Input.TextArea
            value={todoDraft}
            placeholder={
              '输入一段内容，系统会自动解析成任务\n例如：\n1. 今天 17:00 前处理人工接管执行单\n2. 跟进审批结果\n3. 整理今日总结'
            }
            onChange={(event) => onDraftChange(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
          <div className={styles['workbench-todo-form-actions']}>
            <Button
              type="primary"
              className={`${styles['workbench-action-button']} ${styles['workbench-todo-toolbar-button']} ${styles['is-create']}`}
              icon={<PlusOutlined />}
              onClick={onCreateTodo}
            >
              添加
            </Button>
            <Button
              className={`${styles['workbench-action-button']} ${styles['workbench-todo-toolbar-button']} ${styles['is-ai']}`}
              icon={<RobotOutlined />}
              onClick={() =>
                onLaunchAiAssistant(
                  [
                    '请帮我整理今天的 Todo，按优先级排序并补充建议动作。',
                    'Todo 列表：',
                    ...(todos.length
                      ? todos.map(
                          (item, index) =>
                            `${index + 1}. [${item.completed ? '已完成' : '待处理'}] ${item.title}`
                        )
                      : ['暂无 Todo']),
                  ].join('\n')
                )
              }
            >
              ai添加
            </Button>
            <Button
              className={`${styles['workbench-action-button']} ${styles['workbench-todo-toolbar-button']} ${styles['is-run']}`}
              icon={<PlayCircleOutlined />}
              onClick={onOpenNewExecution}
            >
              新建执行
            </Button>
          </div>
        </div>
        {todos.length === 0 ? (
          <Empty description="还没有 Todo，可以先添加一条或者让 AI 帮你规划" />
        ) : (
          <List
            dataSource={todos}
            renderItem={(item) => (
              <List.Item key={item.id} style={{ padding: 0, border: 'none' }}>
                <div className={styles['workbench-todo-item']} style={{ width: '100%' }}>
                  <Space
                    direction="vertical"
                    size={12}
                    style={{ width: '100%', opacity: item.completed ? 0.72 : 1 }}
                  >
                    <Space
                      className={styles['workbench-todo-row']}
                      style={{ width: '100%', justifyContent: 'space-between' }}
                    >
                      <Checkbox
                        checked={item.completed}
                        onChange={(event) => onToggleTodo(item.id, event.target.checked)}
                      >
                        <Typography.Text delete={item.completed}>{item.title}</Typography.Text>
                      </Checkbox>
                      <Button
                        size="small"
                        className={styles['workbench-action-button']}
                        icon={<RobotOutlined />}
                        onClick={() =>
                          onLaunchAiAssistant(
                            [
                              '请帮我处理这个 Todo。',
                              `Todo：${item.title}`,
                              '请输出：优先级、拆解步骤、预计耗时、如果需要发给他人的简短说明。',
                            ].join('\n')
                          )
                        }
                      >
                        AI 处理
                      </Button>
                    </Space>
                    <div className={styles['workbench-todo-meta']}>
                      <Tag bordered={false}>更新于 {formatMonthDayTime(item.updatedAt)}</Tag>
                    </div>
                  </Space>
                </div>
              </List.Item>
            )}
          />
        )}
      </Space>
    </Card>
  );
}
