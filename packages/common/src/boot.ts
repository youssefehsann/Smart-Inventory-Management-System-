import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, Module, Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { observability, startMessage } from './index';

export function HealthControllerFactory(check: () => Promise<unknown>) {
  @Controller()
  class HealthController {
    @Get('health') live() { return { status: 'ok' }; }
    @Get('ready') async ready() { await check(); return { status: 'ready' }; }
  }
  return HealthController;
}
export async function boot(root: any, service: string, fallbackPort: number, check: () => Promise<unknown>): Promise<INestApplication> {
  // Health is provided in each service module. This bootstrap exposes metrics.
  const app = await NestFactory.create(root, { cors: { origin: process.env.FRONTEND_ORIGIN?.split(',') ?? ['http://localhost:5173'] }, bodyParser: true });
  const obs = observability(service);
  app.use(obs.middleware);
  const http = app.getHttpAdapter().getInstance();
  http.get('/metrics', async (_req: any, res: any) => { res.setHeader('Content-Type', obs.registry.contentType); res.send(await obs.registry.metrics()); });
  const port = Number(process.env.PORT || fallbackPort);
  await app.listen(port, '0.0.0.0');
  startMessage(service, port);
  process.on('SIGTERM', () => { void app.close().then(() => process.exit(0)); });
  return app;
}
