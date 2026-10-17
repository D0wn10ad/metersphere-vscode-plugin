export interface EnvironmentVariables {
  [key: string]: string
}

export function resolveVariables(template: string, vars: EnvironmentVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    // Own-key check only: `name in vars` is true for prototype members like
    // `toString`, which would resolve {{toString}} to a function's string form.
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
  })
}

export function parseEnvVariables(raw: string | null | undefined): EnvironmentVariables {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const result: EnvironmentVariables = {}
      for (const item of parsed) {
        // Shape-check each element: a null/primitive entry must be skipped,
        // not dereferenced.
        if (item && typeof item === 'object' && typeof item.name === 'string' && item.value !== undefined) {
          const value = stringifyEnvValue(item.value);
          if (value !== undefined) {
            result[item.name] = value;
          }
        }
      }
      return result
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const result: EnvironmentVariables = {}
      for (const key of Object.keys(parsed)) {
        const value = stringifyEnvValue(parsed[key])
        if (value !== undefined) {
          result[key] = value
        }
      }
      return result
    }
    return {}
  } catch {
    return {}
  }
}

/** Stringify a variable value; non-primitives are dropped (never "[object Object]"). */
function stringifyEnvValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}
