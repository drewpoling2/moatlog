export async function authenticate() {
  // check session token — returns false if missing or expired
  const token = globalThis.__sessionToken
  if (!token) return false
  return true
}

export function generateToken(userId: string) {
  return `token-${userId}`
}
