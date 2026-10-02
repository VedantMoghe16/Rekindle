#!/usr/bin/env bash
set -Eeuo pipefail

export LANG=C.utf8
export LC_ALL=C.utf8

REPO="${REPO:-$HOME/projects/Rekindle}"
BRANCH="${BRANCH:-agent/server}"

# Wait 15 min before retrying Codex after a failure/limit.
CODEX_RETRY_SECONDS="${CODEX_RETRY_SECONDS:-900}"

# One agent invocation can run up to 90 min.
AGENT_TIMEOUT="${AGENT_TIMEOUT:-5400}"

cd "$REPO"

mkdir -p .ai-state .ai-logs

STATE="$REPO/.ai-state"
LOGS="$REPO/.ai-logs"

LOCK="$STATE/supervisor.lock"
RETRY_FILE="$STATE/codex_retry_after"
ACTIVE_FILE="$STATE/active_agent"

[[ -f "$RETRY_FILE" ]] || echo 0 > "$RETRY_FILE"

log() {
    echo "[$(date -Is)] $*" | tee -a "$LOGS/supervisor.log"
}

cleanup() {
    rm -rf "$LOCK"
}

#
# Only one supervisor may exist.
#
if ! mkdir "$LOCK" 2>/dev/null; then
    oldpid="$(cat "$LOCK/pid" 2>/dev/null || true)"

    if [[ -n "$oldpid" ]] && kill -0 "$oldpid" 2>/dev/null; then
        echo "Supervisor already running as PID $oldpid"
        exit 1
    fi

    rm -rf "$LOCK"
    mkdir "$LOCK"
fi

echo $$ > "$LOCK/pid"
trap cleanup EXIT INT TERM


#
# Required programs.
#
for cmd in git codex claude timeout; do
    command -v "$cmd" >/dev/null || {
        log "Missing command: $cmd"
        exit 1
    }
done


#
# Never run from the wrong branch.
#
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
    log "Must run on $BRANCH"
    exit 1
fi


#
# Files agents are never allowed to alter autonomously.
#
protected_changed() {
    git status --porcelain | awk '{print $2}' |
    grep -Eq \
'^(AI_WORKFLOW\.md|AGENTS\.md|CLAUDE\.md|scripts/agent_prompt\.md|scripts/verify\.sh|scripts/supervisor\.sh)$'
}


#
# Detect suspicious secret files before commits.
#
secret_file_changed() {
    git status --porcelain | awk '{print $2}' |
    grep -Ev '(^|/)\.env\.example$' |
    grep -Eq \
'(^|/)\.env($|\.)|\.(pem|key)$|(^|/)(id_rsa|id_ed25519)$'
}


unfinished_tasks_exist() {
    grep -qE '^[[:space:]]*-[[:space:]]+\[[[:space:]]\]' TASKS.md
}


run_codex() {
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    logfile="$LOGS/codex-$stamp.log"

    echo codex > "$ACTIVE_FILE"

    log "Starting Codex."

    set +e

    timeout --foreground "$AGENT_TIMEOUT" \
        codex \
          --ask-for-approval never \
          --sandbox workspace-write \
          exec \
          "$(cat scripts/agent_prompt.md)" \
        >"$logfile" 2>&1

    rc=$?

    set -e

    log "Codex exit code: $rc"
    return "$rc"
}


run_claude() {
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    logfile="$LOGS/claude-$stamp.log"

    echo claude > "$ACTIVE_FILE"

    log "Starting Claude."

    set +e

    timeout --foreground "$AGENT_TIMEOUT" \
        claude -p \
          --permission-mode auto \
          --permission-prompts none \
          --no-session-persistence \
          --max-turns 80 \
          "$(cat scripts/agent_prompt.md)" \
        >"$logfile" 2>&1

    rc=$?

    set -e

    log "Claude exit code: $rc"
    return "$rc"
}


verify() {
    log "Running verification."

    git diff --check || return 1

    ./scripts/verify.sh || return 1

    log "Verification passed."
}


publish() {
    local agent="$1"

    [[ -n "$(git status --porcelain)" ]] || {
        log "Agent made no changes."
        return 0
    }

    if protected_changed; then
        log "STOP: protected orchestration file was modified."
        exit 10
    fi

    if secret_file_changed; then
        log "STOP: possible credential/secret file detected."
        exit 11
    fi

    verify || return 1

    git add -A

    git commit \
      -m "ai(${agent}): verified work cycle $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    git push origin "$BRANCH"

    log "Published verified ${agent} work."
}


sync_repo() {
    #
    # Never disturb unfinished local work.
    #
    [[ -z "$(git status --porcelain)" ]] || return 0

    git fetch origin

    local local_sha remote_sha base_sha

    local_sha="$(git rev-parse HEAD)"
    remote_sha="$(git rev-parse "origin/$BRANCH")"
    base_sha="$(git merge-base HEAD "origin/$BRANCH")"

    if [[ "$local_sha" == "$remote_sha" ]]; then
        return 0
    fi

    if [[ "$local_sha" == "$base_sha" ]]; then
        git merge --ff-only "origin/$BRANCH"
        return 0
    fi

    if [[ "$remote_sha" == "$base_sha" ]]; then
        return 0
    fi

    log "STOP: branch diverged from origin/$BRANCH."
    exit 12
}


log "========================================"
log "Rekindle AI supervisor started"
log "Branch: $BRANCH"
log "========================================"


while unfinished_tasks_exist; do

    sync_repo

    now="$(date +%s)"
    retry_after="$(cat "$RETRY_FILE")"

    active_agent=""

    #
    # CODEX ALWAYS GETS FIRST CHOICE.
    #
    if (( now >= retry_after )); then

        if run_codex; then
            active_agent="codex"

        else
            #
            # Could be quota exhaustion, transient outage, or another Codex
            # failure. Use Claude rather than repeatedly hammering Codex.
            #
            echo $(( now + CODEX_RETRY_SECONDS )) > "$RETRY_FILE"

            log "Codex unavailable. Falling back to Claude."

            if run_claude; then
                active_agent="claude"
            else
                log "Both agents failed. Waiting before retry."
                sleep 60
                continue
            fi
        fi

    else

        log "Codex cooldown active. Using Claude."

        if run_claude; then
            active_agent="claude"
        else
            log "Claude failed. Waiting."
            sleep 60
            continue
        fi
    fi


    #
    # Protect supervisor/control files.
    #
    if protected_changed; then
        log "STOP: agent changed orchestration files."
        exit 10
    fi

    if secret_file_changed; then
        log "STOP: suspected secret file."
        exit 11
    fi


    #
    # Verify.
    #
    if verify; then

        publish "$active_agent"

    else

        #
        # Codex generated broken work → Claude gets one repair attempt.
        #
        if [[ "$active_agent" == "codex" ]]; then

            log "Codex changes failed verification. Claude will repair."

            if run_claude && verify; then
                publish "claude-repair"
            else
                log "Repair failed. Leaving working tree intact."
                sleep 60
                continue
            fi

        else

            log "Claude changes failed verification."
            log "Leaving working tree for next repair cycle."

            sleep 60
            continue
        fi
    fi


    sleep 5
done


log "No unfinished TASKS.md entries remain."

if verify; then
    log "FINAL VERIFICATION PASSED."
    log "Autonomous task queue complete."
else
    log "FINAL VERIFICATION FAILED."
    exit 20
fi
