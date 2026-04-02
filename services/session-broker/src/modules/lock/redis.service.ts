import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('connect', () => {
      console.log('[RedisService] Connected to Redis');
    });

    this.client.on('error', (err) => {
      console.error('[RedisService] Redis error:', err);
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
    console.log('[RedisService] Disconnected from Redis');
  }

  getClient(): Redis {
    return this.client;
  }

  // Basic operations
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK' | null> {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    }
    return this.client.set(key, value, 'NX');
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hmset(key: string, fields: Record<string, string>): Promise<'OK'> {
    return this.client.hmset(key, fields);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.client.hdel(key, field);
  }

  // Set operations
  async sadd(key: string, members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async spop(key: string): Promise<string | null> {
    return this.client.spop(key);
  }

  async srem(key: string, member: string): Promise<number> {
    return this.client.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  // Lua script execution
  async eval(script: string, keys: string[], args: string[]): Promise<number> {
    const result = await this.client.eval(script, keys.length, ...keys, ...args);
    return typeof result === 'number' ? result : 0;
  }

  // Increment
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }
}