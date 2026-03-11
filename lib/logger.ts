/**
 * Structured logger for API routes.
 *
 * - Production (NODE_ENV === 'production'): JSON lines for Vercel log parsing.
 * - Development: human-readable colored output.
 *
 * Zero external dependencies.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogPayload {
  /** Route or module context, e.g. "scan", "cron/birthdays" */
  ctx: string;
  /** Human-readable message */
  msg: string;
  /** Restaurant ID (optional, for multi-tenant filtering) */
  rid?: string;
  /** Error string or object (optional) */
  err?: unknown;
  /** Arbitrary extra data */
  [key: string]: unknown;
}

const isProd = process.env.NODE_ENV === 'production';

function formatError(err: unknown): string | undefined {
  if (err === undefined || err === null) return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return String(err);
  }
}

function emit(level: LogLevel, payload: LogPayload): void {
  const { ctx, msg, rid, err, ...extra } = payload;
  const errStr = formatError(err);

  if (isProd) {
    // JSON line for structured log ingestion (Vercel / Datadog / etc.)
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      ctx,
      msg,
    };
    if (rid) entry.rid = rid;
    if (errStr) entry.err = errStr;
    if (Object.keys(extra).length > 0) Object.assign(entry, extra);

    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  } else {
    // Human-readable for local dev
    const tag = level.toUpperCase().padEnd(5);
    const ridPart = rid ? ` rid=${rid}` : '';
    const errPart = errStr ? ` | err: ${errStr}` : '';
    const extraPart =
      Object.keys(extra).length > 0 ? ` | ${JSON.stringify(extra)}` : '';
    const line = `[${tag}] [${ctx}]${ridPart} ${msg}${errPart}${extraPart}`;

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  info: (payload: LogPayload) => emit('info', payload),
  warn: (payload: LogPayload) => emit('warn', payload),
  error: (payload: LogPayload) => emit('error', payload),
};
