// Lightweight JS HTTP client compatible with Node for Phase 1 tests
const TokenManager = require('./tokenManager.js');

async function httpRequest(method, url, headers = {}, body, tokenOverride, fetchOverride) {
  const start = Date.now();
  // Apply token (override supported for tests)
  if (tokenOverride) {
    headers['Authorization'] = `Bearer ${tokenOverride}`;
  } else if (TokenManager && typeof TokenManager.applyAuth === 'function') {
    TokenManager.applyAuth(headers);
  }
  const fetchFn = fetchOverride || (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
  if (!fetchFn) throw new Error('Fetch API is not available in this environment');
  const res = await fetchFn(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const durationMs = Date.now() - start;
  let contentType = '';
  try {
    contentType = res.headers?.get?.('content-type') ?? (res.headers?.['content-type'] ?? '');
  } catch {
    contentType = '';
  }
  let parsed;
  if (contentType && contentType.includes('application/json')) {
    parsed = await res.json();
  } else {
    parsed = await res.text();
  }
  return {
    status: res.status,
    headers: res.headers,
    body: parsed,
    durationMs
  };
}

module.exports = { httpRequest };
