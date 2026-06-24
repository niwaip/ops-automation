import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker, NativeConnection } from '@temporalio/worker';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WorkerService implements OnModuleInit {
  private readonly logger = new Logger('WorkerService');
  private worker: Worker | null = null;
  private isRunning = false;

  async onModuleInit() {
    // Auto-start worker if configured
    if (process.env.AUTO_START_WORKER === 'true') {
      await this.startWorker();
    }
  }

  /**
   * Start the Temporal worker
   */
  async startWorker(taskQueue = 'SKILL_TASK_QUEUE'): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning) {
      return { success: true };
    }

    try {
      this.logger.log(`Starting Temporal worker on task queue: ${taskQueue}`);

      // Create activities directory if it doesn't exist
      const activitiesDir = path.join(process.cwd(), 'src', 'activities');
      if (!fs.existsSync(activitiesDir)) {
        fs.mkdirSync(activitiesDir, { recursive: true });
      }

      // The worker will look for workflows and activities in the src directory
      this.worker = await Worker.create({
        workflowsPath: path.join(process.cwd(), 'src', 'workflows'),
        activities: {},
        taskQueue,
      });

      // Run worker in background
      this.worker.run();
      this.isRunning = true;
      this.logger.log('Temporal worker started successfully');

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to start worker: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Stop the Temporal worker
   */
  async stopWorker(): Promise<{ success: boolean }> {
    if (this.worker) {
      await this.worker.shutdown();
      this.worker = null;
      this.isRunning = false;
      this.logger.log('Temporal worker stopped');
    }
    return { success: true };
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      taskQueue: process.env.TASK_QUEUE || 'SKILL_TASK_QUEUE',
    };
  }
}
