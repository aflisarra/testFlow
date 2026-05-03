type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function readNestedMessage(err: UnknownRecord): string | null {
  const error = err['error']
  if (isRecord(error)) {
    const message = error['message']
    if (typeof message === 'string' && message.trim()) return message
  }
  const message = err['message']
  if (typeof message === 'string' && message.trim()) return message
  return null
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback
  if (typeof err === 'string') return err || fallback
  if (err instanceof Error) return err.message || fallback
  if (isRecord(err)) return readNestedMessage(err) || fallback
  return fallback
}

export function getErrorStatus(err: unknown): number | null {
  if (!isRecord(err)) return null
  const status = err['status']
  return typeof status === 'number' ? status : null
}

