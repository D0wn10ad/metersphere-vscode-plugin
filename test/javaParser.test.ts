/**
 * Shared expectation table for the Java parser, run against BOTH engines
 * ([cst] = java-parser CST, [regex] = legacy JavaParser.parseSource).
 *
 * This is the REAL equivalence gate: every row is emitted twice and must pass on
 * both engines. Every assertion from the original per-engine suite is preserved —
 * the only change is `return [];` normalized to `return null;` (the former is
 * invalid Java that the CST parser correctly rejects; the return statement is test
 * data, not an assertion). No row asserts a regex-only implementation detail.
 */

import { JavaParser, ParseResult } from '../src/metersphere/javaParser';
import { parseJavaWithEngine, ParseEngine } from '../src/metersphere/javaParserDispatch';

const cases: Array<{ name: string; source: string; assert: (r: ParseResult) => void }> = [
  {
    name: 'parseSource > should parse @RestController class',
    source: `
package com.example;

@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('UserController');
      expect(result.classes[0].isRestController).toBe(true);
    },
  },
  {
    name: 'parseSource > should parse @Controller class',
    source: `
@Controller
public class HomeController {
}
`,
    assert: (result) => {
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].isController).toBe(true);
      expect(result.classes[0].isRestController).toBe(false);
    },
  },
  {
    name: 'parseSource > should extract @GetMapping path',
    source: `
@RestController
@RequestMapping("/api")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
      expect(result.apis[0].path).toBe('/users');
      expect(result.apis[0].fullPath).toBe('/api/users');
    },
  },
  {
    name: 'parseSource > should extract @GetMapping with value = "/path"',
    source: `
@RestController
@RequestMapping(value = "/api")
public class UserController {
  @GetMapping(value = "/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/users');
      expect(result.apis[0].fullPath).toBe('/api/users');
    },
  },
  {
    name: 'parseSource > should extract @GetMapping with path = "/path"',
    source: `
@RestController
public class UserController {
  @GetMapping(path = "/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/users');
    },
  },
  {
    name: 'parseSource > should extract @RequestMapping with value = "/path"',
    source: `
@RestController
@RequestMapping(value = "/api/v1")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.classes[0].basePath).toBe('/api/v1');
      expect(result.apis[0].fullPath).toBe('/api/v1/users');
    },
  },
  {
    name: 'parseSource > should extract @PostMapping',
    source: `
@RestController
public class UserController {
  @PostMapping("/users")
  public User createUser() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
      expect(result.apis[0].path).toBe('/users');
    },
  },
  {
    name: 'parseSource > should extract @PutMapping',
    source: `
@RestController
public class UserController {
  @PutMapping("/users/{id}")
  public User updateUser() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].method).toBe('PUT');
    },
  },
  {
    name: 'parseSource > should extract @DeleteMapping',
    source: `
@RestController
public class UserController {
  @DeleteMapping("/users/{id}")
  public void deleteUser() { }
}
`,
    assert: (result) => {
      expect(result.apis[0].method).toBe('DELETE');
    },
  },
  {
    name: 'parseSource > should extract @PatchMapping',
    source: `
@RestController
public class UserController {
  @PatchMapping("/users/{id}")
  public User patchUser() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].method).toBe('PATCH');
    },
  },
  {
    name: 'parseSource > should extract @PathVariable parameter',
    source: `
@RestController
public class UserController {
  @GetMapping("/users/{id}")
  public User getUser(@PathVariable("id") Long id) { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].name).toBe('id');
      expect(result.apis[0].parameters[0].in).toBe('path');
    },
  },
  {
    name: 'parseSource > should extract @PathVariable with value attribute',
    source: `
@RestController
public class UserController {
  @GetMapping("/users/{userId}")
  public User getUser(@PathVariable(value = "userId") Long id) { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].name).toBe('userId');
    },
  },
  {
    name: 'parseSource > should extract @RequestParam parameter',
    source: `
@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers(@RequestParam("page") int page) { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].name).toBe('page');
      expect(result.apis[0].parameters[0].in).toBe('query');
    },
  },
  {
    name: 'parseSource > should extract @RequestBody',
    source: `
@RestController
public class UserController {
  @PostMapping("/users")
  public User createUser(@RequestBody User user) { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].in).toBe('body');
    },
  },
  {
    name: 'parseSource > should extract @Operation(summary = "...")',
    source: `
@RestController
public class UserController {
  @Operation(summary = "Get all users", description = "Returns a list of all users")
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('Get all users');
    },
  },
  {
    name: 'parseSource > should auto-generate summary from method and path when no annotation',
    source: `
@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].summary).toBe('GET /users');
    },
  },
  {
    name: 'parseSource > should handle multiple methods in one class',
    source: `
@RestController
@RequestMapping("/api")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }

  @PostMapping("/users")
  public User createUser() { return null; }

  @GetMapping("/users/{id}")
  public User getUser() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(3);
      const methods = result.apis.map(a => a.method).join(',');
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
    },
  },
  {
    name: 'parseSource > should return empty result for non-controller class',
    source: `
public class UserService {
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.classes).toHaveLength(0);
      expect(result.apis).toHaveLength(0);
    },
  },
  {
    name: 'parseSource > should handle complex method signatures',
    source: `
@RestController
public class ShoppingCartController {
  @Operation(summary = "Get Configuration", description = "Get Configuration by sessionId...")
  @ApiOperationSupport(author = "Junhui(jgong@igus.net)")
  @GetMapping(value = "/{shopping_cart_id}")
  public ResponseEntity<ShoppingCart> getShoppingCart(
    @PathVariable("shopping_cart_id") String shoppingCartId,
    @RequestParam(value = "sessionId", required = false) String sessionId,
    @RequestHeader(value = "Authorization", required = false) String auth
  ) {
    return null;
  }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('Get Configuration');
      expect(result.apis[0].path).toBe('/{shopping_cart_id}');
      expect(result.apis[0].parameters.length).toBeGreaterThanOrEqual(2);
      const paramNames = result.apis[0].parameters.map(p => p.name);
      expect(paramNames).toContain('shopping_cart_id');
      expect(paramNames).toContain('sessionId');
      // Ensure RequestHeader is captured
      expect(paramNames).toContain('Authorization');
    },
  },
  {
    name: 'pathless annotations > should handle @GetMapping without path argument',
    source: `
@RestController
public class NoPathController {
  @GetMapping
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
      expect(result.apis[0].path).toBe('');
    },
  },
  {
    name: 'pathless annotations > should handle @PutMapping without path argument',
    source: `
@RestController
public class NoPathController {
  @PutMapping
  public void update() { }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('PUT');
    },
  },
  {
    name: 'pathless annotations > should handle @PostMapping without path argument',
    source: `
@RestController
public class NoPathController {
  @PostMapping
  public void create() { }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
    },
  },
  {
    name: 'pathless annotations > should handle @DeleteMapping without path argument',
    source: `
@RestController
public class NoPathController {
  @DeleteMapping
  public void delete() { }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('DELETE');
    },
  },
  {
    name: 'method-level @RequestMapping > should parse method-level @RequestMapping with explicit GET method',
    source: `
@RestController
public class MappingController {
  @RequestMapping(value = "/items", method = RequestMethod.GET)
  public List<Item> getItems() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
      expect(result.apis[0].path).toBe('/items');
    },
  },
  {
    name: 'method-level @RequestMapping > should parse method-level @RequestMapping with POST method',
    source: `
@RestController
public class MappingController {
  @RequestMapping(value = "/items", method = RequestMethod.POST)
  public Item createItem() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
      expect(result.apis[0].path).toBe('/items');
    },
  },
  {
    name: 'method-level @RequestMapping > should default to GET for @RequestMapping without explicit method',
    source: `
@RestController
public class MappingController {
  @RequestMapping("/items")
  public List<Item> getItems() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
    },
  },
  {
    name: '@ApiOperation summary extraction > should extract summary from @ApiOperation(value = "...")',
    source: `
@RestController
public class TestController {
  @ApiOperation(value = "Get all items", notes = "Returns items list")
  @GetMapping("/items")
  public List<Item> getItems() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].summary).toBe('Get all items');
    },
  },
  {
    name: '@ApiOperation summary extraction > should prefer @Operation over @ApiOperation',
    source: `
@RestController
public class TestController {
  @Operation(summary = "Operation summary")
  @ApiOperation(value = "ApiOperation value")
  @GetMapping("/items")
  public List<Item> getItems() { return null; }
}
`,
    assert: (result) => {
      expect(result.apis[0].summary).toBe('Operation summary');
    },
  },
  {
    name: '@ApiParam description extraction > should extract @ApiParam description for @PathVariable',
    source: `
@RestController
public class TestController {
  @GetMapping("/items/{id}")
  public Item getItem(
    @ApiParam("The item identifier") @PathVariable("id") Long id
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.description).toBe('The item identifier');
    },
  },
  {
    name: '@ApiParam description extraction > should extract @ApiParam description for @RequestParam',
    source: `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(
    @ApiParam("Page number") @RequestParam("page") int page
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'page');
      expect(param).toBeDefined();
      expect(param!.description).toBe('Page number');
    },
  },
  {
    name: '@Parameter (OpenAPI 3.0) description extraction > should extract @Parameter description',
    source: `
@RestController
public class TestController {
  @GetMapping("/items/{id}")
  public Item getItem(
    @Parameter(description = "The item unique id") @PathVariable("id") Long id
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.description).toBe('The item unique id');
    },
  },
  {
    name: 'JSR303 validation extraction > should extract @Size constraint',
    source: `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @Size(min = 3, max = 100) @RequestParam("name") String name
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation).toHaveLength(1);
      expect(param!.validation![0].type).toBe('Size');
    },
  },
  {
    name: 'JSR303 validation extraction > should extract @NotNull constraint',
    source: `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @NotNull @RequestParam("name") String name
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation).toHaveLength(1);
      expect(param!.validation![0].type).toBe('NotNull');
    },
  },
  {
    name: 'JSR303 validation extraction > should extract @NotBlank constraint',
    source: `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @NotBlank @RequestParam("name") String name
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation).toHaveLength(1);
      expect(param!.validation![0].type).toBe('NotBlank');
    },
  },
  {
    name: 'JSR303 validation extraction > should extract multiple validation constraints',
    source: `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @NotNull @Size(min = 1, max = 50) @RequestParam("name") String name
  ) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation!.length).toBeGreaterThanOrEqual(2);
      const types = param!.validation!.map(v => v.type);
      expect(types).toContain('NotNull');
      expect(types).toContain('Size');
    },
  },
  {
    name: 'parameter name fallback from signature > should fall back to Java parameter name when @PathVariable has no value',
    source: `
@RestController
public class TestController {
  @GetMapping("/items/{id}")
  public Item getItem(@PathVariable Long id) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.in === 'path');
      expect(param).toBeDefined();
      expect(param!.name).toBe('id');
    },
  },
  {
    name: 'parameter name fallback from signature > should fall back for @RequestParam without explicit name',
    source: `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(@RequestParam String name) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.in === 'query');
      expect(param).toBeDefined();
      expect(param!.name).toBe('name');
    },
  },
  {
    name: '@RequestParam required extraction > should extract required = true',
    source: `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(@RequestParam(value = "id", required = true) Long id) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.required).toBe(true);
    },
  },
  {
    name: '@RequestParam required extraction > should extract required = false',
    source: `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(@RequestParam(value = "id", required = false) Long id) { return null; }
}
`,
    assert: (result) => {
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.required).toBe(false);
    },
  },
  {
    name: 'basePath > method-level @RequestMapping must not become the basePath (no class-level mapping)',
    source: `
@RestController
public class DetailController {
  @RequestMapping(value = "/detail", method = RequestMethod.GET)
  public String getDetail() { return null; }
}
`,
    assert: (result) => {
      expect(result.classes[0].basePath).toBe('');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].fullPath).toBe('/detail');
      expect(result.apis[0].method).toBe('GET');
    },
  },
  {
    name: 'basePath > class-level @RequestMapping still prefixes method paths',
    source: `
@RestController
@RequestMapping("/api")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`,
    assert: (result) => {
      expect(result.classes[0].basePath).toBe('/api');
      expect(result.apis[0].fullPath).toBe('/api/users');
    },
  },
  {
    name: '@RequestBody binding > a mention inside another method body must not bind a body param',
    source: `
@RestController
public class MixedController {
  @GetMapping("/a")
  public String getA() {
    // see also: @RequestBody handling elsewhere
    return "no body here";
  }

  @PostMapping("/b")
  public String createB(@RequestBody String payload) { return payload; }
}
`,
    assert: (result) => {
      const apiA = result.apis.find(a => a.path === '/a');
      const apiB = result.apis.find(a => a.path === '/b');
      expect(apiA).toBeDefined();
      expect(apiB).toBeDefined();
      expect(apiA!.parameters.find(p => p.in === 'body')).toBeUndefined();
      expect(apiB!.parameters.find(p => p.in === 'body')).toBeDefined();
    },
  },
];

describe.each<[ParseEngine]>([['cst'], ['regex']])('JavaParser [%s]', (engine) => {
  it.each(cases)('$name', (c) => {
    const result = parseJavaWithEngine(c.source, 'file:///test.java', engine);
    c.assert(result);
  });

  describe('C1: order-independent annotation lookup', () => {
    it('should resolve @Operation(summary) placed BELOW @GetMapping (IntelliJ layout)', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/x")
  @Operation(summary = "A op")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('A op');
    });

    it('should resolve @ApiOperation(value) placed BELOW @GetMapping', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/x")
  @ApiOperation(value = "B op")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('B op');
    });

    it('should resolve @Description placed BELOW @GetMapping', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/x")
  @Description("C")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('C');
    });

    it('should still resolve @Operation(summary) placed ABOVE @GetMapping (classic layout)', () => {
      const code = `
@RestController
public class UserController {
  @Operation(summary = "Classic op")
  @GetMapping("/x")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('Classic op');
    });

    it('should pick the nearest @Operation for each method (no cross-contamination)', () => {
      const code = `
@RestController
public class MultiController {
  @GetMapping("/a")
  @Operation(summary = "A summary")
  public String a() { return null; }

  @GetMapping("/b")
  @Operation(summary = "B summary")
  public String b() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///MultiController.java');
      expect(result.apis).toHaveLength(2);
      const byPath: Record<string, string | undefined> = {};
      for (const api of result.apis) byPath[api.path] = api.summary;
      expect(byPath['/a']).toBe('A summary');
      expect(byPath['/b']).toBe('B summary');
    });

    it('should keep inner parens in @Operation(summary) (paren-depth-aware capture)', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/users/{id}")
  @Operation(summary = "get user (by id)")
  public User getUser() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('get user (by id)');
    });

    it('should not emit a phantom API from @GetMapping inside a string literal', () => {
      const code = `
@RestController
public class DocController {
  @GetMapping("/real")
  public String getReal() { return "@GetMapping(/fake)"; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///DocController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/real');
    });

    it('should not emit a phantom API from @GetMapping inside a comment', () => {
      const code = `
@RestController
public class CommentController {
  // @GetMapping("/commented")
  @GetMapping("/real")
  public String getReal() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///CommentController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/real');
    });

    it('should preserve the fallback name when no summary annotation exists', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].summary).toBe('GET /');
    });

    it('should not crash on malformed Java with an unclosed paren', () => {
      const code = `
@RestController
public class BrokenController {
  @GetMapping("/broken"
  public List<User> getUsers() { return null; }
}
`;
      expect(() => JavaParser.parseSource(code, 'file:///BrokenController.java')).not.toThrow();
    });
  });
});

describe('C1 dual-engine gate: order-independent annotation lookup', () => {
  const wrap = (annotations: string) => `
@RestController
public class UserController {
  ${annotations}
  public List<User> getUsers() { return null; }
}
`;
  const cases: Array<[string, string, string]> = [
    ['@Operation below @GetMapping (IntelliJ layout)', '@GetMapping("/x")\n  @Operation(summary = "A op")', 'A op'],
    ['@ApiOperation below @GetMapping', '@GetMapping("/x")\n  @ApiOperation(value = "B op")', 'B op'],
    ['@Description below @GetMapping', '@GetMapping("/x")\n  @Description("C")', 'C'],
    ['@Operation above @GetMapping (classic layout)', '@Operation(summary = "D op")\n  @GetMapping("/x")', 'D op'],
    ['parens inside summary', '@Operation(summary = "get user (by id)")\n  @GetMapping("/x")', 'get user (by id)'],
  ];
  it.each(['cst', 'regex'] as ParseEngine[])('engine=%s resolves every layout', (engine) => {
    for (const [name, annotations, expected] of cases) {
      const result = parseJavaWithEngine(wrap(annotations), 'file:///UserController.java', engine);
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe(expected);
    }
  });
});


describe('regex engine: dedupe of composed + plain mappings', () => {
  const dedupeSrc = [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    '@RequestMapping("/api")',
    'public class DedupeController {',
    '  @PostMapping("/x")',
    '  @RequestMapping(value = "/x", method = RequestMethod.POST)',
    '  public void x() { }',
    '}',
  ].join('\n');

  it('emits ONE api when shorthand and method-level @RequestMapping produce the same (method, fullPath)', () => {
    const result = JavaParser.parseSource(dedupeSrc, 'file:///Dedupe.java');
    expect(result.apis).toHaveLength(1);
    expect(result.apis[0].method).toBe('POST');
    expect(result.apis[0].fullPath).toBe('/api/x');
  });

  it('keeps distinct (method, fullPath) pairs - dedupe never over-collapses', () => {
    const src = [
      'package com.example.demo;',
      'import org.springframework.web.bind.annotation.*;',
      '@RestController',
      '@RequestMapping("/api")',
      'public class TwoController {',
      '  @GetMapping("/a")',
      '  public void a() { }',
      '  @PostMapping("/a")',
      '  public void b() { }',
      '}',
    ].join('\n');
    const result = JavaParser.parseSource(src, 'file:///Two.java');
    expect(result.apis).toHaveLength(2);
    expect(result.apis.map((a) => a.method).sort()).toEqual(['GET', 'POST']);
  });
});

describe('regex engine: base/path slash normalization (CST joinPath parity)', () => {
  const trailingSlashSrc = [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    '@RequestMapping("/api/")',
    'public class C {',
    '  @GetMapping("/x")',
    '  public void x() { }',
    '}',
  ].join('\n');
  const noLeadingSlashSrc = [
    'package com.example.demo;',
    'import org.springframework.web.bind.annotation.*;',
    '@RestController',
    '@RequestMapping("api")',
    'public class D {',
    '  @GetMapping("/x")',
    '  public void d() { }',
    '}',
  ].join('\n');

  it('collapses a trailing-slash base with a leading-slash method path (no double slash)', () => {
    const result = JavaParser.parseSource(trailingSlashSrc, 'file:///C.java');
    expect(result.apis[0].fullPath).toBe('/api/x');
  });

  it('normalizes a base that lacks a leading slash', () => {
    const result = JavaParser.parseSource(noLeadingSlashSrc, 'file:///D.java');
    expect(result.apis[0].fullPath).toBe('/api/x');
  });

  it.each(['cst', 'regex'] as ParseEngine[])('fullPath is identical on the %s engine for both sources', (engine) => {
    expect(parseJavaWithEngine(trailingSlashSrc, 'file:///C.java', engine).apis[0].fullPath).toBe('/api/x');
    expect(parseJavaWithEngine(noLeadingSlashSrc, 'file:///D.java', engine).apis[0].fullPath).toBe('/api/x');
  });
});
