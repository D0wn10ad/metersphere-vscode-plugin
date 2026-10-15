import type { ValidationConstraint } from './javaParser';
import { TypeResolver } from './typeResolver';

/**
 * Minimal JSON-Schema-shaped object. Kept structural (index signature) so the
 * builder can pass richer schemas (items, properties, $ref, ...) through.
 */
export interface SchemaObject {
  type?: string;
  nullable?: boolean;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  [key: string]: unknown;
}

/** Parse a constraint value as a finite number (numbers and numeric strings). */
function toNumber(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (!Number.isNaN(n)) {
      return n;
    }
  }
  return undefined;
}

/**
 * Parse the compact `@Size` value produced by the parser:
 * `"1-10"` (min+max), `"2+"` (min only), `"0-10"` (max only; min 0 is the
 * JSR-303 default and therefore dropped), or a plain number (`@Size(3)` = exactly 3).
 */
function parseSize(value: string | number | undefined): { min?: number; max?: number } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { min: value, max: value };
  }
  if (typeof value !== 'string') {
    return {};
  }
  const range = value.match(/^(\d+)-(\d+)$/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const minOnly = value.match(/^(\d+)\+$/);
  if (minOnly) {
    return { min: Number(minOnly[1]) };
  }
  const maxOnly = value.match(/^0-(\d+)$/);
  if (maxOnly) {
    return { max: Number(maxOnly[1]) };
  }
  return {};
}

/**
 * Map bean-validation constraints onto JSON Schema keywords of `schema`.
 *
 * HARD RULE: never emit a keyword that is invalid for the schema type —
 * notably `Min`/`Max` are SKIPPED entirely for non-numeric schemas (never
 * mapped to `minLength`/`maxLength`; length bounds come from `@Size` only).
 *
 * Mapping:
 * - NotNull/NotBlank/NotEmpty -> `nullable:false` (+ `minLength:1` for strings)
 * - Size -> `minLength`/`maxLength` (string) or `minItems`/`maxItems` (array/collection)
 * - Min/Max -> `minimum`/`maximum` ONLY when the schema type is integer/number
 * - Pattern -> `pattern` (string or untyped schemas)
 * - Email -> `format:'email'` (string or untyped schemas)
 *
 * Pure function: returns a NEW schema object; never mutates the input.
 * Class-level `required` arrays are merged separately by the builder, not here.
 *
 * @param schema    base schema to enrich (e.g. from `TypeResolver.resolveTypeSchema`)
 * @param constraints bean-validation constraints attached to the field/parameter
 * @param javaType  original Java type text; used as a collection fallback
 *                  (e.g. `List<String>`) when the schema has no explicit `type`
 */
export function applyValidation(
  schema: SchemaObject,
  constraints: ValidationConstraint[],
  javaType: string
): SchemaObject {
  const result: SchemaObject = { ...schema };
  if (!Array.isArray(constraints) || constraints.length === 0) {
    return result;
  }

  const type = typeof result.type === 'string' ? result.type : undefined;
  const isString = type === 'string';
  const isNumeric = type === 'integer' || type === 'number';
  // Collection fallback: untyped schema + collection javaType (e.g. param schemas).
  const collectionFallback = type === undefined && Boolean(javaType) && TypeResolver.isCollection(javaType);
  const isArray = type === 'array' || collectionFallback;

  for (const constraint of constraints) {
    if (!constraint || typeof constraint.type !== 'string') {
      continue;
    }
    switch (constraint.type) {
      case 'NotNull':
      case 'NotBlank':
      case 'NotEmpty': {
        result.nullable = false;
        if (isString) {
          result.minLength = Math.max(result.minLength ?? 0, 1);
        }
        break;
      }
      case 'Size': {
        const { min, max } = parseSize(constraint.value);
        if (isString) {
          if (min !== undefined && min > 0) {
            result.minLength = Math.max(result.minLength ?? 0, min);
          }
          if (max !== undefined) {
            result.maxLength = result.maxLength !== undefined ? Math.min(result.maxLength, max) : max;
          }
        } else if (isArray) {
          if (min !== undefined && min > 0) {
            result.minItems = Math.max(result.minItems ?? 0, min);
          }
          if (max !== undefined) {
            result.maxItems = result.maxItems !== undefined ? Math.min(result.maxItems, max) : max;
          }
        }
        break;
      }
      case 'Min': {
        const n = toNumber(constraint.value);
        if (isNumeric && n !== undefined) {
          result.minimum = n;
        }
        break;
      }
      case 'Max': {
        const n = toNumber(constraint.value);
        if (isNumeric && n !== undefined) {
          result.maximum = n;
        }
        break;
      }
      case 'Pattern': {
        if ((isString || type === undefined) && typeof constraint.value === 'string') {
          result.pattern = constraint.value;
        }
        break;
      }
      case 'Email': {
        if ((isString || type === undefined) && result.format === undefined) {
          result.format = 'email';
        }
        break;
      }
      default:
        // Unknown constraint types (e.g. DecimalMin) are ignored.
        break;
    }
  }
  return result;
}
