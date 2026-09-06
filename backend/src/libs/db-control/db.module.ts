import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { ENV_TOKEN } from '@config/config.module';
import type { Env } from '@config/env.schema';
import { createDbClient, DbClient } from './client';

export const DB_TOKEN = 'DB_TOKEN';
export const DB_POOL_TOKEN = 'DB_POOL_TOKEN';
const DB_CONN_TOKEN = 'DB_CONN_TOKEN';

@Global()
@Module({
  providers: [
    {
      provide: DB_CONN_TOKEN,
      useFactory: (env: Env) => createDbClient(env.DATABASE_CONTROL_URL),
      inject: [ENV_TOKEN],
    },
    {
      provide: DB_TOKEN,
      useFactory: (conn: { db: DbClient; pool: Pool }) => conn.db,
      inject: [DB_CONN_TOKEN],
    },
    {
      provide: DB_POOL_TOKEN,
      useFactory: (conn: { db: DbClient; pool: Pool }) => conn.pool,
      inject: [DB_CONN_TOKEN],
    },
  ],
  exports: [DB_TOKEN, DB_POOL_TOKEN],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB_POOL_TOKEN) private readonly pool: Pool) {}
  async onModuleDestroy() {
    await this.pool.end();
  }
}

export type { DbClient };
