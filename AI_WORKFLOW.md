# Rekindle AI Engineering Protocol

## Product authority

PRODUCT_SPEC.md is the authoritative product specification.

Do not silently change product requirements.
If something is ambiguous, document the interpretation in the handoff.

## Beginning of every work cycle

Read:

1. PRODUCT_SPEC.md
2. TASKS.md
3. AI_WORKFLOW.md
4. handoffs/server.md

Inspect:

git status
git diff
git log --oneline -10

If another agent left unfinished changes, understand and repair or
continue those changes before starting unrelated work.

## Work scope

Perform exactly ONE coherent bounded task per work cycle.

Choose the highest-priority unfinished task in TASKS.md whose
dependencies are satisfied.

Do not attempt several unrelated product features in one cycle.

## Implementation

For the selected task:

- understand the corresponding PRODUCT_SPEC.md requirements;
- inspect existing code before changing it;
- implement a complete solution;
- run relevant tests;
- run lint/type checking/formatting where applicable;
- update TASKS.md;
- update handoffs/server.md.

## Git ownership

Agents must NOT mutate Git history or branches.

Do NOT run:

git add
git commit
git push
git pull
git merge
git rebase
git reset
git checkout
git switch
git stash
git clean

Read-only Git commands such as status, diff, log, show and branch
inspection are allowed.

The external supervisor owns commits, synchronization and GitHub pushes.

## Protected orchestration files

During autonomous product work do NOT modify:

AI_WORKFLOW.md
AGENTS.md
CLAUDE.md
scripts/agent_prompt.md
scripts/supervisor.sh
scripts/verify.sh

Changes to these files require human review.

## Safety

Never commit or expose:

- passwords;
- API keys;
- private SSH keys;
- authentication tokens;
- cookies;
- .env secrets;
- department credentials;
- personal credentials.

Do not weaken tests merely to make verification pass.

Do not use destructive commands to discard another agent's work.

## Handoff

Every completed work cycle must update handoffs/server.md with:

### Current task
### Work completed
### Files changed
### Tests executed
### Test results
### Important decisions
### Remaining work
### Blockers
### Instructions for next agent

## Completion

A task is complete only after implementation and applicable verification.

The product is complete only when all PRODUCT_SPEC.md requirements
and acceptance criteria have been verified and TASKS.md contains
no unfinished tasks.
