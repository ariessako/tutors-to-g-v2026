import type { Server } from 'node:http';
import type { Express } from 'express';
import { afterAll } from 'vitest';

const open = new Set<Server>();

/**
 * Listens on one loopback port for the whole test, instead of supertest's
 * default of a fresh server per request. Per-request servers churn through
 * ephemeral ports, and under load a request could reach a recycled port and
 * fail with a socket hang-up, a timeout or a stray 401.
 */
export function serve(app: Express) {
  const server = app.listen(0, '127.0.0.1');
  open.add(server);
  return server;
}

export async function close(server: Server) {
  open.delete(server);
  await new Promise<void>((done) => server.close(() => done()));
}

afterAll(async () => {
  await Promise.all([...open].map(close));
});
