/**
 * CST-based parameter extractor over the java-parser (Chevrotain) concrete syntax tree.
 *
 * Walks real `formalParameter` nodes — the name comes from the DECLARATOR (never the
 * last-identifier-wins trick), the type from `text()` of the type node (nested
 * generics like `List<EdgeDTO>` preserved by source slicing), and only REAL
 * annotation nodes count (a `@RequestBody` inside a comment is not a parameter;
 * `@Valid` is a constraint modifier, not a parameter kind).
 *
 * CST shapes relied on (verified against java-parser 3.0.1):
 * - `methodHeader.children.methodDeclarator[0].children.formalParameterList[0]`
 * - `formalParameterList.children.formalParameter[]` — each wraps either
 *   `variableParaRegularParameter` (regular) or `variableArityParameter` (varargs)
 * - `variableParaRegularParameter.children` = `['variableModifier','unannType','variableDeclaratorId']`
 * - `variableArityParameter.children` = `['unannType','DotDotDot','Identifier']` (direct Identifier)
 * - `variableModifier[]` entries are `{annotation: [...]}` or keyword wrappers like `{Final: [...]}`
 */

import { ParsedParameter, ValidationConstraint } from '../javaParser';
import { CstNode, CstToken, findFirst, text } from './cstWalk';
import { AnnotationResult, AnnotationValue, booleanValue, firstString, readAnnotation } from './annotationReader';
import { JavadocIndex } from './javadocIndex';

/** Spring parameter annotations and the `in` kind each implies. */
const KIND_BY_ANNOTATION: Record<string, 'path' | 'query' | 'body' | 'header' | 'cookie'> = {
  PathVariable: 'path',
  RequestParam: 'query',
  RequestHeader: 'header',
  RequestBody: 'body',
  RequestPart: 'body',
  CookieValue: 'cookie',
};

/** Required defaults per kind (plan spec: path=true, body=true, query/header/cookie=false). */
const REQUIRED_DEFAULT: Record<'path' | 'query' | 'body' | 'header' | 'cookie', boolean> = {
  path: true,
  body: true,
  query: false,
  header: false,
  cookie: false,
};

/** Name fallbacks per kind (regex parity: javaParser.ts:430/451/477/417). */
const KIND_FALLBACK: Record<'path' | 'query' | 'body' | 'header' | 'cookie', string> = {
  path: 'path',
  query: 'param',
  header: 'header',
  body: 'body',
  cookie: 'cookie',
};

/** JSR-303 constraint annotations recognized on parameters. */
const CONSTRAINT_TYPES = ['NotNull', 'NotEmpty', 'NotBlank', 'Size', 'Min', 'Max', 'Email', 'Pattern'];

/** Interpret a value as a number (handles both `min = 1` and `min = "1"`). */
function numericValue(v: AnnotationValue | undefined): number | null {
  if (!v) {
    return null;
  }
  if (v.kind === 'number') {
    return v.value;
  }
  if (v.kind === 'string') {
    const n = Number(v.value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Build a ValidationConstraint from a constraint annotation (regex-parity value formats). */
function buildConstraint(ann: AnnotationResult): ValidationConstraint {
  const type = ann.name;
  let value: string | number | undefined;

  if (type === 'Size') {
    // Positional form is the single-element array `@Size({1, 10})` (Java's
    // single-element annotation cannot carry a bare comma list).
    const pos = ann.positional[0];
    const posMin = pos && pos.kind === 'array' ? numericValue(pos.value[0]) : numericValue(pos);
    const posMax = pos && pos.kind === 'array' ? numericValue(pos.value[1]) : numericValue(ann.positional[1]);
    const minVal = numericValue(ann.values['min']) ?? posMin;
    const maxVal = numericValue(ann.values['max']) ?? posMax;
    if (minVal !== null || maxVal !== null) {
      value =
        minVal !== null && maxVal !== null
          ? `${minVal}-${maxVal}`
          : minVal !== null
            ? `${minVal}+`
            : `0-${maxVal}`;
    } else {
      value = firstString(ann.values['message']);
    }
  } else if (type === 'Min' || type === 'Max') {
    value =
      numericValue(ann.values['value']) ??
      numericValue(ann.positional[0]) ??
      firstString(ann.values['message']);
  } else if (type === 'Pattern') {
    value = firstString(ann.values['regexp']) ?? firstString(ann.positional[0]);
  }

  const constraint: ValidationConstraint = { type };
  if (value !== undefined) {
    constraint.value = value;
  }
  const message = firstString(ann.values['message']);
  if (message !== undefined) {
    constraint.message = message;
  }
  return constraint;
}

/** Name override from a kind annotation: `value=` > `name=` > positional (regex parity). */
function nameOverride(ann: AnnotationResult): string | undefined {
  return firstString(ann.values['value']) ?? firstString(ann.values['name']) ?? firstString(ann.positional[0]);
}

/** Description from @ApiParam (swagger-annotations) or @Parameter (swagger v3). */
function paramDescription(anns: AnnotationResult[]): string | undefined {
  const apiParam = anns.find((a) => a.name === 'ApiParam');
  if (apiParam) {
    return (
      firstString(apiParam.values['value'] ?? apiParam.values['description']) ??
      firstString(apiParam.positional[0])
    );
  }
  const parameter = anns.find((a) => a.name === 'Parameter');
  if (parameter) {
    return firstString(parameter.values['description'] ?? parameter.values['value']);
  }
  return undefined;
}

/**
 * Parse every annotated parameter of a `methodDeclaration` into `ParsedParameter[]`.
 * Unannotated parameters are skipped (regex parity); a param carrying only `@Valid`
 * is skipped too (constraint modifier, not a kind).
 */
export function parseParameters(
  methodNode: CstNode,
  source: string,
  javadoc?: JavadocIndex,
  methodLine?: number,
): ParsedParameter[] {
  const mh = findFirst(methodNode, 'methodHeader');
  const mdec = mh ? findFirst(mh, 'methodDeclarator') : undefined;
  const fpl = mdec ? findFirst(mdec, 'formalParameterList') : undefined;
  if (!fpl) {
    return [];
  }

  const out: ParsedParameter[] = [];
  const fps = (fpl.children['formalParameter'] || []) as CstNode[];
  for (const fp of fps) {
    const regular = findFirst(fp, 'variableParaRegularParameter');
    const param = regular ?? findFirst(fp, 'variableArityParameter');
    if (!param) {
      continue;
    }

    const anns: AnnotationResult[] = [];
    const mods = (param.children['variableModifier'] || []) as CstNode[];
    for (const mod of mods) {
      const annNodes = (mod.children['annotation'] || []) as CstNode[];
      for (const a of annNodes) {
        anns.push(readAnnotation(a, source));
      }
    }

    const kindAnn = anns.find((a) => KIND_BY_ANNOTATION[a.name] !== undefined);
    if (!kindAnn) {
      continue;
    }
    const kind = KIND_BY_ANNOTATION[kindAnn.name];

    const nameTok = regular
      ? (findFirst(param, 'variableDeclaratorId')?.children['Identifier']?.[0] as CstToken | undefined)
      : (param.children['Identifier']?.[0] as CstToken | undefined);
    const declaratorName = nameTok?.image ?? '';

    const explicitRequired = booleanValue(kindAnn.values['required']);
    const defaultValue = firstString(kindAnn.values['defaultValue']);
    // A parameter with a defaultValue is never required in Spring unless `required`
    // is set explicitly; otherwise fall back to the per-kind default.
    let required = REQUIRED_DEFAULT[kind];
    if (defaultValue !== undefined) {
      required = false;
    }
    if (explicitRequired !== undefined) {
      required = explicitRequired;
    }
    const parsed: ParsedParameter = {
      name: nameOverride(kindAnn) || declaratorName || KIND_FALLBACK[kind],
      in: kind,
      required,
    };
    if (kindAnn.name === 'RequestPart') {
      parsed.part = true;
    }

    const ut = findFirst(param, 'unannType');
    const typeText = ut ? text(ut, source).trim() : '';
    if (typeText) {
      parsed.type = typeText;
    }
    if (defaultValue !== undefined) {
      parsed.defaultValue = defaultValue;
    }
    const desc =
      paramDescription(anns) ??
      (javadoc && methodLine !== undefined && declaratorName
        ? javadoc.paramForAdjacent(methodLine, declaratorName)
        : undefined);
    if (desc !== undefined) {
      parsed.description = desc;
    }
    const constraints = anns.filter((a) => CONSTRAINT_TYPES.includes(a.name)).map(buildConstraint);
    if (constraints.length > 0) {
      parsed.validation = constraints;
    }
    out.push(parsed);
  }
  return out;
}
