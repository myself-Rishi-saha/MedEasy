export type LogLevel = 'info' | 'warn' | 'error'

export interface LogContext {
  requestId?: string
  route?: string
  actorId?: string
  recordId?: string
  statusCode?: number
}

export function logEvent(level: LogLevel, event: string, context: LogContext = {}) {
  const safeContext = {
    requestId: context.requestId,
    route: context.route,
    actorId: context.actorId,
    recordId: context.recordId,
    statusCode: context.statusCode,
  }
  const payload = JSON.stringify({ level, event, occurredAt: new Date().toISOString(), ...safeContext })
  if (level === 'error') console.error(payload)
  else if (level === 'warn') console.warn(payload)
  else console.info(payload)
}
