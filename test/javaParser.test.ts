import { JavaParser, ParseResult } from '../src/metersphere/javaParser';

describe('JavaParser', () => {
  describe('parseSource', () => {
    it('should parse @RestController class', () => {
      const code = `
package com.example;

@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('UserController');
      expect(result.classes[0].isRestController).toBe(true);
    });

    it('should parse @Controller class', () => {
      const code = `
@Controller
public class HomeController {
}
`;
      const result = JavaParser.parseSource(code, 'file:///HomeController.java');
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].isController).toBe(true);
      expect(result.classes[0].isRestController).toBe(false);
    });

    it('should extract @GetMapping path', () => {
      const code = `
@RestController
@RequestMapping("/api")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
      expect(result.apis[0].path).toBe('/users');
      expect(result.apis[0].fullPath).toBe('/api/users');
    });

    it('should extract @GetMapping with value = "/path"', () => {
      const code = `
@RestController
@RequestMapping(value = "/api")
public class UserController {
  @GetMapping(value = "/users")
  public List<User> getUsers() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/users');
      expect(result.apis[0].fullPath).toBe('/api/users');
    });

    it('should extract @GetMapping with path = "/path"', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping(path = "/users")
  public List<User> getUsers() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].path).toBe('/users');
    });

    it('should extract @RequestMapping with value = "/path"', () => {
      const code = `
@RestController
@RequestMapping(value = "/api/v1")
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.classes[0].basePath).toBe('/api/v1');
      expect(result.apis[0].fullPath).toBe('/api/v1/users');
    });

    it('should extract @PostMapping', () => {
      const code = `
@RestController
public class UserController {
  @PostMapping("/users")
  public User createUser() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
      expect(result.apis[0].path).toBe('/users');
    });

    it('should extract @PutMapping', () => {
      const code = `
@RestController
public class UserController {
  @PutMapping("/users/{id}")
  public User updateUser() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].method).toBe('PUT');
    });

    it('should extract @DeleteMapping', () => {
      const code = `
@RestController
public class UserController {
  @DeleteMapping("/users/{id}")
  public void deleteUser() { }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].method).toBe('DELETE');
    });

    it('should extract @PatchMapping', () => {
      const code = `
@RestController
public class UserController {
  @PatchMapping("/users/{id}")
  public User patchUser() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].method).toBe('PATCH');
    });

    it('should extract @PathVariable parameter', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/users/{id}")
  public User getUser(@PathVariable("id") Long id) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].name).toBe('id');
      expect(result.apis[0].parameters[0].in).toBe('path');
    });

    it('should extract @PathVariable with value attribute', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/users/{userId}")
  public User getUser(@PathVariable(value = "userId") Long id) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].name).toBe('userId');
    });

    it('should extract @RequestParam parameter', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers(@RequestParam("page") int page) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].name).toBe('page');
      expect(result.apis[0].parameters[0].in).toBe('query');
    });

    it('should extract @RequestBody', () => {
      const code = `
@RestController
public class UserController {
  @PostMapping("/users")
  public User createUser(@RequestBody User user) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].parameters).toHaveLength(1);
      expect(result.apis[0].parameters[0].in).toBe('body');
    });

    it('should extract @Operation(summary = "...")', () => {
      const code = `
@RestController
public class UserController {
  @Operation(summary = "Get all users", description = "Returns a list of all users")
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('Get all users');
    });

    it('should auto-generate summary from method and path when no annotation', () => {
      const code = `
@RestController
public class UserController {
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].summary).toBe('GET /users');
    });

    it('should handle multiple methods in one class', () => {
      const code = `
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
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis).toHaveLength(3);
      const methods = result.apis.map(a => a.method).join(',');
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
    });

    it('should return empty result for non-controller class', () => {
      const code = `
public class UserService {
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserService.java');
      expect(result.classes).toHaveLength(0);
      expect(result.apis).toHaveLength(0);
    });

    it('should handle complex method signatures', () => {
      const code = `
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
`;
      const result = JavaParser.parseSource(code, 'file:///ShoppingCartController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].summary).toBe('Get Configuration');
      expect(result.apis[0].path).toBe('/{shopping_cart_id}');
      expect(result.apis[0].parameters.length).toBeGreaterThanOrEqual(2);
      const paramNames = result.apis[0].parameters.map(p => p.name);
      expect(paramNames).toContain('shopping_cart_id');
      expect(paramNames).toContain('sessionId');
      // Ensure RequestHeader is captured
      expect(paramNames).toContain('Authorization');
    });
  });

  describe('pathless annotations', () => {
    it('should handle @GetMapping without path argument', () => {
      const code = `
@RestController
public class NoPathController {
  @GetMapping
  public List<User> getUsers() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///NoPathController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
      expect(result.apis[0].path).toBe('');
    });

    it('should handle @PutMapping without path argument', () => {
      const code = `
@RestController
public class NoPathController {
  @PutMapping
  public void update() { }
}
`;
      const result = JavaParser.parseSource(code, 'file:///NoPathController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('PUT');
    });

    it('should handle @PostMapping without path argument', () => {
      const code = `
@RestController
public class NoPathController {
  @PostMapping
  public void create() { }
}
`;
      const result = JavaParser.parseSource(code, 'file:///NoPathController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
    });

    it('should handle @DeleteMapping without path argument', () => {
      const code = `
@RestController
public class NoPathController {
  @DeleteMapping
  public void delete() { }
}
`;
      const result = JavaParser.parseSource(code, 'file:///NoPathController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('DELETE');
    });
  });

  describe('method-level @RequestMapping', () => {
    it('should parse method-level @RequestMapping with explicit GET method', () => {
      const code = `
@RestController
public class MappingController {
  @RequestMapping(value = "/items", method = RequestMethod.GET)
  public List<Item> getItems() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///MappingController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
      expect(result.apis[0].path).toBe('/items');
    });

    it('should parse method-level @RequestMapping with POST method', () => {
      const code = `
@RestController
public class MappingController {
  @RequestMapping(value = "/items", method = RequestMethod.POST)
  public Item createItem() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///MappingController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('POST');
      expect(result.apis[0].path).toBe('/items');
    });

    it('should default to GET for @RequestMapping without explicit method', () => {
      const code = `
@RestController
public class MappingController {
  @RequestMapping("/items")
  public List<Item> getItems() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///MappingController.java');
      expect(result.apis).toHaveLength(1);
      expect(result.apis[0].method).toBe('GET');
    });
  });

  describe('@ApiOperation summary extraction', () => {
    it('should extract summary from @ApiOperation(value = "...")', () => {
      const code = `
@RestController
public class TestController {
  @ApiOperation(value = "Get all items", notes = "Returns items list")
  @GetMapping("/items")
  public List<Item> getItems() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      expect(result.apis[0].summary).toBe('Get all items');
    });

    it('should prefer @Operation over @ApiOperation', () => {
      const code = `
@RestController
public class TestController {
  @Operation(summary = "Operation summary")
  @ApiOperation(value = "ApiOperation value")
  @GetMapping("/items")
  public List<Item> getItems() { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      expect(result.apis[0].summary).toBe('Operation summary');
    });
  });

  describe('@ApiParam description extraction', () => {
    it('should extract @ApiParam description for @PathVariable', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items/{id}")
  public Item getItem(
    @ApiParam("The item identifier") @PathVariable("id") Long id
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.description).toBe('The item identifier');
    });

    it('should extract @ApiParam description for @RequestParam', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(
    @ApiParam("Page number") @RequestParam("page") int page
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'page');
      expect(param).toBeDefined();
      expect(param!.description).toBe('Page number');
    });
  });

  describe('@Parameter (OpenAPI 3.0) description extraction', () => {
    it('should extract @Parameter description', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items/{id}")
  public Item getItem(
    @Parameter(description = "The item unique id") @PathVariable("id") Long id
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.description).toBe('The item unique id');
    });
  });

  describe('JSR303 validation extraction', () => {
    it('should extract @Size constraint', () => {
      const code = `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @Size(min = 3, max = 100) @RequestParam("name") String name
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation).toHaveLength(1);
      expect(param!.validation![0].type).toBe('Size');
    });

    it('should extract @NotNull constraint', () => {
      const code = `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @NotNull @RequestParam("name") String name
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation).toHaveLength(1);
      expect(param!.validation![0].type).toBe('NotNull');
    });

    it('should extract @NotBlank constraint', () => {
      const code = `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @NotBlank @RequestParam("name") String name
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation).toHaveLength(1);
      expect(param!.validation![0].type).toBe('NotBlank');
    });

    it('should extract multiple validation constraints', () => {
      const code = `
@RestController
public class TestController {
  @PostMapping("/items")
  public Item createItem(
    @NotNull @Size(min = 1, max = 50) @RequestParam("name") String name
  ) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'name');
      expect(param).toBeDefined();
      expect(param!.validation!.length).toBeGreaterThanOrEqual(2);
      const types = param!.validation!.map(v => v.type);
      expect(types).toContain('NotNull');
      expect(types).toContain('Size');
    });
  });

  describe('parameter name fallback from signature', () => {
    it('should fall back to Java parameter name when @PathVariable has no value', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items/{id}")
  public Item getItem(@PathVariable Long id) { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.in === 'path');
      expect(param).toBeDefined();
      expect(param!.name).toBe('id');
    });

    it('should fall back for @RequestParam without explicit name', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(@RequestParam String name) { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.in === 'query');
      expect(param).toBeDefined();
      expect(param!.name).toBe('name');
    });
  });

  describe('@RequestParam required extraction', () => {
    it('should extract required = true', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(@RequestParam(value = "id", required = true) Long id) { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.required).toBe(true);
    });

    it('should extract required = false', () => {
      const code = `
@RestController
public class TestController {
  @GetMapping("/items")
  public List<Item> getItems(@RequestParam(value = "id", required = false) Long id) { return []; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///TestController.java');
      const param = result.apis[0].parameters.find(p => p.name === 'id');
      expect(param).toBeDefined();
      expect(param!.required).toBe(false);
    });
  });
});
