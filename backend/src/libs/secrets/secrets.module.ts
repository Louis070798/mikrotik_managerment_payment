import { Module } from '@nestjs/common';
import { EnvSecretStore } from './env-secret-store';

@Module({
  providers: [EnvSecretStore],
  exports: [EnvSecretStore],
})
export class SecretsModule {}
