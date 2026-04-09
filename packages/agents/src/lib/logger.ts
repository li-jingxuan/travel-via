
const NODE_ENV = process.env.NODE_ENV || "production"
console.log('[agents] Logger initialized. NODE_ENV:', NODE_ENV)

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

export function shouldLog(): boolean {
  return NODE_ENV === "developer" || isTruthy(process.env.AGENTS_LOG)
}

export function agentLog(scope: string, ...args: unknown[]) {
  if (!shouldLog()) return
  console.log(`[agents:${scope}]`, ...args)
}
