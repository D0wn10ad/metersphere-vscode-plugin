# MeterSphere v2 API Mapping (VSCode Extension)

- Base URL: MeterSphere v2 endpoint (hosted by MeterSphere deployment)
- Auth: Authorization: Bearer <token>
- Discovery: Endpoints for API discovery
- Pull: Endpoint to pull API definitions
- Push: Endpoint to push local API definitions/edits
- Context: workspaceId and projectId passed per v2 conventions (headers or payload)
- Error handling: Map common codes to user-friendly messages
- WebView data flow: Builder references definitions;Pull updates the navigator; Push updates MeterSphere
- Conflict handling: 409/409-like responses mapped to prompts
