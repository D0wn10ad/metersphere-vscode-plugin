// Lightweight JS token manager for tests
let _token = undefined

function setToken(token) {
  _token = token
}

function getToken() {
  return _token
}

function applyAuth(headers) {
  if (_token && _token.trim().length > 0) {
    headers['Authorization'] = `Bearer ${_token}`
  }
}

function clearToken() {
  _token = undefined
}

module.exports = { setToken, getToken, applyAuth, clearToken }
