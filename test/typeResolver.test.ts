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
})
