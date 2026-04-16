# MeterSphere API Import - Implementation Findings

## 1. Authentication Signature Algorithm (Corrected)

**Important:** The signature is NOT MD5 - it's **AES-128-CBC** encryption!

### Algorithm

```typescript
import * as crypto from 'crypto';

function generateSignature(accessKey: string, secretKey: string): {
  signature: string;
  timestamp: number;
} {
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  const plaintext = `${accessKey}|${uuid}|${timestamp}`;
  
  const key = Buffer.from(secretKey, 'utf8');
  const iv = Buffer.from(accessKey, 'utf8');
  
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let signature = cipher.update(plaintext, 'utf8', 'base64');
  signature += cipher.final('base64');
  
  return { signature, timestamp };
}
```

### Request Headers

| Header | Value |
|--------|-------|
| `accessKey` | `{accessKey}` |
| `signature` | `{signature}` (AES-128-CBC base64) |
| `timestamp` | `{timestamp}` (milliseconds) |
| `accept` | `application/json, text/plain, */*` |

### Previous (Incorrect) Documentation

- ❌ MD5(secret-key + timestamp) - WRONG
- ✅ AES-128-CBC with accessKey as IV - CORRECT

---

## 2. Import Mode and coverModule Rules

### Valid Combinations

| modeId (URL) | coverModule (URL) | coverModule (Body) | Result |
|--------------|-------------------|--------------------|--------|
| `fullCoverage` | `true` | `false` | ✅ Works |
| `fullCoverage` | `false` | `false` | ✅ Works |
| `incrementalMerge` | `false` | `false` | ✅ Works |
| `incrementalMerge` | `true` | `true` | ✅ Works |
| `fullCoverage` | `true` | `true` | ❌ "input error" |

### Implementation Rule

- When `modeId === 'fullCoverage'`: set body `coverModule: false`
- When `modeId === 'incrementalMerge'`: set body `coverModule: false` (or match URL)

### Recommendation

Simplify: Remove UI checkbox for coverModule. Use mode selection:
- **Overwrite (fullCoverage)** → coverModule = true (URL) / false (body)
- **Add New (incrementalMerge)** → coverModule = false

---

## 3. Import Request Body Format

### URL Parameters (not in request body)

```typescript
{
  modeId: "fullCoverage" | "incrementalMerge";
  projectId: string;
  moduleId: string;
  platform: "Postman";       // In URL params, NOT in body
  model: "definition";       // In URL params, NOT in body
  protocol: "HTTP";
  origin: "vscode";
  coverModule: "true" | "false";
}
```

### Request Body Fields

```typescript
{
  // Required fields
  name: string;                    // Collection name
  fileName: string;                // e.g., "ApiController.json"
  moduleId: string;
  projectId: string;
  platform: "Postman";             // NOTE: May not be needed in body if in URL
  modeId: "fullCoverage" | "incrementalMerge";
  type: "definition";              // NOTE: May not be needed in body if in URL
  protocol: "HTTP";
  origin: "vscode";
  
  // Auth settings
  syncCase: boolean;               // Always true for now
  coverModule: boolean;            // false when modeId=fullCoverage
  
  // Auth manager (default auth for all imported APIs)
  authManager: {
    type: "AuthManager";
    clazzName: "io.metersphere.api.dto.definition.request.auth.MsAuthManager";
    id: "";
    resourceId: null;               // null, not empty string
    name: "";
    label: null;                    // null
    referenced: null;
    active: false;
    index: null;                   // null
    enable: true;                  // true, not false
    refType: null;
    hashTree: null;
    projectId: null;
    isMockEnvironment: false;
    environmentId: null;
    pluginId: null;
    stepName: null;
    parent: null;
    username: "";
    password: "";
    url: null;
    realm: null;
    verification: "";
    mechanism: "";
    encrypt: "false";
    domain: null;
    environment: null;
    mockEnvironment: false;
  };
}
```

### Key Fields

| Field | Value | Notes |
|-------|-------|-------|
| `fileName` | `"${collectionName}.json"` | Required |
| `syncCase` | `true` | Always true (UI disabled) |
| `authManager.enable` | `true` | Not `false` |
| `authManager.*` | Use `null` for null fields | Not empty strings |
| `coverModule` (body) | `false` when fullCoverage | Different from URL |

---

## 4. IDEA Plugin Comparison - Auth Extraction

### What IDEA Plugins Extract from Java

| Annotation | Extracted? | Notes |
|------------|------------|-------|
| `@RequestMapping` | ✅ | HTTP method + path |
| `@GetMapping` | ✅ | GET method |
| `@PostMapping` | ✅ | POST method |
| `@PutMapping` | ✅ | PUT method |
| `@DeleteMapping` | ✅ | DELETE method |
| `@PathVariable` | ✅ | Path parameters |
| `@RequestParam` | ✅ | Query parameters |
| `@RequestHeader` | ✅ | Header parameters (generic) |
| `@RequestBody` | ✅ | Request body |

### What's NOT Extracted

| Annotation/Feature | Extracted? | Notes |
|-------------------|------------|-------|
| Authorization headers | ❌ | Treated as generic header |
| Bearer token | ❌ | No special handling |
| Basic Auth credentials | ❌ | No extraction |
| `@Secured` | ❌ | Not parsed |
| `@PreAuthorize` | ❌ | Not parsed |
| Spring Security | ❌ | No integration |

### Conclusion

The IDEA plugin treats `@RequestHeader` as a **generic header parameter**, not as authentication. Auth must be configured manually in MeterSphere after import.

**VSCode plugin approach:** Consistent with IDEA - do not attempt to extract auth from Java source. Set default `authManager` (None) in import, let users configure in MeterSphere.

---

## 5. Postman Import Notes

- **URL format:** Must be object with `raw`, `protocol`, `host`, `path`
  ```json
  "url": {
    "raw": "/api/users",
    "protocol": "http",
    "host": ["{{baseUrl}}"],
    "path": ["api", "users"]
  }
  ```
- **Platform:** Use `Postman` (not `postman`)
- **Model:** `definition`
- **Protocol:** `HTTP`

---

## References

- Signature algorithm: `src/metersphere/settingsManager.ts` (generateSignature)
- Import endpoint: `/api/api/definition/import`
- Working curl test: See user test results (April 2026)