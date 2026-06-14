function addLog(
  logs,
  stepIndex,
  level,
  message,
  data = {}
) {

  logs.push({
    id: `LOG-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),

    stepIndex,

    level: String(level || 'INFO').toUpperCase(),

    message: String(message || ''),

    data,

    executionTime: Date.now()
  })
}

module.exports = { addLog }