import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';

type SseEmitter = {
  progress: (step: string, progress: number, message: string) => void;
  result: (data: any) => void;
  error: (error: string) => void;
  end: () => void;
};

export function setupSseResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

export function createSseEmitter(res: Response): SseEmitter {
  return {
    progress(step: string, progress: number, message: string) {
      res.write(`data: ${JSON.stringify({ type: 'progress', step, progress, message })}\n\n`);
    },
    result(data: any) {
      res.write(`data: ${JSON.stringify({ type: 'result', data })}\n\n`);
    },
    error(error: string) {
      res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    },
    end() {
      res.end();
    },
  };
}

export function createAiIdentifyProgressEmitter(res: Response) {
  return {
    progress(progress: any) {
      res.write(
        `data: ${JSON.stringify({
          type: 'progress',
          stage: progress.stage,
          stageName: progress.stageName,
          progress: progress.progress,
          message: progress.message,
          currentSection: progress.currentSection,
        })}\n\n`
      );
    },
    result(data: any) {
      res.write(
        `data: ${JSON.stringify({
          type: 'result',
          data,
        })}\n\n`
      );
      res.end();
    },
    error(message: string) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message,
        })}\n\n`
      );
      res.end();
    },
  };
}

export function loadStoredSkill(
  templatesDir: string,
  skillId: string | undefined,
  logger: { warn: (message: string) => void }
): any {
  if (!skillId) {
    return undefined;
  }

  const skillPath = path.join(templatesDir, `skill_${skillId}.json`);
  if (!fs.existsSync(skillPath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(skillPath, 'utf-8'));
  } catch {
    logger.warn(`Failed to parse skill file: ${skillPath}`);
    return undefined;
  }
}

export function parseJsonObjectOrDefault(raw: string | undefined, defaultValue: Record<string, any>) {
  if (!raw) {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}
