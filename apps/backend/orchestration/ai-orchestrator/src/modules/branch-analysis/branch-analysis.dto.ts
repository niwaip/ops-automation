import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BranchPageSignalsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buttons?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  headings?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  links?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentPageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageText?: string;
}

export class BranchNextActionDto {
  @ApiProperty({ enum: ['click'] })
  @IsString()
  action!: 'click';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selector?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty()
  @IsString()
  description!: string;
}

export class AnalyzeBranchConditionDto {
  @ApiProperty({ description: 'Runtime session ID of the active browser session' })
  @IsString()
  runtimeSessionId!: string;

  @ApiProperty({ description: 'Natural language description of the branch intent' })
  @IsString()
  userIntent!: string;

  @ApiProperty({
    description: 'Behavior when the branch condition is not met',
    enum: ['takeover', 'stop', 'continue'],
    required: false,
    default: 'takeover',
  })
  @IsOptional()
  @IsEnum(['takeover', 'stop', 'continue'] as const)
  onMismatch?: 'takeover' | 'stop' | 'continue';

  @ApiPropertyOptional({
    description: 'Optional page signals collected during recording to improve branch generation',
    type: BranchPageSignalsDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BranchPageSignalsDto)
  pageSignals?: BranchPageSignalsDto;
}

export class BranchStepSpecDto {
  @ApiProperty({ type: [String], description: 'Candidate selectors used to read the page value' })
  readSelectors!: string[];

  @ApiProperty({ enum: ['innerText', 'textContent', 'value'] })
  readMethod!: 'innerText' | 'textContent' | 'value';

  @ApiProperty({ description: 'Variable name used to store the captured page value' })
  outputVar!: string;

  @ApiProperty({ description: 'Serialized JS function used by the branch step' })
  conditionFn!: string;

  @ApiProperty({ description: 'Reason shown when takeover is triggered' })
  takeoverReason!: string;

  @ApiProperty({ enum: ['takeover', 'stop', 'continue'] })
  onMismatch!: 'takeover' | 'stop' | 'continue';

  @ApiProperty({ enum: ['continue', 'stop'] })
  onMatch!: 'continue' | 'stop';

  @ApiProperty({ description: 'Human-readable description for the branch block' })
  description!: string;
}

export class AnalyzeBranchConditionResponseDto {
  @ApiProperty({ type: BranchStepSpecDto })
  branchStepSpec!: BranchStepSpecDto;

  @ApiPropertyOptional({ type: BranchNextActionDto })
  nextAction?: BranchNextActionDto;

  @ApiProperty({ enum: ['llm', 'fallback'] })
  analysisSource!: 'llm' | 'fallback';

  @ApiProperty({
    description: 'Basic browser page context used during analysis',
    type: 'object',
    required: false,
    additionalProperties: false,
    properties: {
      pageUrl: { type: 'string' },
      pageTitle: { type: 'string' },
    },
  })
  pageContext?: {
    pageUrl?: string;
    pageTitle?: string;
  };
}
