import { Module } from '@nestjs/common';
import { SecretsModule } from '@secrets/secrets.module';
import { AuditLibModule } from '@audit/audit.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [SecretsModule, AuditLibModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
