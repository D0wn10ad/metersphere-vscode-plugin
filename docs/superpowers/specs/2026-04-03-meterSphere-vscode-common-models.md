# Common Data Models (Phase 1–Phase 2)

## MeterSphereToken
- token: string
- issuedAt?: string
- expiresAt?: string

## WorkspaceContext
- workspaceId: string
- perWorkspace?: boolean

## ProjectContext
- projectId: string

## ApiRequest
- method: string
- path: string
- headers: Record<string, string>
- body?: any

## ApiResponse
- statusCode: number
- headers: Record<string, string>
- body?: any
- durationMs?: number

## ApiDefinition
- id: string
- name: string
- version?: string
- endpoints: ApiEndpoint[]

## ApiEndpoint
- id: string
- path: string
- method: string
- description?: string
- parameters?: any
- responses?: any

## SyncMetadata
- lastPulledAt?: string
- lastSyncedAt?: string
- lastSyncedVersion?: string
