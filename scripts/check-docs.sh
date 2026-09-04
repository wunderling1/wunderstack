#!/usr/bin/env bash
#
# Fail when markdown links in docs/** and **/AGENTS.md point at missing paths.
# Relative links only (http(s), mailto, anchors, and bare #fragments are skipped).
# CI runs this next to check-root (F0 hygiene).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

files=()
while IFS= read -r -d '' f; do
  files+=("$f")
done < <(find docs -type f -name '*.md' -print0 2>/dev/null; find . -type f -name 'AGENTS.md' -print0)

# Exclude node_modules / .git if find walked them (AGENTS under apps/packages only).
filtered=()
for f in "${files[@]}"; do
  case "$f" in
    ./node_modules/*|./.git/*) continue ;;
  esac
  filtered+=("$f")
done

violations=""
for file in "${filtered[@]}"; do
  dir=$(dirname "$file")
  # [text](target) — skip images that use the same form when target is URL
  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;
    esac
    # Strip optional title: path "title"
    target=${target%% *}
    # Fragment after path
    path_part=${target%%\#*}
    [ -z "$path_part" ] && continue
    # Absolute from repo root
    if [[ "$path_part" == /* ]]; then
      candidate=".${path_part}"
    else
      candidate="$dir/$path_part"
    fi
    # Normalize ..
    if ! resolved=$(python3 -c "import os,sys; print(os.path.normpath(sys.argv[1]))" "$candidate" 2>/dev/null); then
      resolved=$candidate
    fi
    if [ ! -e "$resolved" ]; then
      violations="${violations}  ${file} → ${target} (missing: ${resolved})"$'\n'
    fi
  done < <(grep -oE '\[[^]]*\]\([^)]+\)' "$file" 2>/dev/null | sed -E 's/^\[[^]]*\]\((.*)\)$/\1/' || true)
done

if [ -n "$violations" ]; then
  echo "check-docs: broken markdown links:" >&2
  printf '%s' "$violations" >&2
  exit 1
fi

echo "check-docs: ok (${#filtered[@]} files)"
