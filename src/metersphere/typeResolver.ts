export class TypeResolver {
  // Balanced-bracket scan: a naive comma split tears nested generics apart.
  static parseGeneric(rawType: string): { head: string; args: string[] } | null {
    const trimmed = (rawType ?? '').trim()
    const open = trimmed.indexOf('<')
    if (open < 0 || !trimmed.endsWith('>')) return null
    const head = trimmed.slice(0, open).trim()
    if (!head) return null
    const inner = trimmed.slice(open + 1, -1)
    const args: string[] = []
    let depth = 0
    let current = ''
    for (const ch of inner) {
      if (ch === '<') {
        depth++
        current += ch
      } else if (ch === '>') {
        depth--
        current += ch
      } else if (ch === ',' && depth === 0) {
        args.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    if (depth !== 0) return null
    if (current.trim()) args.push(current.trim())
    return { head, args }
  }

  static extractTypeName(rawType: string): string | null {
    if (!rawType) return 'string'
    const trimmed = rawType.trim()
    const generic = TypeResolver.parseGeneric(trimmed)
    if (generic) {
      // A Map is emitted as an object with additionalProperties, so its own
      // name is the meaningful type; other generics unwrap to their first arg.
      if (generic.head === 'Map') return 'Map'
      return generic.args[0] ?? trimmed
    }
    if (['String', 'string'].includes(trimmed)) return 'string'
    if (['int', 'long', 'short', 'byte', 'Integer', 'Long', 'Short', 'Byte'].includes(trimmed)) return 'integer'
    if (['double', 'float', 'Double', 'Float', 'BigDecimal'].includes(trimmed)) return 'number'
    if (['boolean', 'Boolean'].includes(trimmed)) return 'boolean'
    if (['void', 'Void'].includes(trimmed)) return null
    return trimmed
  }

  static isCollection(rawType: string): boolean {
    const name = rawType.trim().split('<')[0]
    return ['List', 'Set', 'Collection', 'ArrayList', 'HashSet'].includes(name)
  }

  static formatFor(rawType: string): string | undefined {
    const name = (rawType ?? '').trim()
    if (name === 'LocalDateTime' || name === 'Date') return 'date-time'
    if (name === 'UUID') return 'uuid'
    return undefined
  }

  static primitiveSchemaWithFormat(rawType: string): any | undefined {
    const resolved = TypeResolver.extractTypeName(rawType)
    if (resolved === null) return undefined
    const format = TypeResolver.formatFor(resolved)
    if (format) return { type: 'string', format }
    const base = TypeResolver.resolveTypeSchema(resolved)
    if (typeof base === 'string') return undefined
    return base
  }

  static resolveTypeSchema(typeName: string): any {
    const primitives: Record<string, any> = {
      string: { type: 'string' },
      integer: { type: 'integer' },
      number: { type: 'number' },
      boolean: { type: 'boolean' },
    }
    return primitives[typeName] || typeName
  }
}
