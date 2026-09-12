import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import { AppModule } from './app.module';
import { EnvelopeInterceptor } from '@common/envelope.interceptor';
import { AllExceptionsFilter } from '@common/exception.filter';

const DEV_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export async function buildApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }), {
    logger: ['error', 'warn', 'log'],
  });

  // CORS tạm cho giai đoạn dev/demo — chưa có Auth/RBAC thật nên chưa cần policy theo domain
  // production. Khi triển khai thật, thay danh sách cứng này bằng origin đã biết trước.
  // `as any`: @fastify/cors resolve type theo node_modules/fastify gốc, khác bản fastify
  // @nestjs/platform-fastify bundle riêng — hai bản không tương thích ở tầng type dù
  // tương thích hoàn toàn ở runtime (duck typing của fastify plugin).
  await app.register(fastifyCors as any, { origin: DEV_CORS_ORIGINS });

  app.setGlobalPrefix('api/v1');
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Liveness/readiness — NGOÀI /api/v1 theo docs/backend/03-API_DESIGN.md §8.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/healthz', async () => ({ status: 'ok' }));
  fastify.get('/readyz', async () => ({ status: 'ok' }));

  return app;
}

async function bootstrap() {
  const app = await buildApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Backend listening on :${port} (prefix /api/v1)`);
}

if (require.main === module) {
  bootstrap();
}
