import 'reflect-metadata';
import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Pool } from 'pg';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export type Role = 'admin' | 'manager' | 'staff';
export interface Identity { sub: string; email: string; name: string; role: Role }
export const ROLE_KEY = 'smart:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLE_KEY, roles);
export function getIdentity(auth?: string): Identity {
  if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Sign in to continue');
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.startsWith('CHANGE_ME') && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be configured');
  try {
    const payload = jwt.verify(auth.slice(7), secret ?? 'dev-only-unsafe-secret') as Identity & { type?: string };
    if (!payload.sub || !['admin', 'manager', 'staff'].includes(payload.role) || payload.type !== 'access') throw new Error('Invalid token');
    return payload;
  } catch { throw new UnauthorizedException('Invalid or expired token'); }
}
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: Identity }>();
    const user = getIdentity(req.headers.authorization);
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLE_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Your role cannot perform this action');
    req.user = user;
    return true;
  }
}
export const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map(x => `${x.path.join('.')}: ${x.message}`).join('; '));
  }
  return result.data;
};
export const id = () => randomUUID();
export function poolFor(env: string): Pool {
  const connectionString = process.env[env];
  if (!connectionString) throw new Error(`${env} is required; copy .env.example to .env`);
  const pool = new Pool({ connectionString, max: 12, connectionTimeoutMillis: 5000 });
  pool.on('error', err => console.error(`[postgres ${env}]`, err));
  return pool;
}
export function redis(): Redis { return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null, enableReadyCheck: true }); }
export const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), search: z.string().max(120).optional() });
export const uuid = z.string().uuid();
export const iso = (d: any) => d instanceof Date ? d.toISOString() : d;

/** Low-cardinality HTTP instrumentation suitable for Prometheus scraping. */
export function observability(service: string) {
  const registry = new Registry();
  registry.setDefaultLabels({ service });
  collectDefaultMetrics({ register: registry });
  const requests = new Counter({ name: 'smart_http_requests_total', help: 'HTTP requests by method and status', labelNames: ['method', 'status'] as const, registers: [registry] });
  const seconds = new Histogram({ name: 'smart_http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method'] as const, registers: [registry] });
  return {
    registry,
    middleware(req: Request, res: Response, next: NextFunction) {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        requests.inc({ method: req.method, status: String(res.statusCode) });
        seconds.observe({ method: req.method }, Number(process.hrtime.bigint() - start) / 1e9);
      });
      next();
    }
  };
}
export function startMessage(service: string, port: number) { console.log(`${service} ready at http://localhost:${port}`); }
export { boot, HealthControllerFactory } from './boot';
