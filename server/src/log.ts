import { randomUUID } from "node:crypto";

export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function logInfo(reqId: string, route: string, msg: string, extra?: Record<string, unknown>): void {
  const tail = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[${reqId}] ${route} ${msg}${tail}`);
}

export function logError(reqId: string, route: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.stack || err.message : String(err);
  console.error(`[${reqId}] ${route} ${msg}\n${detail}`);
}
