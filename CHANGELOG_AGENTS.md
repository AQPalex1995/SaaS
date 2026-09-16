# AGENT CHANGELOG

## 2026-09-16 — OpenCode

Completed:
- Phase 2.5
- End-to-end validation

Important finding:
- BullMQ worker must not use commandTimeout because blocking
  commands caused polling issues.

Important rule:
- Do not enqueue geocoding for properties that already have
  valid coordinates.

Next:
- Phase 3 / T3.1

## 2026-09-16 — OpenCode — Governance Baseline

Completed:
- Added CHECKPOINT RULES + governance sections to AGENTS.md
  (milestone tracking, decision gates, autonomous execution
  rules, project state tracking, docs synchronization).
- Created PROJECT_EXECUTION_PLAN.md (16-phase roadmap, VERSION 1.0).
- Created PROJECT_STATUS.md (live project state).
- Created CHANGELOG_AGENTS.md (agent session log).
- Updated docs/CLOUD.md, docs/CI-CD.md, docs/COST_CONTROL.md
  with decision-gate references.

Verified:
- Tests 40/40
- Typecheck server + root
- Server build

Blockers:
- GIT NOT INSTALLED on this machine and no .git repo exists:
  the checkpoint git commit could not be created. Required to
  enable the autonomous workflow's commit step.

Next:
- Phase 3 / T3.1 (ResearchCase lifecycle)

## 2026-09-17

...