import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { HabitLearningService } from './habit-learning.service';

@Injectable()
export class HabitLearningRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HabitLearningRunnerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly habits: HabitLearningService) {}

  onModuleInit() {
    if (process.env.HABIT_LEARNING_DAILY_JOB_ENABLED !== 'true') return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref?.();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running || !this.isDueInShanghai()) return;
    this.running = true;
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    try {
      await this.habits.runNow(`daily:${day}`);
    } catch (error: any) {
      this.logger.error(`Daily habit learning failed: ${error?.message || error}`);
    } finally {
      this.running = false;
    }
  }

  private isDueInShanghai(): boolean {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    return hour > 2 || (hour === 2 && minute >= 30);
  }
}

