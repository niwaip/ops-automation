import McpConnectionsPanel from '@chat-web/components/McpConnectionsPanel';
import { apiClient } from '@/shared/api/http/client';
export default function McpAdminPage() { return <McpConnectionsPanel api={apiClient} administrator />; }
