import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TemplateStatus, TemplateStep, ParamsSchema } from '../../types/template.types';

@Entity('templates')
export class TemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, default: '1.0.0' })
  version: string;

  @Column({
    type: 'enum',
    enum: ['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REVOKED'],
    default: 'DRAFT',
  })
  status: TemplateStatus;

  @Column({ length: 1000, nullable: true })
  description: string;

  @Column({ type: 'jsonb', default: {} })
  params_schema: ParamsSchema;

  @Column({ type: 'jsonb', default: [] })
  steps: TemplateStep[];

  @Column({ type: 'jsonb', default: [] })
  guards: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @Column('uuid')
  created_by: string;

  @Column('uuid', { nullable: true })
  reviewed_by: string;

  @Column({ type: 'timestamp', nullable: true })
  published_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  deprecated_at: Date;
}