import { TypeResolver } from './typeResolver'

export class SchemaGenerator {
  static generateSchema(typeName: string): any {
    const resolved = TypeResolver.resolveTypeSchema(typeName)
    if (typeof resolved === 'string') {
      return { $ref: `#/components/schemas/${resolved}` }
    }
    return resolved
  }

  static generateArraySchema(itemType: string): any {
    return {
      type: 'array',
      items: SchemaGenerator.generateSchema(itemType),
    }
  }

  static stubObjectSchema(className: string): any {
    void className
    return {
      type: 'object',
      properties: {},
    }
  }

  static registerType(registry: Record<string, any>, className: string): void {
    if (!registry[className]) {
      registry[className] = SchemaGenerator.stubObjectSchema(className)
    }
  }
}
