#!/usr/bin/env bash

set -Eeuo pipefail

export LANG=C.utf8
export LC_ALL=C.utf8

# Important: binaries discovered during the earlier agent runs.
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"

REPO="${REPO:-$HOME/projects/Rekindle}"
BRANCH="${BRANCH:-agent/server}"

# Explicit model pins.
CODEX_MODEL="${CODEX_MODEL:-gpt-5.6-sol}"
CLAUDE_MODEL="${CLAUDE_MODEL:-claude-opus-5-5}"

# If Codex actually hits quota, let Claude work for 20 min
# before probing Codex again.
CODEX_QUOTA_RETRY_SECONDS="${CODEX_QUOTA_RETRY_SECONDS:-1200}"

# Ordinary Codex failure gets a much shorter retry.
CODEX_ERROR_RETRY_SECONDS="${CODEX_ERROR_RETRY_SECONDS:-300}"

# Maximum time for one bounded agent cycle.
AGENT_TIMEOUT="${AGENT_TIMEOUT:-5400}"

cd "$REPO"

STATE="$REPO/.ai-state"
LOGS="$REPO/.ai-logs"

mkdir -p "$STATE" "$LOGS"

SUPERVISOR_LOG="$LOGS/supervisor.log"
RETRY_FILE="$STATE/codex_retry_after"
REASON_FILE="$STATE/codex_cooldown_reason"
ACTIVE_FILE="$STATE/active_agent"
LOCK_DIR="$STATE/supervisor.lock"

[[ -f "$RETRY_FILE" ]] || echo 0 > "$RETRY_FILE"
[[ -f "$REASON_FILE" ]] || echo none > "$REASON_FILE"


log() {
    printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$SUPERVISOR_LOG"
}


#
# Single supervisor only.
#
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    oldpid="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"

    if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
        echo "Supervisor already running: PID $oldpid"
        exit 1
    fi

    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
fi

echo $$ > "$LOCK_DIR/pid"

cleanup() {
    rm -rf "$LOCK_DIR"
}

trap cleanup EXIT INT TERM


#
# Prerequisites.
#
for cmd in git codex claude timeout; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log "FATAL: missing command: $cmd"
        exit 1
    fi
done


#
# Correct branch only.
#
CURRENT_BRANCH="$(git branch --show-current)"

if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
    log "FATAL: expected $BRANCH, currently $CURRENT_BRANCH"
    exit 1
fi


#
# Autonomous agents cannot modify their control plane.
#
protected_changed() {
    git status --porcelain | awk '{print $2}' |
        grep -Eq \
'^(AI_WORKFLOW\.md|AGENTS\.md|CLAUDE\.md|scripts/agent_prompt\.md|scripts/verify\.sh|scripts/supervisor\.sh)$'
}


#
# Basic credential-file guard.
#
secret_changed() {
    git status --porcelain | awk '{print $2}' |
        grep -Ev '(^|/)\.env\.example$' |
        grep -Eq \
'(^|/)\.env($|\.)|\.(pem|key)$|(^|/)(id_rsa|id_ed25519)$'
}


unfinished_tasks_exist() {
    grep -qE '^[[:space:]]*-[[:space:]]+\[[[:space:]]\]' TASKS.md
}


#
# Detect ACTUAL Codex quota exhaustion.
# Ordinary errors must not masquerade as quota exhaustion.
#
codex_quota_error() {
    local file="$1"

    grep -Eiq \
'usage[ _-]?limit|usage limit reached|rate[ _-]?limit|quota.*(exhausted|reached|exceeded)|credits?.*(exhausted|depleted|insufficient)|limit.*reset|you.*reached.*limit' \
        "$file"
}


run_codex() {
    local stamp logfile rc

    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    logfile="$LOGS/codex-$stamp.log"

    echo codex > "$ACTIVE_FILE"

    log "Starting Codex: model=$CODEX_MODEL"

    set +e

    timeout --foreground "$AGENT_TIMEOUT" \
        codex \
          --model "$CODEX_MODEL" \
          --ask-for-approval never \
          --sandbox workspace-write \
          -c 'sandbox_workspace_write.network_access=true' \
          exec \
          "$(cat scripts/agent_prompt.md)" \
        >"$logfile" 2>&1

    rc=$?

    set -e

    log "Codex exit code: $rc"
    log "Codex log: $logfile"

    if [[ "$rc" -eq 0 ]]; then
        return 0
    fi

    if codex_quota_error "$logfile"; then
        return 75
    fi

    return "$rc"
}


run_claude() {
    local stamp logfile rc

    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    logfile="$LOGS/claude-$stamp.log"

    echo claude > "$ACTIVE_FILE"

    log "Starting Claude: model=$CLAUDE_MODEL"

    set +e

    timeout --foreground "$AGENT_TIMEOUT" \
        claude \
          --model "$CLAUDE_MODEL" \
          -p \
          --permission-mode auto \
          --permission-prompts none \
          --no-session-persistence \
          --max-turns 80 \
          "$(cat scripts/agent_prompt.md)" \
        >"$logfile" 2>&1

    rc=$?

    set -e

    log "Claude exit code: $rc"
    log "Claude log: $logfile"

    return "$rc"
}


verify_repo() {
    log "Running verification."

    git diff --check || return 1

    ./scripts/verify.sh || return 1

    log "Verification passed."

    return 0
}


publish() {
    local agent="$1"

    if [[ -z "$(git status --porcelain)" ]]; then
        log "$agent made no changes."
        return 2
    fi

    if protected_changed; then
        log "FATAL: $agent modified protected orchestration files."
        exit 10
    fi

    if secret_changed; then
        log "FATAL: possible secret/credential file detected."
        exit 11
    fi

    git add -A

    if git diff --cached --quiet; then
        return 2
    fi

    git commit \
      -m "ai(${agent}): verified work cycle $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    git push origin "$BRANCH"

    log "Published verified $agent work."
}


sync_repo() {
    # Never disturb unfinished work.
    [[ -z "$(git status --porcelain)" ]] || return 0

    git fetch origin || {
        log "WARNING: git fetch failed."
        return 0
    }

    local local_sha remote_sha base_sha

    local_sha="$(git rev-parse HEAD)"
    remote_sha="$(git rev-parse "origin/$BRANCH")"
    base_sha="$(git merge-base HEAD "origin/$BRANCH")"

    [[ "$local_sha" == "$remote_sha" ]] && return 0

    if [[ "$local_sha" == "$base_sha" ]]; then
        git merge --ff-only "origin/$BRANCH"
        return
    fi

    if [[ "$remote_sha" == "$base_sha" ]]; then
        return
    fi

    log "FATAL: local and remote $BRANCH diverged."
    exit 12
}


log "================================================"
log "Rekindle autonomous supervisor"
log "Codex primary: $CODEX_MODEL"
log "Claude fallback: $CLAUDE_MODEL"
log "Branch: $BRANCH"
log "================================================"


while unfinished_tasks_exist; do

    sync_repo

    if protected_changed; then
        log "FATAL: protected file changed."
        exit 10
    fi

    if secret_changed; then
        log "FATAL: suspicious credential file."
        exit 11
    fi


    now="$(date +%s)"
    retry_after="$(cat "$RETRY_FILE" 2>/dev/null || echo 0)"

    active_agent=""


    #
    # CODEX ALWAYS GETS FIRST PRIORITY when its cooldown expires.
    #
    if (( now >= retry_after )); then

        set +e
        run_codex
        codex_rc=$?
        set -e

        if [[ "$codex_rc" -eq 0 ]]; then

            active_agent="codex"

            # Codex is healthy again.
            echo 0 > "$RETRY_FILE"
            echo none > "$REASON_FILE"

        elif [[ "$codex_rc" -eq 75 ]]; then

            log "Codex usage limit detected."

            echo $(( now + CODEX_QUOTA_RETRY_SECONDS )) > "$RETRY_FILE"
            echo quota > "$REASON_FILE"

            log "Switching to Claude Opus 5.5."

            if run_claude; then
                active_agent="claude"
            else
                log "Claude also failed. Retrying later."
                sleep 60
                continue
            fi

        else

            #
            # Technical Codex error, NOT quota.
            # Claude handles this cycle, but Codex gets another probe soon.
            #
            log "Codex technical failure (not quota)."

            echo $(( now + CODEX_ERROR_RETRY_SECONDS )) > "$RETRY_FILE"
            echo technical-error > "$REASON_FILE"

            if run_claude; then
                active_agent="claude"
            else
                log "Both agents failed. Waiting."
                sleep 60
                continue
            fi
        fi

    else

        reason="$(cat "$REASON_FILE" 2>/dev/null || echo unknown)"

        log "Codex cooldown active ($reason). Using Claude Opus 5.5."

        if run_claude; then
            active_agent="claude"
        else
            log "Claude failed. Waiting."
            sleep 60
            continue
        fi
    fi


    if protected_changed; then
        log "FATAL: autonomous agent modified orchestration."
        exit 10
    fi

    if secret_changed; then
        log "FATAL: suspected credential/secret."
        exit 11
    fi


    if [[ -z "$(git status --porcelain)" ]]; then
        log "$active_agent completed with no repository changes."
        sleep 15
        continue
    fi


    #
    # Independent quality gate.
    #
    if verify_repo; then

        publish "$active_agent" || true

    else

        #
        # Codex generated failing work: give Opus one repair attempt.
        #
        if [[ "$active_agent" == "codex" ]]; then

            log "Codex work failed verification. Claude Opus repair attempt."

            if run_claude && verify_repo; then
                publish "claude-repair" || true
            else
                log "Repair failed; preserving working tree."
                sleep 60
                continue
            fi

        else

            log "Claude work failed verification; preserving working tree."
            sleep 60
            continue
        fi
    fi


    sleep 5
done


log "TASKS.md has no unfinished tasks."

if verify_repo; then
    log "FINAL VERIFICATION PASSED."
else
    log "FINAL VERIFICATION FAILED."
    exit 20
fi
