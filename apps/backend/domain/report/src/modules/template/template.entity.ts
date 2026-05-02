import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ReportFormat,
  ReportSection,
  ReportTemplateConfig,
  AIConfig,
  NotificationConfig,
} from '../../interfaces';

@Entity('report_templates')
export class ReportTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  format: ReportFormat;

  @Column({ type: 'varchar', length: 500, nullable: true })
  template_file: string | null;

  @Column({ type: 'jsonb' })
  sections: ReportSection[];

  @Column({ type: 'jsonb', nullable: true })
  global_config: ReportTemplateConfig | null;

  @Column({ type: 'jsonb', nullable: true })
  ai_config: AIConfig | null;

  @Column({ type: 'jsonb', nullable: true })
  notification_config: NotificationConfig | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}