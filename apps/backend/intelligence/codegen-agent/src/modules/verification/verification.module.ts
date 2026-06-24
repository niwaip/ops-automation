import { Module } from '@nestjs/common';
import { DryRunService } from './dry-run.service';
import { PackageAssemblerService } from './package-assembler.service';
import { SecurityLintService } from './security-lint.service';

@Module({
  providers: [SecurityLintService, DryRunService, PackageAssemblerService],
  exports: [SecurityLintService, DryRunService, PackageAssemblerService],
})
export class VerificationModule {}
