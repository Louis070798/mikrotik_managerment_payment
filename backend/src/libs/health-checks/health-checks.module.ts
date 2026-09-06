import { Global, Module } from '@nestjs/common';
import { EnvCredentialResolver } from './credential-resolver';
import { RadiusHealthChecker } from './radius.checker';
import { DatabaseHealthChecker } from './database.checker';
import { CollectorHealthChecker } from './collector.checker';
import { BackupHealthChecker } from './backup.checker';
import { HealthSweepService } from './health-sweep.service';

const CREDENTIAL_RESOLVER_TOKEN = 'CredentialResolver';

@Global()
@Module({
  providers: [
    { provide: CREDENTIAL_RESOLVER_TOKEN, useClass: EnvCredentialResolver },
    {
      provide: RadiusHealthChecker,
      useFactory: (cr: EnvCredentialResolver) => new RadiusHealthChecker(cr),
      inject: [CREDENTIAL_RESOLVER_TOKEN],
    },
    {
      provide: DatabaseHealthChecker,
      useFactory: (cr: EnvCredentialResolver) => new DatabaseHealthChecker(cr),
      inject: [CREDENTIAL_RESOLVER_TOKEN],
    },
    CollectorHealthChecker,
    BackupHealthChecker,
    HealthSweepService,
  ],
  exports: [RadiusHealthChecker, DatabaseHealthChecker, CollectorHealthChecker, BackupHealthChecker, HealthSweepService],
})
export class HealthChecksModule {}
