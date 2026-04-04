// Simple, test-friendly header helper (standalone JS to support tests without VSCode API)
function applyAuthHeader(headers, token) {
  if (typeof token === 'string' && token.length > 0) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

module.exports = { applyAuthHeader }
