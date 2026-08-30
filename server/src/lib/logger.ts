import { env } from './env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = env.isProduction ? 'info' : 'debug';

const COLORS: Record<Level, string> = {
  debug: '\u001B[90m',
  info: '\u001B[36m',
  warn: '\u001B[33m',
  error: '\u001B[31m',
};
const RESET = '\u001B[0m';

function formatDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return env.isProduction ? detail.message : (detail.stack ?? detail.message);
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function write(level: Level, message: string, detail?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const time = new Date().toISOString();
  const prefix = env.isProduction
    ? `[${time}] ${level.toUpperCase()}`
    : `${COLORS[level]}[${time}] ${level.toUpperCase()}${RESET}`;

  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  const suffix = detail === undefined ? '' : ` ${formatDetail(detail)}`;
  stream.write(`${prefix} ${message}${suffix}\n`);
}

export const logger = {
  debug: (message: string, detail?: unknown) => write('debug', message, detail),
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail),
};
