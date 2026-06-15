export const db = {
  query: async (sql: string, params?: unknown[]) => {
    console.log('query:', sql, params)
    return []
  }
}
