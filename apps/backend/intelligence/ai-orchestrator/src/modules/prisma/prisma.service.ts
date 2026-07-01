import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // #region debug-point A:init-connect
    (() => {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const envPath = path.resolve(process.cwd(), '.dbg/ai-orchestrator-prisma-engine.env');
      let debugUrl = 'http://127.0.0.1:7777/event';
      let sessionId = 'ai-orchestrator-prisma-engine';
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugUrl;
        sessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
      } catch {}
      void fetch(debugUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          runId: 'pre-fix',
          hypothesisId: 'A',
          location: 'src/modules/prisma/prisma.service.ts:onModuleInit:before-connect',
          msg: '[DEBUG] Prisma init environment snapshot',
          data: {
            cwd: process.cwd(),
            platform: process.platform,
            arch: process.arch,
            prismaSchemaExists: fs.existsSync(path.resolve(process.cwd(), 'prisma/schema.prisma')),
            generatedSchemaExists: fs.existsSync(
              path.resolve(process.cwd(), 'src/generated/prisma/schema.prisma')
            ),
            generatedLibraryExists: fs.existsSync(
              path.resolve(process.cwd(), 'src/generated/prisma/runtime/library.js')
            ),
            distGeneratedLibraryExists: fs.existsSync(
              path.resolve(process.cwd(), 'dist/generated/prisma/runtime/library.js')
            ),
          },
          ts: Date.now(),
        }),
      }).catch(() => undefined);
    })();
    // #endregion
    try {
      await this.$connect();
    } catch (error) {
      // #region debug-point B:connect-error
      (() => {
        const fs = require('fs') as typeof import('fs');
        const path = require('path') as typeof import('path');
        const envPath = path.resolve(process.cwd(), '.dbg/ai-orchestrator-prisma-engine.env');
        let debugUrl = 'http://127.0.0.1:7777/event';
        let sessionId = 'ai-orchestrator-prisma-engine';
        try {
          const envContent = fs.readFileSync(envPath, 'utf8');
          debugUrl = envContent.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || debugUrl;
          sessionId = envContent.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
        } catch {}
        const err = error instanceof Error ? error : new Error(String(error));
        void fetch(debugUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'src/modules/prisma/prisma.service.ts:onModuleInit:connect-error',
            msg: '[DEBUG] Prisma connect failed',
            data: {
              name: err.name,
              message: err.message,
              stack: err.stack,
              prismaGeneratedSchemaPreview: (() => {
                try {
                  return fs
                    .readFileSync(path.resolve(process.cwd(), 'src/generated/prisma/schema.prisma'), 'utf8')
                    .split('\n')
                    .slice(0, 8)
                    .join('\n');
                } catch {
                  return null;
                }
              })(),
            },
            ts: Date.now(),
          }),
        }).catch(() => undefined);
      })();
      // #endregion
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
