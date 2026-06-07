export type NotificationSource = "execution" | "report";

export type NotificationSeverity = "success" | "error" | "warning" | "info";

export type NotificationCategory =
  | "completed"
  | "failed"
  | "cancelled"
  | "waiting_input"
  | "pending_approval"
  | "human_control"
  | "status_update";

export interface AppNotification {
  id: string;
  dedupeKey: string;
  source: NotificationSource;
  sourceId: string;
  sourceName?: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  status?: string;
  stateKey: string;
  timestamp: string;
  unread: boolean;
  requiresAction: boolean;
  actionUrl: string;
  metadata?: Record<string, unknown>;
}
