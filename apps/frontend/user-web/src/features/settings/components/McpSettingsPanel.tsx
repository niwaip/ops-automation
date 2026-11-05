import McpConnectionsPanel from '@chat-web/components/McpConnectionsPanel';
import { apiClient } from '@/api';
export default function McpSettingsPanel() { return <McpConnectionsPanel api={apiClient} />; }
