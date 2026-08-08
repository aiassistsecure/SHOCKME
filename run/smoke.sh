#!/usr/bin/env bash
#
# SHOCKME · smoke test — plays the game over HTTP, three times.
#
# WHY THIS EXISTS. The unit tests are good at logic and blind to delivery, and
# that blindness has now shipped three bugs in one day:
#
#   - the late chair was in the DOM and could never be seen (tests counted
#     nodes; a node that exists but is invisible counts the same)
#   - the entire second half rendered blank because @keyframes fadeup was
#     never defined (nothing in CSS complains)
#   - the office 500'd because 'office' was missing from the SECOND_HALF set —
#     found because the page came back 84 bytes, not because a test failed
#
# This walks whatever building the server actually serves, follows real
# choices, answers when asked, and asserts it reaches an artifact. It cannot
# be written as a unit test because the floorplan differs per visitor: there
# is no fixed path to hard-code any more.
#
# Usage: ./run/smoke.sh [base-url]
set -u
H="${1:-http://127.0.0.1:3400}"
c=$(mktemp); tmp=$(mktemp); fails=0
J="-b $c -c $c"

curl -s -c "$c" --max-time 10 "$H/" -o /dev/null || { echo "server not answering at $H"; exit 1; }

for game in 1 2 3; do
  msg="smoke message $game"
  reached=0
  for step in $(seq 1 14); do
    curl -s $J --max-time 15 "$H/room" -o "$tmp"

    # 'artifact-mark' appears only on the ending. ('artifact-lines' is also in
    # the stylesheet on every page, which cost me a debugging round.)
    if grep -q 'class="artifact-mark"' "$tmp"; then reached=1; break; fi

    if grep -q 'id="askform"' "$tmp"; then
      curl -s $J -X POST "$H/bff/answer" -H 'content-type: application/json' \
        -d "{\"text\":\"$msg\"}" >/dev/null
    fi
    if grep -q 'id="countform"' "$tmp"; then
      curl -s $J -X POST "$H/bff/count" -H 'content-type: application/json' \
        -d '{"guess":4}' >/dev/null
    fi

    nxt=$(grep -o 'data-choice="[a-z]*"' "$tmp" | head -1 | sed 's/.*="//;s/"//')
    if [ -z "$nxt" ]; then echo "  game $game: STUCK at step $step, no choices"; fails=$((fails+1)); break; fi
    curl -s $J -X POST "$H/bff/choose" -H 'content-type: application/json' \
      -d "{\"choiceId\":\"$nxt\"}" >/dev/null
  done

  if [ "$reached" != 1 ]; then
    echo "  game $game: never reached the artifact"; fails=$((fails+1)); continue
  fi

  # the answer must be THIS game's, not a leftover from the last one
  if grep -q "$msg" "$tmp"; then
    echo "  game $game: ok — artifact quotes \"$msg\""
  else
    echo "  game $game: FAIL — artifact does not carry this game's message"
    fails=$((fails+1))
  fi

  # every page must have rendered something; a blank room is the fadeup bug
  bytes=$(wc -c < "$tmp")
  [ "$bytes" -lt 4000 ] && { echo "  game $game: FAIL — artifact only $bytes bytes"; fails=$((fails+1)); }

  [ $game -lt 3 ] && curl -s $J -L --max-time 12 "$H/again" -o /dev/null
done

rm -f "$c" "$tmp"
[ "$fails" = 0 ] && echo "  smoke — PASS 3 games, distinct messages, no dead ends" \
                 || echo "  smoke — FAIL $fails"
exit $([ "$fails" = 0 ] && echo 0 || echo 1)
