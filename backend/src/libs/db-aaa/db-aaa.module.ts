import { Global, Inject, Module, OnModuleDestroy, Optional } from '@nestjs/common';
import { Pool } from 'pg';
import { AaaDbClient, createAaaDbClient } from './client';

export const AAA_DB_TOKEN = 'AAA_DB_TOKEN';
export const AAA_DB_POOL_TOKEN = 'AAA_DB_POOL_TOKEN';
const AAA_CONN_TOKEN = 'AAA_CONN_TOKEN';

/**
 * Ket noi thu HAI, toi database cua FreeRADIUS -- doc lap hoan toan voi DbModule (control DB).
 *
 * Ca hai token deu co the la NULL khi DATABASE_AAA_URL chua duoc cau hinh: he thong van chay binh
 * thuong o che do RADIUS nhung (RADIUS_MODE=embedded). Moi noi inject phai xu ly null thay vi gia
 * dinh co ket noi -- day la ly do dung @Optional()/kiem tra null o service.
 *
 * DATABASE_AAA_URL doc thang tu process.env chu khong qua env.schema.ts: Tier-0 (ADR-04) la danh
 * sach dong bang, va day la dia chi mot dich vu ngoai -- dung quy uoc giong RADIUS_SECRET_ENCRYPTION_KEY.
 */
@Global()
@Module({
  providers: [
    {
      provide: AAA_CONN_TOKEN,
      useFactory: () => {
        const url = process.env.DATABASE_AAA_URL;
        return url ? createAaaDbClient(url) : null;
      },
    },
    {
      provide: AAA_DB_TOKEN,
      useFactory: (conn: { db: AaaDbClient; pool: Pool } | null) => conn?.db ?? null,
      inject: [AAA_CONN_TOKEN],
    },
    {
      provide: AAA_DB_POOL_TOKEN,
      useFactory: (conn: { db: AaaDbClient; pool: Pool } | null) => conn?.pool ?? null,
      inject: [AAA_CONN_TOKEN],
    },
  ],
  exports: [AAA_DB_TOKEN, AAA_DB_POOL_TOKEN],
})
export class DbAaaModule implements OnModuleDestroy {
  constructor(@Optional() @Inject(AAA_DB_POOL_TOKEN) private readonly pool: Pool | null) {}
  async onModuleDestroy() {
    await this.pool?.end();
  }
}

export type { AaaDbClient };
