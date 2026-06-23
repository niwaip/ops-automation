// API Health Check (for download page)
export function healthCheck(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}
