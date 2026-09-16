import { EventEmitter } from 'node:events';

export interface LogLine {
  t: string;
  level: 'info' | 'warn' | 'error' | 'ok';
  msg: string;
}

export const logBus = new EventEmitter();
export const logEntries: LogLine[] = [];

export function log(level: LogLine['level'], msg: string): void {
  const line: LogLine = { t: new Date().toISOString(), level, msg };
  logEntries.push(line);
  logBus.emit('log', line);
  const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : level === 'ok' ? '[OK]' : '[i]';
  if (level === 'error') console.error(`${prefix} ${msg}`);
  else console.log(`${prefix} ${msg}`);
}