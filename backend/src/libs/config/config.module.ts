import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env.schema';

export const ENV_TOKEN = 'ENV_TOKEN';

@Global()
@Module({
  providers: [{ provide: ENV_TOKEN, useValue: loadEnv() }],
  exports: [ENV_TOKEN],
})
export class AppConfigModule {}
