import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  ReportStatus,
  AIAnalysisResult,
  ValidationResult,
  NotificationResult,
} from '../../interfaces';
import { ReportTemplateEntity } from '../template/template.entity';

@Entity('reports')
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  template_id: string;

  @ManyToOne(() => ReportTemplateEntity)
  @JoinColumn({ name: 'template_id' })
  template: ReportTemplateEntity;

  @Column({ type: 'varchar', length: 255 })
  session_id: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ReportStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  result_file: string | null;

  @Column({ type: 'jsonb', nullable: true })
  ai_analysis: AIAnalysisResult[] | null;

  @Column({ type: 'jsonb', nullable: true })
  validation_results: ValidationResult[] | null;

  @Column({ type: 'jsonb', nullable: true })
  notifications: NotificationResult[] | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;
}