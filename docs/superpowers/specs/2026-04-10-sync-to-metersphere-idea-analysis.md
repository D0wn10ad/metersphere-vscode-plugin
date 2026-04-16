# Sync to MeterSphere Feature - IDEA Plugin Analysis & VSCode Implementation

## 1. Overview

This document analyzes how the IDEA plugin implements the "Sync to MeterSphere" feature and provides the foundation for VSCode implementation targeting MeterSphere v2 instances.

---

## 2. IDEA Plugin Implementation Analysis

### 2.1 File Selection (Scope)

The IDEA plugin supports **multiple selection modes**:

| Mode | Trigger | Behavior |
|------|---------|----------|
| Single Class | Right-click on a `.java` file | Parses that specific controller class |
| Package | Right-click on a package folder | Scans all `.java` files in package |
| Project | Right-click on project root | Scans entire project for controllers |

**Key code path** (from `UploadAction.java`):
```java
// Entry point - triggered from right-click menu
public void actionPerformed(@NotNull AnActionEvent event) {
    // Uses IntelliJ PSI to get selected elements
    NavigatablePsiElement psiElement = event.getData(LangDataKeys.PSI_ELEMENT);
    // Can also get selected files via:
    // PsiFile[] files = event.getData(LangDataKeys.PSI_FILES);
}
```

The plugin uses **IntelliJ PSI (Program Structure Interface)** - a semantic AST parser that understands Java code structure.

### 2.2 Parsing Approach

The IDEA plugin uses **semantic parsing via PSI**, NOT regex:

**How PSI works:**
```java
// From FieldUtil.java - annotation reading
PsiAnnotation[] annotations = psiParameter.getAnnotations();
if (CollectionUtils.isNotEmpty(PsiAnnotationUtil.findAnnotations(
    psiParameter, 
    Pattern.compile("RequestParam")
))) {
    // Extract annotation attributes semantically
    String paramName = getAnnotationName("RequestParam", "value", psiParameter);
    boolean required = isParamRequired(annotation);
}
```

**PSI provides:**
- True AST parsing (not text search)
- Full annotation attribute access (e.g., `@GetMapping(value="/users", method=HttpMethod.GET)`)
- Type resolution for complex objects
- Javadoc extraction

### 2.3 Supported Annotations

**Spring MVC Annotations:**
| Annotation | Extracted Info |
|------------|----------------|
| `@RestController` | Class is a REST controller |
| `@Controller` | Class is a controller |
| `@RequestMapping` | Base path (class level) |
| `@GetMapping("/path")` | method=GET, path |
| `@PostMapping("/path")` | method=POST, path |
| `@PutMapping("/path")` | method=PUT, path |
| `@DeleteMapping("/path")` | method=DELETE, path |
| `@PatchMapping("/path")` | method=PATCH, path |
| `@PathVariable("id")` | Parameter in=path |
| `@RequestParam("name")` | Parameter in=query |
| `@RequestBody` | Parameter in=body |
| `@RequestHeader("token")` | Parameter in=header |

**Swagger Annotations (if present):**
| Annotation | Extracted Info |
|------------|----------------|
| `@Api` | Tags/description (class) |
| `@ApiOperation` | Summary, notes (method) |
| `@ApiParam` | Parameter description |
| `@ApiModel` | Model description |
| `@ApiModelProperty` | Field description |

**Validation Annotations:**
- `@NotNull`, `@NotEmpty`, `@NotBlank` → required=true
- `@Size`, `@Min`, `@Max` → constraints

### 2.4 Module Selection Flow

The IDEA plugin fetches modules from MeterSphere BEFORE showing upload UI:

**v2 API ( MeterSphere v2):**
```
GET /api/project/list/related
Body: { "workspaceIds": ["ws-id-1"] }

GET /api/api/module/list/{projectId}/HTTP
```

**v3 API ( MeterSphere v3):**
```
GET /project/list/options/{orgId}

POST /api/definition/module/only/tree
Body: { "projectId": "xxx" }
```

### 2.5 Upload to MeterSphere

**Endpoint:**
```
POST /api/definition/import
Content-Type: multipart/form-data
```

**v2 Request Format:**
```java
// From MeterSphereExporter.java (v2)
param.put("platform", "Postman");
param.put("model", "definition");
param.put("modeId", "fullCoverage|merge|cover|add");
param.put("moduleId", moduleId);
param.put("projectId", projectId);
param.put("protocol", "HTTP");
param.put("origin", "idea");
```

**Authentication (v2):**
```
Headers:
  accesskey: <access-key>
  signature: MD5(secret-key + timestamp)
```

---

## 3. Why Regex+LSP Hybrid for VSCode

### 3.1 Pure LSP Approach Limitations

**Option A: VSCode Language Server (vscode.executeCommand)**

```typescript
// Get document symbols
const symbols = await vscode.commands.executeCommand<
  vscode.DocumentSymbol[] | vscode.SymbolInformation[]
>('vscode.executeDocumentSymbolProvider', uri);
```

**What you get:**
- ✅ Class names
- ✅ Method names  
- ✅ File locations (line/column)
- ❌ Annotation values (e.g., `@GetMapping("/users")` path)
- ❌ Parameter annotation details
- ❌ Javadoc content

**Why it fails:**
The `executeDocumentSymbolProvider` command only returns symbol metadata (name, kind, location). It does NOT expose annotation attributes or Javadoc content. You would need to:

1. Parse the file text anyway to get annotation values
2. The LSP doesn't provide annotation-specific queries

### 3.2 Alternative: Full Language Client

To get full PSI-like functionality in VSCode, you'd need to:

```typescript
// Would require embedding a full language client
import { LanguageClient } from 'vscode-languageclient';

// This means:
// 1. Bundling a language server (heavy)
// 2. Or connecting to redhat.java's server (unstable API)
// 3. Complex setup for a VSCode extension
```

**Problems with this approach:**
- No public API to connect to redhat.java's internal LSP server
- Embedding your own Java parser doubles extension size
- redhat.java's LSP doesn't expose annotation attributes via standard LSP methods

### 3.3 Hybrid Approach: Regex + Document Symbols

**Recommended for MVP:**

1. **Use `vscode.executeDocumentSymbolProvider`** to find classes and methods
2. **Use text regex** to extract annotation values from file content

```typescript
// Hybrid approach
async function parseJavaFile(uri: vscode.Uri): Promise<ParsedApi[]> {
  // Step 1: Get class/method structure via LSP
  const symbols = await vscode.commands.executeCommand<
    vscode.DocumentSymbol[]
  >('vscode.executeDocumentSymbolProvider', uri);
  
  // Step 2: Read file content
  const doc = await vscode.workspace.openTextDocument(uri);
  const content = doc.getText();
  
  // Step 3: Extract annotation values via regex
  const getMappings = content.match(/@GetMapping\s*\(\s*"([^"]+)"\s*\)/g);
  // ... similar for other annotations
  
  // Step 4: Combine LSP symbols with regex annotation values
}
```

**Trade-offs:**
| Aspect | Pure Regex | Pure LSP | Hybrid |
|--------|-----------|----------|--------|
| Accuracy | Medium | Low | High |
| Complexity | Low | High | Medium |
| Dependencies | None | VSCode API | VSCode API |
| Annotation values | ✅ | ❌ | ✅ |
| Type info | ❌ | ❌ | ❌ |

**Why this is the right choice:**
1. Works without Java extension installed (fallback to pure regex)
2. Gets accurate method/class structure from LSP
3. Extracts annotation values from text (needed for API paths)
4. Matches what IDEA plugin does semantically

---

## 4. MeterSphere v2 Supported Formats

Based on GitHub issues and documentation:

### 4.1 Supported Import Formats

| Format | Status | Notes |
|--------|--------|-------|
| **Swagger 2.0** | ✅ Supported | Full support |
| **Postman Collection v2.1** | ✅ Supported | With some bug fixes |
| **OpenAPI 3.0** | ❌ Not Supported | Returns "解析数据出错" |
| **Swagger 3.0** | ❌ Not Supported | Use Swagger 2.0 instead |

### 4.2 Platform Parameter

For `/api/definition/import`:

| Platform | MeterSphere v2 | MeterSphere v3 |
|----------|----------------|----------------|
| `Postman` | ✅ | ✅ |
| `Swagger` | ✅ (converts to internal) | ❌ |
| `Swagger3` | ❌ | ✅ |

**For v2 target: Use `platform: "Postman"`**

---

## 5. VSCode Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sync Flow                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Action                                                     │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐                                            │
│  │  File Picker    │  vscode.window.showOpenDialog()             │
│  │  (.java filter) │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ Java Parser     │  Hybrid: LSP symbols + Regex annotations    │
│  │                 │                                            │
│  │ 1. executeCmd   │  → Class/Method structure                   │
│  │    (documentSym)│                                            │
│  │ 2. regex        │  → @GetMapping path, @PathVariable name      │
│  │    (file text) │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ Format to      │  Postman Collection v2.1                     │
│  │ Postman JSON   │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │ Module Select   │    │ SyncEngine     │                      │
│  │ (reuse Nav)    │    │ importToMs()   │                      │
│  └────────┬────────┘    └────────┬────────┘                      │
│           │                       │                               │
│           └───────────┬───────────┘                               │
│                       ▼                                           │
│              ┌─────────────────┐                                  │
│              │  Upload to MS   │                                  │
│              │  /api/definition/import                           │
│              │  multipart/form  │                                  │
│              └─────────────────┘                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Key Differences: IDEA vs VSCode

| Aspect | IDEA Plugin | VSCode Extension |
|--------|-------------|------------------|
| Parser | IntelliJ PSI (full AST) | Hybrid: LSP + regex |
| File selection | Right-click context menu | Open file dialog |
| Module selection | Settings UI dropdown | Navigator + WebView dropdown |
| Output format | Postman (v2) / Swagger3 (v3) | Postman (v2 only) |
| Platform | IntelliJ IDEA | VSCode |

---

## 7. All 7 Features Analysis

| Feature | IDEA (PSI) | VSCode Approach | Regex Needed? |
|---------|------------|------------------|----------------|
| **object-depth** | ✅ Full recursive | Out of scope | N/A |
| **version** | ✅ Upload param | Direct upload param | ❌ No |
| **update-version** | ✅ Upload param | Direct upload param | ❌ No |
| **context-path** | ✅ String prepend | String prepend | ❌ No |
| **export-name** | ✅ Javadoc/class name | Hover provider → fallback to filename | ⚠️ Fallback |
| **javadoc** | ✅ Full Javadoc | Hover provider → fallback to none | ⚠️ Fallback |
| **coverModule** | ✅ Upload param | Direct upload param | ❌ No |

### 7.1 Feature: object-depth (Out of Scope)

**IDEA**: Recursive type resolution to generate nested JSON schema from Java classes.

```java
// IDEA: Uses PSI type resolution to find nested fields
PsiType paramType = psiParameter.getType(); // e.g., "UserDTO"
PsiClass resolvedClass = PsiUtil.resolveClassInType(paramType);
// Recursively finds: UserDTO.address.city.name
```

**VSCode**: No viable approach. Neither redhat.java nor vscode-javac provides:
- Field depth/type resolution of nested objects
- Type hierarchy (redhat.java has, but shows class inheritance only, not field schema)
- API to resolve `UserDTO.address.city` nested path

**Conclusion**: Mark as "Out of scope for MVP"

### 7.2 Features: version, update-version, context-path, coverModule

Simple upload params - no parsing needed:

```typescript
const uploadParams = {
  versionId: settings.versionId || null,           // version
  updateVersionId: settings.updateVersionId || null, // update-version
  contextPath: settings.contextPath || '',         // context-path (prepend to paths)
  coverModule: settings.coverModule || false,      // coverModule
};
```

### 7.3 Features: export-name, javadoc

**Primary**: Use `vscode.executeHoverProvider` to get Javadoc from Java extension.

**Supported Extensions**:
| Extension ID | Name | Hover Support |
|--------------|------|---------------|
| `redhat.java` | Language Support for Java (Red Hat) | ✅ Yes |
| `georgewfraser.vscode-javac` | Java Language Support | ✅ Yes |

**Implementation**:
```typescript
const JAVA_EXTENSIONS = ['redhat.java', 'georgewfraser.vscode-javac'];

function hasJavaExtension(): boolean {
  return JAVA_EXTENSIONS.some(extId => 
    vscode.extensions.all.find(e => e.id === extId)
  );
}

async function getJavadoc(uri: vscode.Uri, position: vscode.Position): Promise<string | null> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    'vscode.executeHoverProvider',
    uri,
    position
  );
  if (hovers && hovers[0]?.contents[0]) {
    const md = hovers[0].contents[0] as vscode.MarkdownString;
    return md.value;
  }
  return null;
}
```

**User Notification**:
```typescript
if (!hasJavaExtension()) {
  vscode.window.showInformationMessage(
    'For full Javadoc support, install "Language Support for Java by Red Hat" or "Java Language Support" extension.'
  );
}
```

**Fallback**: If hover fails or no Java extension:
- export-name: Use filename (class name)
- javadoc: Leave empty

### 7.4 Annotation Path Extraction (Regex Required)

Even with Java extension, annotation attribute extraction still requires regex:

```typescript
const getMappingRegex = /@GetMapping\s*\(\s*"([^"]+)"\s*\)/g;
const pathVarRegex = /@PathVariable\s*\(\s*"([^"]+)"\s*\)/g;
const requestParamRegex = /@RequestParam\s*\(\s*"([^"]+)"\s*\)/g;
const requestBodyRegex = /@RequestBody\s*\(\s*\)/g;
const requestMappingRegex = /@RequestMapping\s*\(\s*"([^"]+)"\s*\)/g;
```

This is unavoidable because `executeDocumentSymbolProvider` doesn't return annotation attributes.

---

## 8. Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sync Flow                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User clicks "Sync" → File Picker (.java)                        │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Java Parser (Hybrid)                        │   │
│  │  1. LSP documentSymbols → Class/method structure         │   │
│  │  2. Regex → Annotation paths (@GetMapping)                │   │
│  │  3. Hover → Javadoc (if Java ext installed)             │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        Format: Postman Collection v2.1                  │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                    │
│         ┌───────────────────┴───────────────────┐               │
│         ▼                                       ▼               │
│  ┌─────────────────┐                  ┌─────────────────┐      │
│  │ Module Select   │                  │ Upload Params   │      │
│  │ (Navigator)    │                  │ version, context │      │
│  └────────┬────────┘                  │ path, coverModule│      │
│           │                          └────────┬────────┘      │
│           └────────────────┬───────────────────┘               │
│                            ▼                                    │
│               ┌─────────────────────────┐                       │
│               │  POST /api/definition/import                   │
│               │  multipart/form-data                            │
│               └─────────────────────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Key Differences: IDEA vs VSCode

| Aspect | IDEA Plugin | VSCode Extension |
|--------|-------------|------------------|
| Parser | IntelliJ PSI (full AST) | Hybrid: LSP + regex + hover |
| File selection | Right-click context menu | Open file dialog |
| Module selection | Settings UI dropdown | Navigator + WebView dropdown |
| Output format | Postman (v2) / Swagger3 (v3) | Postman (v2 only) |
| object-depth | ✅ Full support | ❌ Out of scope |
| javadoc | ✅ Full PSI | ⚠️ Via hover (requires Java ext) |
| Platform | IntelliJ IDEA | VSCode |

---

## 10. References

- IDEA Plugin v2.0: https://github.com/metersphere/metersphere-idea-plugin/tree/v2.0
- IDEA Plugin v3.x: https://github.com/metersphere/metersphere-idea-plugin/tree/v3.x
- MeterSphere v2 docs: https://metersphere.io/docs/v2.x/
- VSCode Programmatic Language Features: https://code.visualstudio.com/api/language-extensions/programmatic-language-features
- redhat.java: https://marketplace.visualstudio.com/items?itemName=redhat.java
- vscode-javac: https://marketplace.visualstudio.com/items?itemName=georgewfraser.vscode-javac