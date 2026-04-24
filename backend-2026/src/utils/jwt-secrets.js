function getJwtSecret() {
  const configured = String(process.env.JWT_SECRET || '').trim()
  if (configured) return configured

  if (String(process.env.NODE_ENV || '').toLowerCase().trim() === 'production') {
    throw new Error('Missing required environment variable: JWT_SECRET')
  }

  // Dev fallback: keep backend usable even when .env isn't configured yet.
  // IMPORTANT: set JWT_SECRET in production.
  return 'dev-jwt-secret-pfe-2026'
}

function getJwtRefreshSecret() {
  const configured = String(process.env.JWT_REFRESH_SECRET || '').trim()
  if (configured) return configured

  if (String(process.env.NODE_ENV || '').toLowerCase().trim() === 'production') {
    throw new Error('Missing required environment variable: JWT_REFRESH_SECRET')
  }

  return 'dev-jwt-refresh-secret-pfe-2026'
}

module.exports = {
  getJwtSecret,
  getJwtRefreshSecret,
}

