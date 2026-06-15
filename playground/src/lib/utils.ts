export function formatDate(date: Date) {
  return date.toISOString()
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function logRequest(method: string) {
  console.log(`[${formatDate(new Date())}] ${method}`)
}
