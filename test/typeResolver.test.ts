import { TypeResolver } from '../src/metersphere/typeResolver'

describe('TypeResolver', () => {
  test('extracts simple type string', () => {
    expect(TypeResolver.extractTypeName('String')).toBe('string')
  })

  test('strips Response<T> wrapper', () => {
    expect(TypeResolver.extractTypeName('Response<IDDShoppingModel>')).toBe('IDDShoppingModel')
  })

  test('strips List<T> wrapper', () => {
    expect(TypeResolver.extractTypeName('List<CartItem>')).toBe('CartItem')
  })

  test('returns null for void', () => {
    expect(TypeResolver.extractTypeName('void')).toBeNull()
  })

  test('detects collection types', () => {
    expect(TypeResolver.isCollection('List<Foo>')).toBe(true)
    expect(TypeResolver.isCollection('Set<Bar>')).toBe(true)
    expect(TypeResolver.isCollection('IDDShoppingModel')).toBe(false)
  })

  test('resolveTypeSchema returns primitive schema for string', () => {
    expect(TypeResolver.resolveTypeSchema('string')).toEqual({ type: 'string' })
  })

  test('resolveTypeSchema returns primitive schema for number', () => {
    expect(TypeResolver.resolveTypeSchema('number')).toEqual({ type: 'number' })
  })

  test('extractTypeName maps Java integer types to integer', () => {
    expect(TypeResolver.extractTypeName('int')).toBe('integer')
    expect(TypeResolver.extractTypeName('long')).toBe('integer')
    expect(TypeResolver.extractTypeName('short')).toBe('integer')
    expect(TypeResolver.extractTypeName('byte')).toBe('integer')
    expect(TypeResolver.extractTypeName('Integer')).toBe('integer')
    expect(TypeResolver.extractTypeName('Long')).toBe('integer')
  })

  test('extractTypeName maps floating-point types to number', () => {
    expect(TypeResolver.extractTypeName('double')).toBe('number')
    expect(TypeResolver.extractTypeName('float')).toBe('number')
    expect(TypeResolver.extractTypeName('BigDecimal')).toBe('number')
  })

  test('resolveTypeSchema maps integer to {type: integer}', () => {
    expect(TypeResolver.resolveTypeSchema('integer')).toEqual({ type: 'integer' })
  })

  test('resolveTypeSchema returns type name for complex types', () => {
    expect(TypeResolver.resolveTypeSchema('IDDShoppingModel')).toBe('IDDShoppingModel')
  })

  describe('balanced generics + emission formats (T5)', () => {
    test('parseGeneric splits head and balanced args', () => {
      expect(TypeResolver.parseGeneric('Map<String,List<User>>')).toEqual({
        head: 'Map',
        args: ['String', 'List<User>'],
      })
      expect(TypeResolver.parseGeneric('List<Map<String,String>>')).toEqual({
        head: 'List',
        args: ['Map<String,String>'],
      })
    })

    test('parseGeneric returns null for non-generic and unbalanced input', () => {
      expect(TypeResolver.parseGeneric('String')).toBeNull()
      expect(TypeResolver.parseGeneric('Map<String,List<User>')).toBeNull()
    })

    test('extractTypeName handles nested generics without naive comma split', () => {
      expect(TypeResolver.extractTypeName('Map<String,List<User>>')).toBe('Map')
      expect(TypeResolver.extractTypeName('List<Map<String,String>>')).toBe('Map<String,String>')
    })

    test('formatFor maps only date-time and uuid', () => {
      expect(TypeResolver.formatFor('LocalDateTime')).toBe('date-time')
      expect(TypeResolver.formatFor('Date')).toBe('date-time')
      expect(TypeResolver.formatFor('UUID')).toBe('uuid')
      expect(TypeResolver.formatFor('int')).toBeUndefined()
      expect(TypeResolver.formatFor('long')).toBeUndefined()
      expect(TypeResolver.formatFor('double')).toBeUndefined()
      expect(TypeResolver.formatFor('BigDecimal')).toBeUndefined()
      expect(TypeResolver.formatFor('String')).toBeUndefined()
    })

    test('primitiveSchemaWithFormat layers format onto the primitive schema', () => {
      expect(TypeResolver.primitiveSchemaWithFormat('LocalDateTime')).toEqual({ type: 'string', format: 'date-time' })
      expect(TypeResolver.primitiveSchemaWithFormat('Date')).toEqual({ type: 'string', format: 'date-time' })
      expect(TypeResolver.primitiveSchemaWithFormat('UUID')).toEqual({ type: 'string', format: 'uuid' })
      expect(TypeResolver.primitiveSchemaWithFormat('int')).toEqual({ type: 'integer' })
      expect(TypeResolver.primitiveSchemaWithFormat('double')).toEqual({ type: 'number' })
      expect(TypeResolver.primitiveSchemaWithFormat('String')).toEqual({ type: 'string' })
    })
  })
})
