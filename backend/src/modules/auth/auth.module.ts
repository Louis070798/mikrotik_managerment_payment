import { Module } from '@nestjs/common';
import { SecretsModule } from '@secrets/secrets.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [SecretsModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
