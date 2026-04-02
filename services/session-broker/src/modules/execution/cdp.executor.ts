import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CdpExecutor {
  private readonly logger = new Logger(CdpExecutor.name);

  // Chrome CDP HTTP endpoint (ops-browser-chrome)
  private readonly cdpHost = process.env.CDP_HOST || 'localhost';
  private readonly cdpPort = process.env.CDP_PORT || '9222';

  /**
   * Navigate to a URL using Chrome CDP HTTP API
   * Uses /json/new to create a new tab with the URL
   */
  async navigateToUrl(url: string): Promise<{ success: boolean; targetId?: string; error?: string }> {
    try {
      const cdpUrl = `http://${this.cdpHost}:${this.cdpPort}`;

      this.logger.log(`Navigating to URL: ${url} via CDP ${cdpUrl}`);

      // Create a new tab with the URL
      const newTabUrl = `${cdpUrl}/json/new?${encodeURIComponent(url)}`;
      const response = await fetch(newTabUrl);

      if (!response.ok) {
        const error = `Failed to create new tab: ${response.status}`;
        this.logger.error(error);
        return { success: false, error };
      }

      const tabInfo = await response.json() as { id?: string };
      this.logger.log(`Created new tab: ${tabInfo.id}`);

      return { success: true, targetId: tabInfo.id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Navigation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get list of open tabs
   */
  async getTabs(): Promise<Array<{ id: string; url: string; title: string }>> {
    try {
      const cdpUrl = `http://${this.cdpHost}:${this.cdpPort}`;
      const response = await fetch(`${cdpUrl}/json/list`);

      if (!response.ok) {
        return [];
      }

      const tabs = await response.json() as Array<{ id: string; url: string; title: string }>;
      return tabs;
    } catch {
      return [];
    }
  }

  /**
   * Close a tab by target ID
   */
  async closeTab(targetId: string): Promise<boolean> {
    try {
      const cdpUrl = `http://${this.cdpHost}:${this.cdpPort}`;
      const response = await fetch(`${cdpUrl}/json/close/${targetId}`, { method: 'PUT' });
      return response.ok;
    } catch {
      return false;
    }
  }
}