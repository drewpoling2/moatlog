import { authenticate } from './auth'
import { db } from '../lib/db'
import { logRequest } from '../lib/utils'

export async function getUsers(limit = 50, offset = 0) {
  logRequest('GET /users')
  try {
    await authenticate()
    return await db.query(
      'SELECT * FROM users LIMIT ? OFFSET ?',
      [limit, offset]
    )
  } catch (error) {
    console.error('getUsers failed:', error)
    throw error
  }
}

export async function createUser(data: Record<string, unknown>) {
  logRequest('POST /users')
  try {
    await authenticate()
    return await db.query('INSERT INTO users VALUES (?)', [data])
  } catch (error) {
    console.error('createUser failed:', error)
    throw error
  }
}
