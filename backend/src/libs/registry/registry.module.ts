import { Global, Module } from '@nestjs/common';
import { ServiceRegistry } from './service-registry.service';
import { CircuitBreakerStore } from './circuit-breaker-store';

@Global()
@Module({
  providers: [ServiceRegistry, CircuitBreakerStore],
  exports: [ServiceRegistry, CircuitBreakerStore],
})
export class RegistryModule {}
