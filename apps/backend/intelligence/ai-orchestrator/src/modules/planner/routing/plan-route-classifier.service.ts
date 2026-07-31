import { Injectable, Logger } from '@nestjs/common';

export type PlanRouteType = 'single_skill' | 'deterministic_plan';

const SEQUENTIAL_KEYWORDS = ['然后', '并且', '接着', '之后', '再', '最后', '以及', '并且对', '并'];
const PROCESSING_KEYWORDS = ['总结', '提炼', '翻译', '提取', '改写', '归纳', '分析'];
const ARTIFACT_KEYWORDS = [
  '输出 md',
  '输出md',
  '生成 md',
  '生成md',
  'md 文件',
  'md文件',
  'markdown 文件',
  'markdown文件',
  '输出文件',
  '生成文件',
  '保存为',
  '导出',
  '写到文件',
  '输出为',
];

@Injectable()
export class PlanRouteClassifierService {
  private readonly logger = new Logger(PlanRouteClassifierService.name);

  public classifyRoute(userRequest: string): PlanRouteType {
    if (!userRequest || typeof userRequest !== 'string') {
      return 'single_skill';
    }

    const text = userRequest.trim();

    // Check for explicit multi-step compound signals
    const hasSequentialKeyword = SEQUENTIAL_KEYWORDS.some((kw) => text.includes(kw));
    const hasProcessingKeyword = PROCESSING_KEYWORDS.some((kw) => text.includes(kw));
    const hasArtifactKeyword = ARTIFACT_KEYWORDS.some((kw) => text.includes(kw));

    if (hasArtifactKeyword || (hasSequentialKeyword && hasProcessingKeyword)) {
      this.logger.log(`Classified request as 'deterministic_plan' (sequential=${hasSequentialKeyword}, processing=${hasProcessingKeyword}, artifact=${hasArtifactKeyword})`);
      return 'deterministic_plan';
    }

    this.logger.log(`Classified request as 'single_skill' (fast path)`);
    return 'single_skill';
  }
}
