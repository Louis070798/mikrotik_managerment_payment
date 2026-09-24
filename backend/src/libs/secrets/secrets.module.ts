import { Global, Module } from '@nestjs/common';
import { EnvSecretStore } from './env-secret-store';

@Global()
@Module({
  providers: [EnvSecretStore],
  exports: [EnvSecretStore],
})
export class SecretsModule {}
