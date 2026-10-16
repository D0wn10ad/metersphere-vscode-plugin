import { applyValidation, SchemaObject } from '../src/metersphere/validationSchema'
import type { ValidationConstraint } from '../src/metersphere/javaParser'

/** Compact builder for a ValidationConstraint (matches cstParamParser value formats). */
function c(type: string, value?: string | number): ValidationConstraint {
  return value === undefined ? { type } : { type, value }
}

describe('applyValidation', () => {
  describe('table-driven: constraint x schema type', () => {
    const cases: Array<{
      name: string
      schema: SchemaObject
      constraints: ValidationConstraint[]
      javaType: string
      expected: SchemaObject
    }> = [
      // Size
      {
        name: '@Size(min=1,max=10) String -> minLength/maxLength',
        schema: { type: 'string' },
        constraints: [c('Size', '1-10')],
        javaType: 'String',
        expected: { type: 'string', minLength: 1, maxLength: 10 },
      },
      {
        name: '@Size(min=2) String -> minLength only',
        schema: { type: 'string' },
        constraints: [c('Size', '2+')],
        javaType: 'String',
        expected: { type: 'string', minLength: 2 },
      },
      {
        name: '@Size(max=10) String -> maxLength only (min 0 = JSR default, skipped)',
        schema: { type: 'string' },
        constraints: [c('Size', '0-10')],
        javaType: 'String',
        expected: { type: 'string', maxLength: 10 },
      },
      {
        name: '@Size(min=1,max=10) List<String> -> minItems/maxItems',
        schema: { type: 'array', items: {} },
        constraints: [c('Size', '1-10')],
        javaType: 'List<String>',
        expected: { type: 'array', items: {}, minItems: 1, maxItems: 10 },
      },
      {
        name: '@Size on boolean -> skipped (no invalid keywords)',
        schema: { type: 'boolean' },
        constraints: [c('Size', '1-10')],
        javaType: 'boolean',
        expected: { type: 'boolean' },
      },
      // Min / Max
      {
        name: '@Min(1) int -> minimum',
        schema: { type: 'integer' },
        constraints: [c('Min', 1)],
        javaType: 'int',
        expected: { type: 'integer', minimum: 1 },
      },
      {
        name: '@Max(99.5) double -> maximum',
        schema: { type: 'number' },
        constraints: [c('Max', 99.5)],
        javaType: 'double',
        expected: { type: 'number', maximum: 99.5 },
      },
      {
        name: '@Min/@Max on integer combined',
        schema: { type: 'integer' },
        constraints: [c('Min', 1), c('Max', 10)],
        javaType: 'Integer',
        expected: { type: 'integer', minimum: 1, maximum: 10 },
      },
      {
        name: '@Min(1) String -> schema UNCHANGED (no minimum, no minLength)',
        schema: { type: 'string' },
        constraints: [c('Min', 1)],
        javaType: 'String',
        expected: { type: 'string' },
      },
      {
        name: '@Max(5) String -> schema UNCHANGED (no maximum, no maxLength)',
        schema: { type: 'string' },
        constraints: [c('Max', 5)],
        javaType: 'String',
        expected: { type: 'string' },
      },
      {
        name: '@Min(1) on array -> skipped',
        schema: { type: 'array', items: {} },
        constraints: [c('Min', 1)],
        javaType: 'List<Integer>',
        expected: { type: 'array', items: {} },
      },
      {
        name: '@Min with non-numeric value (message fallback) -> skipped, no throw',
        schema: { type: 'integer' },
        constraints: [c('Min', 'must be positive')],
        javaType: 'int',
        expected: { type: 'integer' },
      },
      // NotNull / NotBlank / NotEmpty
      {
        name: '@NotNull String -> nullable:false + minLength:1',
        schema: { type: 'string' },
        constraints: [c('NotNull')],
        javaType: 'String',
        expected: { type: 'string', nullable: false, minLength: 1 },
      },
      {
        name: '@NotBlank String -> nullable:false + minLength:1',
        schema: { type: 'string' },
        constraints: [c('NotBlank')],
        javaType: 'String',
        expected: { type: 'string', nullable: false, minLength: 1 },
      },
      {
        name: '@NotEmpty String -> nullable:false + minLength:1',
        schema: { type: 'string' },
        constraints: [c('NotEmpty')],
        javaType: 'String',
        expected: { type: 'string', nullable: false, minLength: 1 },
      },
      {
        name: '@NotNull int -> nullable:false only (no minLength)',
        schema: { type: 'integer' },
        constraints: [c('NotNull')],
        javaType: 'int',
        expected: { type: 'integer', nullable: false },
      },
      {
        name: '@NotNull List<String> -> nullable:false only',
        schema: { type: 'array', items: {} },
        constraints: [c('NotNull')],
        javaType: 'List<String>',
        expected: { type: 'array', items: {}, nullable: false },
      },
      // Pattern
      {
        name: '@Pattern String -> pattern',
        schema: { type: 'string' },
        constraints: [c('Pattern', '^[a-z]+$')],
        javaType: 'String',
        expected: { type: 'string', pattern: '^[a-z]+$' },
      },
      {
        name: '@Pattern on integer -> skipped',
        schema: { type: 'integer' },
        constraints: [c('Pattern', '\\d+')],
        javaType: 'int',
        expected: { type: 'integer' },
      },
      // Email
      {
        name: '@Email String -> format:email',
        schema: { type: 'string' },
        constraints: [c('Email')],
        javaType: 'String',
        expected: { type: 'string', format: 'email' },
      },
      {
        name: '@Email on integer -> skipped',
        schema: { type: 'integer' },
        constraints: [c('Email')],
        javaType: 'int',
        expected: { type: 'integer' },
      },
      // Combination
      {
        name: '@NotNull @Size(min=1,max=10) @Pattern String -> all keywords combined',
        schema: { type: 'string' },
        constraints: [c('NotNull'), c('Size', '1-10'), c('Pattern', '^\\S+$')],
        javaType: 'String',
        expected: { type: 'string', nullable: false, minLength: 1, maxLength: 10, pattern: '^\\S+$' },
      },
      {
        name: 'existing minLength is never lowered (notNull + size min=3)',
        schema: { type: 'string' },
        constraints: [c('NotBlank'), c('Size', '3+')],
        javaType: 'String',
        expected: { type: 'string', nullable: false, minLength: 3 },
      },
    ]

    test.each(cases)('$name', ({ schema, constraints, javaType, expected }) => {
      expect(applyValidation(schema, constraints, javaType)).toEqual(expected)
    })
  })

  describe('robustness / malformed input', () => {
    test('empty constraints array -> schema unchanged', () => {
      expect(applyValidation({ type: 'string' }, [], 'String')).toEqual({ type: 'string' })
    })

    test('null constraints (JS abuse) -> no throw, schema unchanged', () => {
      expect(applyValidation({ type: 'string' }, null as unknown as ValidationConstraint[], 'String')).toEqual({
        type: 'string',
      })
    })

    test('undefined javaType -> no throw', () => {
      expect(applyValidation({ type: 'string' }, [c('NotNull')], undefined as unknown as string)).toEqual({
        type: 'string',
        nullable: false,
        minLength: 1,
      })
    })

    test('object schema + arbitrary constraints -> no throw, no invalid keywords', () => {
      const result = applyValidation(
        { type: 'object', properties: { id: { type: 'integer' } } },
        [c('NotNull'), c('Min', 1), c('Max', 10), c('Size', '1-5'), c('Pattern', '.*'), c('Email')],
        'UserDto'
      )
      expect(result).toEqual({ type: 'object', properties: { id: { type: 'integer' } }, nullable: false })
      expect(result.minimum).toBeUndefined()
      expect(result.maximum).toBeUndefined()
      expect(result.minLength).toBeUndefined()
      expect(result.maxLength).toBeUndefined()
      expect(result.minItems).toBeUndefined()
      expect(result.maxItems).toBeUndefined()
      expect(result.pattern).toBeUndefined()
    })

    test('untyped schema + Size with collection javaType -> minItems/maxItems', () => {
      expect(applyValidation({}, [c('Size', '1-5')], 'Set<String>')).toEqual({ minItems: 1, maxItems: 5 })
    })

    test('unknown constraint type is ignored', () => {
      expect(applyValidation({ type: 'string' }, [c('DecimalMin', '1.0')], 'String')).toEqual({ type: 'string' })
    })

    test('input schema is not mutated', () => {
      const input: SchemaObject = { type: 'string' }
      const out = applyValidation(input, [c('NotNull'), c('Size', '1-3')], 'String')
      expect(input).toEqual({ type: 'string' })
      expect(out).not.toBe(input)
    })
  })

  describe('regressions: Size string form, NotEmpty arrays, Min/Max intersect', () => {
    test('@Size("3") numeric STRING form -> exactly 3 (min+max)', () => {
      expect(applyValidation({ type: 'string' }, [c('Size', '3')], 'String')).toEqual({
        type: 'string',
        minLength: 3,
        maxLength: 3,
      })
    })

    test('@Size(3) numeric form unchanged -> exactly 3', () => {
      expect(applyValidation({ type: 'string' }, [c('Size', 3)], 'String')).toEqual({
        type: 'string',
        minLength: 3,
        maxLength: 3,
      })
    })

    test('@NotEmpty on array schema -> minItems: 1 (not minLength)', () => {
      expect(applyValidation({ type: 'array', items: {} }, [c('NotEmpty')], 'List<String>')).toEqual({
        type: 'array',
        items: {},
        nullable: false,
        minItems: 1,
      })
    })

    test('@NotEmpty on untyped collection javaType -> minItems: 1', () => {
      expect(applyValidation({}, [c('NotEmpty')], 'Set<String>')).toEqual({ nullable: false, minItems: 1 })
    })

    test('@NotEmpty on string -> minLength: 1 (unchanged)', () => {
      expect(applyValidation({ type: 'string' }, [c('NotEmpty')], 'String')).toEqual({
        type: 'string',
        nullable: false,
        minLength: 1,
      })
    })

    test('@Min(1) then @Min(5) -> tighter minimum 5 (intersect, not overwrite)', () => {
      expect(applyValidation({ type: 'integer' }, [c('Min', 1), c('Min', 5)], 'int')).toEqual({
        type: 'integer',
        minimum: 5,
      })
    })

    test('@Max(10) then @Max(3) -> tighter maximum 3 (intersect, not overwrite)', () => {
      expect(applyValidation({ type: 'integer' }, [c('Max', 10), c('Max', 3)], 'int')).toEqual({
        type: 'integer',
        maximum: 3,
      })
    })

    test('base schema minimum intersects with @Min', () => {
      expect(applyValidation({ type: 'integer', minimum: 5 }, [c('Min', 1)], 'int')).toEqual({
        type: 'integer',
        minimum: 5,
      })
    })

    test('@Min(1) @Max(10) together -> both bounds kept', () => {
      expect(applyValidation({ type: 'integer' }, [c('Min', 1), c('Max', 10)], 'int')).toEqual({
        type: 'integer',
        minimum: 1,
        maximum: 10,
      })
    })
  })
})
