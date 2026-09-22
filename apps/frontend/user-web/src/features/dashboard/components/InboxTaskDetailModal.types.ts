import type { WorkbenchInboxItem } from '../../../api/workbenchInbox';

export interface InboxTaskDetailModalProps {
  open: boolean;
  item: WorkbenchInboxItem | null;
  onClose: () => void;
  onFlow?: (item: WorkbenchInboxItem) => void;
  onOpenInAi?: (item: WorkbenchInboxItem) => void;
  onRecall?: (item: WorkbenchInboxItem) => void;
  onRemind?: (item: WorkbenchInboxItem) => void;
  onSuccess?: () => void;
}
