# Server Agent Handoff

## Current task

Completed the explicitly requested planning-only revision of TASKS.md against .ai-logs/task-plan-review.txt. No product implementation task was completed.

## Work completed

Read AI_WORKFLOW.md, PRODUCT_SPEC.md, TASKS.md, the audit and previous handoff; inspected Git status/diff/log and preserved existing untracked work. Revised the task plan to address audit sections A–G with an explicit disposition index.

Preserved T001–T087 and added T088–T111 for bounded subtasks. Split reset entrypoints, Brain columns, Capture API/review/fallbacks, account creation/modal, signal progress, draft composer, Demo Controls, warm-up planning, audio acquisition, tone controls, e2e harness and hardening checks. Replaced serial P1/P2 chains with technical prerequisites while retaining milestone/feature priority. Higher IDs can be prerequisites within earlier milestones; selection must include these appended cycles.

Corrected Finvara's midpoint-percentile score (96), MediQuick/Bharat Freight's reliable Warm scores and Farmlink/Revive verdict fragility. Assigned onboarding-key exclusion, single-clock writes, computed-signal reconciliation, duplicate capture/import/launch/account protection, recommendation status carry-over, silent reset baseline, provenance/historical isolation and roadmap-key demo fixtures. Added offline substituted-template fallback, cache validation/manifests/variants, category campaign fallbacks and P1 warm-up ownership. Assigned local network/request guards, upload/source limits, HTTPS links, traversal/injection defenses, short version-checked transactions and server operation serialization to owning tasks.

Separated optional P2 selection and supervisor-owned physical presentation/audio evidence from ordinary agent dependencies; final audit must accurately report unmet required evidence, deferred stretch scope and external prerequisites.

## Files changed

- TASKS.md — revised task scope, dependencies, acceptance criteria, added IDs and audit disposition index.
- handoffs/server.md — this handoff.

PRODUCT_SPEC.md, audit input, product code and orchestration files were not modified. No Git mutations.

## Tests executed

- Python task-plan integrity checks: unique IDs, preserved original IDs, acceptance/dependency fields, resolvable explicit dependencies and cycle detection.
- Existing `bash scripts/verify.sh` (without editing it).
- Read-only Git status/diff/log and PRODUCT_SPEC.md diff inspection.

## Test results

111 unique unchecked tasks; original T001–T087 preserved, new T088–T111 contiguous. All explicit dependency references resolve and the graph is acyclic. Planning/shell gate PASS; no product manifest exists, so this does not certify product functionality. Conditional stretch dependencies and supervisor evidence remain visibly described rather than represented as mandatory agent edges.

## Important decisions

The product specification remains authoritative. Its “lanes invariant under varying LLM verdicts” claim conflicts with the formula; pin validated warmed demo verdicts and test arbitrary verdicts separately, without altering matching rules. Midpoint percentile reproduces Finvara=96 without adjusting its value. The 12-versus-14 Watch and 30-versus-31 CSV narrative conflicts remain documented; UI metrics are computed.

T095 solely owns account/deal creation and the POST endpoint, shared by Capture and full Add Account. Mini-form missing value defaults to zero with an honest unknown-value display. T092 owns additive extraction-preview API, T042 draft-edit API, T048 campaign list and T101 redacted cache-status API. Minimal additive schema decisions cover interaction provenance, historical isolation, roadmap keys and optional persisted clock offset; do not edit PRODUCT_SPEC.md to conceal these interpretations.

T110 supplies a validated implementation campaign bootstrap before T047; T054 refreshes it during full P0 warm-up. T104 installs the P0 e2e harness before T074 extends it for P1. Browser prerequisites must be provisioned outside the protected verification gate. Domain dates use the shared clock; external future dates remain unchanged but are excluded from live eligibility/counts. Network/provider calls stay outside SQLite transactions.

T086 is supervisor-owned presentation evidence and T099 is team audio acquisition. Missing real audio/projector/video evidence is never fabricated. P2 is optional under §0.7; supervisor records selection/deferment. T087 can perform its audit without waiting for presentation day, but cannot claim full readiness with unmet required evidence.

## Remaining work

All T001–T111 remain unchecked. Begin product implementation with T001 only when authorized. Use earliest milestone plus technical readiness, including appended higher-ID subtasks, rather than requiring backward ID edges. Preserve §15 P1 priority without blocking unrelated ready features on external audio.

## Blockers

No blocker to this planning request. Product toolchain/dependencies, supplied logo/design assets and team recording are not yet present. Live-board eligibility requires real network evidence; physical projector/backup recording and any optional image provider choice belong to the supervisor. Spec formula/narrative conflicts require honest acceptance evidence and supervisor review if unresolved.

## Instructions for next agent

Read PRODUCT_SPEC.md, TASKS.md, AI_WORKFLOW.md and this handoff; inspect status/diff/log and preserve existing unfinished work. Implement one bounded ready task per cycle, starting at T001. Follow the revised dependency graph and owning-task regression checks, run applicable verification and update plan/handoff. Do not modify PRODUCT_SPEC.md or protected orchestration files, commit, push or mutate Git branches/history. Planning PASS is not product acceptance.
