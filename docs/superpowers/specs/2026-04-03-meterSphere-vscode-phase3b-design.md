# Phase 3B Design — Mocks + Test Data

## Goals
- Provide MockEngine and Test Data templates to simulate API responses and data payloads for testing scenarios.
- Integrate mocks with Navigator and WebView; allow enabling/disabling mocks per request.

## Architecture
- MockEngine: manage mock templates, apply to responses, override real API when enabled
- DataTemplateEngine: generate test payloads, manage validation rules

## Data models
- MockTemplate: id, name, targetEndpoint, responses, rules
- TestDataTemplate: id, name, endpoint, payloadTemplate, validationRules

## Data flows
- When a mock is enabled, return the mock response instead of calling MeterSphere
- Templates available in Navigator and WebView

## Testing plan
- Unit tests for MockEngine, DataTemplateEngine
- Integration tests with mocks
- End-to-end tests for mock-enabled workflows
