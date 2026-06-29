import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DefaultSemanticDomainBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DefaultSemanticDomainBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.BROWSER_SEMANTICS_AUTO_SEED === 'false') {
      this.logger.log('Skip default semantic domain bootstrap because auto seed is disabled');
      return;
    }

    const domain = await this.prisma.semanticRuleDomain.upsert({
      where: { code: 'browser_recorder' },
      update: {
        enabled: true,
      },
      create: {
        code: 'browser_recorder',
        name: 'Browser Recorder',
        description: 'Default semantic rule domain for browser recorder parsing and normalization',
        enabled: true,
      },
    });

    this.logger.log(`Default semantic domain ensured: ${domain.code}`);
  }
}
