import { resolveCategory, CategoryInput, Branch } from '../src/metersphere/categoryResolver';
import { RulesConfig, emptyRulesConfig } from '../src/metersphere/rulesLoader';
import { JavaParser } from '../src/metersphere/javaParser';

const VOCAB: readonly Branch[] = ['eapi', 'iapi', 'both', 'none'];

function api(overrides: Partial<CategoryInput> = {}): CategoryInput {
  return {
    method: 'GET',
    path: '/users',
    fullPath: '/api/users',
    ...overrides,
  };
}

function rules(partial: Partial<RulesConfig>): RulesConfig {
  return { ...emptyRulesConfig(), ...partial };
}

describe('resolveCategory', () => {
  describe('precedence chain (first match wins)', () => {
    it('manual override beats rules, @category, tags and default', () => {
      const result = resolveCategory(
        api({ category: 'both', tags: ['eapi'] }),
        {
          branchOverride: 'iapi',
          rulesLoaderResult: rules({
            placement: { enabled: true, managedPrefix: '/managed' },
            rules: [{ matchOn: 'catchAll', pattern: '', branch: 'eapi' }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('iapi');
    });

    it('runtime rules beat @category, tags and default', () => {
      const result = resolveCategory(
        api({ category: 'both', tags: ['eapi'] }),
        {
          branchOverride: 'auto',
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'catchAll', pattern: '', branch: 'eapi' }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('eapi');
    });

    it('Javadoc @category beats annotation tags and default', () => {
      const result = resolveCategory(
        api({ category: 'both', tags: ['eapi'] }),
        { branchOverride: 'auto', rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'none' }
      );
      expect(result).toBe('both');
    });

    it('annotation tags beat the default branch', () => {
      const result = resolveCategory(
        api({ tags: ['iapi'] }),
        { branchOverride: 'auto', rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'eapi' }
      );
      expect(result).toBe('iapi');
    });

    it('falls back to metersphere.defaultBranch when nothing else matches', () => {
      const result = resolveCategory(
        api(),
        { branchOverride: 'auto', rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'none' }
      );
      expect(result).toBe('none');
    });
  });

  describe('manual override semantics', () => {
    it('auto defers to the rest of the chain', () => {
      const result = resolveCategory(
        api({ category: 'iapi' }),
        { branchOverride: 'auto', rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'eapi' }
      );
      expect(result).toBe('iapi');
    });

    it('none override yields none (API stays in selected module, no branch shaping)', () => {
      const result = resolveCategory(
        api({ category: 'both' }),
        { branchOverride: 'none', rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'eapi' }
      );
      expect(result).toBe('none');
    });

    it('undefined override defers to the rest of the chain', () => {
      const result = resolveCategory(
        api({ category: 'eapi' }),
        { rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'none' }
      );
      expect(result).toBe('eapi');
    });

    it('out-of-vocabulary override is ignored and falls through', () => {
      const result = resolveCategory(
        api({ category: 'iapi' }),
        { branchOverride: 'bogus' as unknown as Branch, rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'eapi' }
      );
      expect(result).toBe('iapi');
    });
  });

  describe('Javadoc @category vocabulary', () => {
    it.each(['eapi', 'iapi', 'both'] as const)('@category %s resolves to itself', (value) => {
      const result = resolveCategory(
        api({ category: value }),
        { rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'none' }
      );
      expect(result).toBe(value);
    });

    it('FAILURE probe: out-of-vocabulary @category typo is ignored and falls through to tags', () => {
      const result = resolveCategory(
        api({ category: 'typo', tags: ['iapi'] }),
        { rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'eapi' }
      );
      expect(result).toBe('iapi');
    });

    it('FAILURE probe: out-of-vocabulary @category typo with no other signal falls to default', () => {
      const result = resolveCategory(
        api({ category: 'typo' }),
        { rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'none' }
      );
      expect(result).toBe('none');
    });

    it('@category none is not a valid marker and is ignored', () => {
      const result = resolveCategory(
        api({ category: 'none' }),
        { rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'eapi' }
      );
      expect(result).toBe('eapi');
    });
  });

  describe('placement default', () => {
    it("defaults to 'both' when placement is enabled and nothing matched", () => {
      const result = resolveCategory(
        api(),
        {
          rulesLoaderResult: rules({ placement: { enabled: true, managedPrefix: '/managed' } }),
          defaultBranch: 'eapi',
        }
      );
      expect(result).toBe('both');
    });

    it('honors defaultBranch when placement is disabled', () => {
      const result = resolveCategory(
        api(),
        {
          rulesLoaderResult: rules({ placement: { enabled: false, managedPrefix: '/managed' } }),
          defaultBranch: 'iapi',
        }
      );
      expect(result).toBe('iapi');
    });

    it('placement default does not override an explicit @category', () => {
      const result = resolveCategory(
        api({ category: 'eapi' }),
        {
          rulesLoaderResult: rules({ placement: { enabled: true, managedPrefix: '/managed' } }),
          defaultBranch: 'eapi',
        }
      );
      expect(result).toBe('eapi');
    });

    it('invalid defaultBranch falls back to eapi', () => {
      const result = resolveCategory(
        api(),
        { rulesLoaderResult: emptyRulesConfig(), defaultBranch: 'bogus' }
      );
      expect(result).toBe('eapi');
    });

    it('missing defaultBranch falls back to eapi', () => {
      const result = resolveCategory(api(), { rulesLoaderResult: emptyRulesConfig() });
      expect(result).toBe('eapi');
    });
  });

  describe('rule matchOn kinds', () => {
    it('methodAndPathPrefix matches method + fullPath prefix', () => {
      const result = resolveCategory(
        api({ method: 'POST', fullPath: '/api/orders' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'methodAndPathPrefix', pattern: 'POST /api', branch: 'iapi' }],
          }),
          defaultBranch: 'eapi',
        }
      );
      expect(result).toBe('iapi');
    });

    it('methodAndPathPrefix does not match a different method', () => {
      const result = resolveCategory(
        api({ method: 'GET', fullPath: '/api/orders' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'methodAndPathPrefix', pattern: 'POST /api', branch: 'iapi' }],
          }),
          defaultBranch: 'eapi',
        }
      );
      expect(result).toBe('eapi');
    });

    it('pathRegex matches against the full path', () => {
      const result = resolveCategory(
        api({ fullPath: '/api/v1/users' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'pathRegex', pattern: '^/api/v\\d+/', branch: 'both' }],
          }),
          defaultBranch: 'eapi',
        }
      );
      expect(result).toBe('both');
    });

    it('className matches the owning class name', () => {
      const result = resolveCategory(
        api({ className: 'LegacyController' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'className', pattern: 'LegacyController', branch: 'eapi' }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('eapi');
    });

    it('javadocCategory matches the normalized @category', () => {
      const result = resolveCategory(
        api({ category: 'iapi' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'javadocCategory', pattern: 'iapi', branch: 'both' }],
          }),
          defaultBranch: 'eapi',
        }
      );
      expect(result).toBe('both');
    });

    it('annotationTag matches a tag value', () => {
      const result = resolveCategory(
        api({ tags: ['internal', 'iapi'] }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'annotationTag', pattern: 'internal', branch: 'eapi' }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('eapi');
    });

    it('catchAll matches everything and is evaluated last', () => {
      const result = resolveCategory(
        api({ category: 'iapi' }),
        {
          rulesLoaderResult: rules({
            rules: [
              { matchOn: 'catchAll', pattern: '', branch: 'eapi' },
              { matchOn: 'javadocCategory', pattern: 'iapi', branch: 'both' },
            ],
          }),
          defaultBranch: 'none',
        }
      );
      // catchAll is sorted last by the loader; javadocCategory wins here.
      expect(result).toBe('both');
    });

    it('first matching rule wins in file order', () => {
      const result = resolveCategory(
        api({ fullPath: '/api/users' }),
        {
          rulesLoaderResult: rules({
            rules: [
              { matchOn: 'pathRegex', pattern: '^/api/', branch: 'eapi' },
              { matchOn: 'pathRegex', pattern: '^/api/', branch: 'iapi' },
            ],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('eapi');
    });

    it('a rule emits a branch only, never a sub-path', () => {
      const result = resolveCategory(
        api({ fullPath: '/api/users' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'methodAndPathPrefix', pattern: 'GET /api', branch: 'iapi' }],
          }),
          defaultBranch: 'eapi',
        }
      );
      expect(VOCAB).toContain(result);
      expect(result).toBe('iapi');
    });
  });

  describe('malformed input is ignored, never crashes', () => {
    it('invalid regex pattern in a rule is skipped and falls through', () => {
      const result = resolveCategory(
        api({ category: 'both' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'pathRegex', pattern: '(', branch: 'eapi' }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('both');
    });

    it('unknown matchOn in a rule is skipped and falls through', () => {
      const result = resolveCategory(
        api({ category: 'iapi' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'nonsense' as never, pattern: 'x', branch: 'eapi' }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('iapi');
    });

    it('out-of-vocabulary rule branch is skipped and falls through', () => {
      const result = resolveCategory(
        api({ category: 'iapi' }),
        {
          rulesLoaderResult: rules({
            rules: [{ matchOn: 'catchAll', pattern: '', branch: 'bogus' as never }],
          }),
          defaultBranch: 'none',
        }
      );
      expect(result).toBe('iapi');
    });

    it('missing rulesLoaderResult is tolerated', () => {
      const result = resolveCategory(api({ category: 'both' }), { defaultBranch: 'eapi' });
      expect(result).toBe('both');
    });
  });

  describe('vocabulary invariant', () => {
    const fixtures: Array<[string, CategoryInput, Parameters<typeof resolveCategory>[1]]> = [
      ['override', api(), { branchOverride: 'iapi' }],
      ['rule', api(), { rulesLoaderResult: rules({ rules: [{ matchOn: 'catchAll', pattern: '', branch: 'both' }] }) }],
      ['category', api({ category: 'eapi' }), {}],
      ['tags', api({ tags: ['iapi'] }), {}],
      ['placement-default', api(), { rulesLoaderResult: rules({ placement: { enabled: true, managedPrefix: '/managed' } }) }],
      ['setting-default', api(), { defaultBranch: 'none' }],
    ];

    it.each(fixtures)('%s resolves to exactly one vocabulary value', (_name, input, options) => {
      const result = resolveCategory(input, options);
      expect(VOCAB).toContain(result);
    });
  });
});

describe('JavaParser @category extraction', () => {
  it('extracts method-level @category from Javadoc', () => {
    const code = `
@RestController
@RequestMapping("/api")
public class UserController {
  /**
   * @category both
   */
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis).toHaveLength(1);
    expect(result.apis[0].category).toBe('both');
  });

  it.each(['eapi', 'iapi', 'both'])('extracts @category %s', (value) => {
    const code = `
@RestController
public class C {
  /**
   * @category ${value}
   */
  @GetMapping("/x")
  public String x() { return ""; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///C.java');
    expect(result.apis[0].category).toBe(value);
  });

  it('honors class-level Javadoc @category when the method has none', () => {
    const code = `
/**
 * @category eapi
 */
@RestController
@RequestMapping("/api")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis[0].category).toBe('eapi');
  });

  it('method-level @category overrides class-level @category', () => {
    const code = `
/**
 * @category eapi
 */
@RestController
public class UserController {
  /**
   * @category iapi
   */
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis[0].category).toBe('iapi');
  });

  it('leaves category undefined when no @category is present', () => {
    const code = `
@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis[0].category).toBeUndefined();
  });

  it('FAILURE probe: out-of-vocabulary @category typo is preserved raw and ignored by the resolver', () => {
    const code = `
@RestController
public class UserController {
  /**
   * @category typo
   */
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    expect(result.apis[0].category).toBe('typo');
    const branch = resolveCategory(result.apis[0], {
      rulesLoaderResult: emptyRulesConfig(),
      defaultBranch: 'none',
    });
    expect(branch).toBe('none');
  });

  it('does not pick up a Javadoc @category from a previous method', () => {
    const code = `
@RestController
public class UserController {
  /**
   * @category eapi
   */
  @GetMapping("/a")
  public String a() { return ""; }

  @GetMapping("/b")
  public String b() { return ""; }
}
`;
    const result = JavaParser.parseSource(code, 'file:///UserController.java');
    const a = result.apis.find((x) => x.path === '/a');
    const b = result.apis.find((x) => x.path === '/b');
    expect(a?.category).toBe('eapi');
    expect(b?.category).toBeUndefined();
  });
});
