async function retryOperation(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === maxRetries - 1) {
        throw e
      }
      // continue retrying
    }
  }
  throw new Error('unreachable')
}

module.exports = { retryOperation }
