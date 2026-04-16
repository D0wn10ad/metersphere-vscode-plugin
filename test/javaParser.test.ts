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

    it('should extract @ApiOperation (fallback)', () => {
      const code = `
@RestController
public class UserController {
  @ApiOperation(value = "Get all users", notes = "Returns a list")
  @GetMapping("/users")
  public List<User> getUsers() { return null; }
}
`;
      const result = JavaParser.parseSource(code, 'file:///UserController.java');
      expect(result.apis[0].summary).toBe('Get all users');
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
    });
  });
});