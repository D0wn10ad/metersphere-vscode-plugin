export class TypeResolver {
  static extractTypeName(rawType: string): string | null {
    if (!rawType) return 'string'
    const trimmed = rawType.trim()
    const genericsMatch = trimmed.match(/<([^>]+)>/)
    if (genericsMatch) {
      return genericsMatch[1].split(',')[0].trim()
    }
    if (['String', 'string'].includes(trimmed)) return 'string'
    if (['int', 'long', 'double', 'float', 'Integer', 'Long', 'Double', 'Float', 'BigDecimal'].includes(trimmed)) return 'number'
    if (['boolean', 'Boolean'].includes(trimmed)) return 'boolean'
    if (['void', 'Void'].includes(trimmed)) return null
    return trimmed
  }

  static isCollection(rawType: string): boolean {
    const name = rawType.trim().split('<')[0]
    return ['List', 'Set', 'Collection', 'ArrayList', 'HashSet'].includes(name)
  }

  static resolveTypeSchema(typeName: string): any {
    const primitives: Record<string, any> = {
      string: { type: 'string' },
      number: { type: 'number' },
      boolean: { type: 'boolean' },
    }
    return primitives[typeName] || typeName
  }
}
