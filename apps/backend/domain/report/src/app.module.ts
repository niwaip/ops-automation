import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateModule } from './modules/template/template.module';
import { ReportModule } from './modules/report/report.module';
import { getDatabaseHost } from './config/service-endpoints';

const getDatabaseConfig = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    const url = new URL(databaseUrl);
    return {
      type: 'postgres' as const,
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    };
  }

  return {
    type: 'postgres' as const,
    host: getDatabaseHost(),
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'ops',
    password: process.env.DB_PASSWORD || 'ops_secret',
    database: process.env.DB_DATABASE || 'ops',
    entities: [__dirname + '/**/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
  };
};

@Module({
  imports: [
    TypeOrmModule.forRoot(getDatabaseConfig()),
    TemplateModule,
    ReportModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
