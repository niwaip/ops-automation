import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateModule } from './modules/template/template.module';
import { getDatabaseHost } from './config/service-endpoints';

// Parse DATABASE_URL if available, otherwise use individual env vars
const getDatabaseConfig = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    // Parse DATABASE_URL: postgresql://user:password@host:port/database
    const url = new URL(databaseUrl);
    return {
      type: 'postgres' as const,
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading '/'
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
