import { Module } from '@nestjs/common';
import { CodeWriterService } from './code-writer.service';
import { DependencyResolverService } from './dependency-resolver.service';
import { PromptAssemblyService } from './prompt-assembly.service';

@Module({
  providers: [PromptAssemblyService, DependencyResolverService, CodeWriterService],
  exports: [PromptAssemblyService, DependencyResolverService, CodeWriterService],
})
export class GeneratorModule {}
