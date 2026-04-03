Phase 3 Plan: Plan-C (3A/3B/3C) — Phase 3 rollout

Phase 3A: Environment + History
- EnvironmentEngine: CRUD, substitutions, per-request env selection
- HistoryEngine: per-request history with replay/search/export
- Integrate environments with the WebView debugger

Phase 3B: Mocks + Test Data
- MockEngine: templates for endpoints; override real API conditionally
- DataTemplateEngine: test data templates and validation rules
- UI: mocks editor integrated with Navigator and WebView

Phase 3C: Telemetry, Security, and Performance
- TelemetryEngine: opt-in metrics collection
- Security: plan for SecretStorage migration; not implemented in Phase 3
- Performance: caching, lazy loading, diff improvements

Scope: Phase 3 uses per-workspace persistence by default; SecretStorage migration deferred to a future phase.

Milestones
- Phase 3A: M1–M5
- Phase 3B: M1–M4
- Phase 3C: M1–M4

Notes
- This plan keeps SecretStorage out of Phases 1–3 per your instruction; a migration path will be tracked separately.
- If you want to adjust the persistence stance, we can adopt a per-workspace toggle as a Phase 3 design decision.
