# Import Mode Design Decision

## coverModule and modeId Combination Rules

The MeterSphere import API requires specific combinations of `coverModule` and `modeId` parameters:

### Valid Combinations

| URL param `coverModule` | Body `modeId` | Body `coverModule` | Result |
|------------------------|---------------|-------------------|--------|
| `true` | `incrementalMerge` | `true` | ✅ Works |
| `false` | `fullCoverage` | `false` | ✅ Works |
| `true` | `fullCoverage` | `false` | ❌ "input error" |
| `false` | `incrementalMerge` | `true` | ❌ May fail |

### Implementation Rule

There are **two valid sets**:

**Set 1: Overwrite Mode**
- URL: `coverModule=true`
- Body: `modeId: "fullCoverage"` 
- Body: `coverModule: false`

**Set 2: Add New Mode**
- URL: `coverModule=false`
- Body: `modeId: "incrementalMerge"`
- Body: `coverModule: false`

### UI Mapping

| UI Selection | URL coverModule | Body modeId | Body coverModule |
|-------------|-----------------|-------------|------------------|
| "Overwrite (fullCoverage)" | `true` | `fullCoverage` | `false` |
| "Add New (incrementalMerge)" | `false` | `incrementalMerge` | `false` |

### Important Notes

1. **Body coverModule is always false** - regardless of URL param
2. **Body modeId differs from URL** - when UI selects "Overwrite", body uses "fullCoverage"
3. **The combination matters** - URL and body must be consistent in their intent

### Previous Bug

Previous implementation incorrectly:
- Used `coverModule=true` in URL with `modeId=fullCoverage` in body
- Had inconsistent settings between URL and body

### References

- Working curl examples tested April 2026
- MeterSphere v2 API import endpoint: `/api/api/definition/import`