/**
 * categoryResolver — resolves the sync branch for a parsed API.
 *
 * First match wins:
 *   1. manual override (Branch selector in the sync webview; `auto` defers)
 *   2. runtime rules (rulesLoader; first matching rule, catchAll evaluated last)
 *   3. Javadoc `@category` (PRIMARY marker; raw value validated here)
 *   4. annotation tags (@Operation(tags) etc.; exact `eapi`/`iapi` values)
 *   5. default: `both` when placement is enabled, else `metersphere.defaultBranch`
 *
 * The branch drives URL shape ONLY (iapi → managed-prefixed paths, both → two
 * documents). It never drives module placement and rules never emit sub-paths.
 */
import { RulesConfig, RuleEntry, emptyRulesConfig } from './rulesLoader';

export type Branch = 'eapi' | 'iapi' | 'both' | 'none';

/** Vocabulary of every possible resolver outcome. */
export const BRANCH_VOCAB: readonly Branch[] = ['eapi', 'iapi', 'both', 'none'];

/** Values accepted as an explicit branch marker (@category / tags / rules). */
const MARKERS: readonly string[] = ['eapi', 'iapi', 'both'];

/** Minimal structural view of a parsed API the resolver needs. */
export interface CategoryInput {
  method: string;
  path: string;
  fullPath: string;
  /** Raw Javadoc `@category` value (unvalidated; may be a typo). */
  category?: string;
  /** Annotation tag values (e.g. @Operation(tags = {"iapi"})). */
  tags?: string[];
  /** Owning class simple name. */
  className?: string;
}

export interface ResolveCategoryOptions {
  /** Manual override from the sync panel: auto|eapi|iapi|both|none. */
  branchOverride?: string;
  /** Loaded runtime rules (rulesLoader). Missing → treated as empty. */
  rulesLoaderResult?: RulesConfig;
  /** metersphere.defaultBranch setting value. */
  defaultBranch?: string;
}

function isBranch(value: unknown): value is Branch {
  return typeof value === 'string' && (BRANCH_VOCAB as readonly string[]).includes(value);
}

function isMarker(value: unknown): value is 'eapi' | 'iapi' | 'both' {
  return typeof value === 'string' && MARKERS.includes(value);
}

/** Evaluate one rule against the API input. Unknown/broken rules never match. */
function ruleMatches(rule: RuleEntry, api: CategoryInput): boolean {
  switch (rule.matchOn) {
    case 'methodAndPathPrefix': {
      // Pattern shape: "<METHOD> <path-prefix>", e.g. "POST /api"
      const parts = /^(\S+)\s+(.+)$/.exec(rule.pattern);
      if (!parts) return false;
      return parts[1] === api.method && api.fullPath.startsWith(parts[2]);
    }
    case 'pathRegex':
      try {
        return new RegExp(rule.pattern).test(api.fullPath);
      } catch {
        return false; // invalid regex → skip, never crash
      }
    case 'className':
      return api.className === rule.pattern;
    case 'javadocCategory':
      return api.category === rule.pattern;
    case 'annotationTag':
      return Array.isArray(api.tags) && api.tags.includes(rule.pattern);
    case 'catchAll':
      return true;
    default:
      return false; // unknown matchOn → skip and fall through
  }
}

/**
 * Resolve the effective branch. Always returns exactly one vocabulary value.
 * Out-of-vocabulary signals at any level are ignored and the chain falls through.
 */
export function resolveCategory(api: CategoryInput, options: ResolveCategoryOptions = {}): Branch {
  // 1. Manual override — `auto` and out-of-vocabulary values defer to the chain.
  const override = options.branchOverride;
  if (typeof override === 'string' && override !== 'auto' && isBranch(override)) {
    return override;
  }

  // 2. Runtime rules — first match wins; catchAll is evaluated last.
  const config: RulesConfig = options.rulesLoaderResult ?? emptyRulesConfig();
  const ordered = [...(config.rules ?? [])].sort((a, b) => {
    const aCatch = a.matchOn === 'catchAll' ? 1 : 0;
    const bCatch = b.matchOn === 'catchAll' ? 1 : 0;
    return aCatch - bCatch;
  });
  for (const rule of ordered) {
    if (!isMarker(rule.branch)) continue; // out-of-vocabulary rule branch → skip
    if (ruleMatches(rule, api)) return rule.branch;
  }

  // 3. Javadoc @category — PRIMARY marker; `none`/typos are not valid markers.
  if (isMarker(api.category)) return api.category;

  // 4. Annotation tags fallback — exact eapi/iapi values only.
  const tagHit = (api.tags ?? []).find((t) => t === 'eapi' || t === 'iapi');
  if (tagHit === 'eapi' || tagHit === 'iapi') return tagHit;

  // 5. Default — placement-enabled 'both', else the defaultBranch setting.
  if (config.placement?.enabled) return 'both';
  if (options.defaultBranch === 'eapi' || options.defaultBranch === 'iapi' || options.defaultBranch === 'none') {
    return options.defaultBranch;
  }
  return 'eapi';
}
