export interface EnvironmentVariables {
  [key: string]: string
}

export function resolveVariables(template: string, vars: EnvironmentVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    return name in vars ? vars[name] : match
  })
}

export function parseEnvVariables(raw: string | null | undefined): EnvironmentVariables {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const result: EnvironmentVariables = {}
      for (const item of parsed) {
        if (item.name && item.value !== undefined) {
          result[item.name] = String(item.value)
        }
      }
      return result
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const result: EnvironmentVariables = {}
      for (const key of Object.keys(parsed)) {
        result[key] = String(parsed[key])
      }
      return result
    }
    return {}
  } catch {
    return {}
  }
}
