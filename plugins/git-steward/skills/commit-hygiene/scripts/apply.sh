#!/usr/bin/env bash
# commit-hygiene apply.sh — reword commit messages. MUTATING (gated).
# Only rewords UN-PUSHED commits (safe: not yet shared). Honors shared/SAFETY.md.
#
# Two modes of operation:
#   --amend-head --message "<msg>" --confirm
#       Reword HEAD's message (only if HEAD is un-pushed).
#   --reword-file <file> --confirm
#       <file> has lines "<short-sha><TAB><new message>" for un-pushed commits;
#       rewords them via a scripted non-interactive rebase.
#
# With no --confirm, prints the plan and exits.
set -u

repo="."; confirm=false; amend_head=false; message=""; reword_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --amend-head) amend_head=true; shift ;;
    --message) message="$2"; shift 2 ;;
    --reword-file) reword_file="$2"; shift 2 ;;
    --confirm) confirm=true; shift ;;
    --mode) shift 2 ;;
    *) shift ;;
  esac
done

cd "$repo" || exit 1
git rev-parse --git-dir >/dev/null 2>&1 || { echo "not a git repository: $repo"; exit 1; }

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
is_unpushed() { # $1 = sha ; true if not contained in upstream
  [ -z "$upstream" ] && return 0   # no upstream → nothing pushed
  ! git merge-base --is-ancestor "$1" "$upstream" 2>/dev/null
}

echo "== commit-hygiene reword plan =="
echo "repo: $repo   upstream: ${upstream:-<none>}"

if $amend_head; then
  head="$(git rev-parse --short HEAD)"
  cur="$(git log -1 --format=%s)"
  if ! is_unpushed "$head"; then echo "REFUSED: HEAD ($head) is already pushed; rewording would rewrite shared history."; exit 1; fi
  [ -z "$message" ] && { echo "no --message provided"; exit 1; }
  echo "  amend HEAD $head"
  echo "    old: $cur"
  echo "    new: $message"
  if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to amend."; exit 0; fi
  git commit --amend -m "$message" >/dev/null && echo "amended HEAD."
  exit 0
fi

if [ -n "$reword_file" ]; then
  [ -f "$reword_file" ] || { echo "reword file not found: $reword_file"; exit 1; }
  # validate all target shas are un-pushed
  while IFS=$'\t' read -r sha msg; do
    [ -n "$sha" ] || continue
    is_unpushed "$sha" || { echo "REFUSED: $sha is already pushed."; exit 1; }
    echo "  reword $sha -> $msg"
  done < "$reword_file"
  if ! $confirm; then echo; echo "DRY RUN — re-run with --confirm to reword via rebase."; exit 0; fi

  # Robust approach: drive an interactive rebase whose editors match commits by
  # their ORIGINAL SUBJECT (what GIT_EDITOR actually receives at reword time),
  # not by sha (which changes during rebase). Build two lookup files:
  #   full_shas    — full sha of each target (for the sequence editor)
  #   subject_map  — "<original-subject><TAB><new-message>" (for the message editor)
  tmp="$(mktemp -d)"
  : > "$tmp/full_shas"; : > "$tmp/subject_map"
  oldest=""
  while IFS=$'\t' read -r sha msg; do
    [ -n "$sha" ] || continue
    full="$(git rev-parse "$sha" 2>/dev/null)" || continue
    echo "$full" >> "$tmp/full_shas"
    subj="$(git log -1 --format=%s "$full")"
    printf '%s\t%s\n' "$subj" "$msg" >> "$tmp/subject_map"
    oldest="$full"
  done < "$reword_file"
  base="$(git rev-parse "${oldest}^" 2>/dev/null)" || base="$(git rev-list --max-parents=0 HEAD | tail -1)"
  export GS_FULL="$tmp/full_shas" GS_SUBJ="$tmp/subject_map"

  seq_editor="$tmp/seq.sh"; cat > "$seq_editor" <<'EOF'
#!/usr/bin/env bash
todo="$1"; out="$(mktemp)"
while IFS= read -r line; do
  if [ "${line:0:5}" = "pick " ]; then
    sha="$(printf '%s' "$line" | awk '{print $2}')"
    full="$(git rev-parse "$sha" 2>/dev/null)"
    if grep -qx "$full" "$GS_FULL" 2>/dev/null; then echo "reword ${line#pick }"; else echo "$line"; fi
  else echo "$line"; fi
done < "$todo" > "$out"; mv "$out" "$todo"
EOF
  msg_editor="$tmp/msg.sh"; cat > "$msg_editor" <<'EOF'
#!/usr/bin/env bash
f="$1"; orig="$(head -n1 "$f")"
new="$(awk -F'\t' -v s="$orig" '$1==s {print $2; exit}' "$GS_SUBJ")"
[ -n "$new" ] && printf '%s\n' "$new" > "$f"
EOF
  chmod +x "$seq_editor" "$msg_editor"
  if GIT_SEQUENCE_EDITOR="$seq_editor" GIT_EDITOR="$msg_editor" git rebase -i "$base" >/dev/null 2>&1; then
    echo "reworded $(wc -l < "$tmp/full_shas") commit(s)."
  else
    echo "rebase failed; aborting (no changes kept)"; git rebase --abort 2>/dev/null; rm -rf "$tmp"; exit 1
  fi
  rm -rf "$tmp"; exit 0
fi

echo "nothing to do: pass --amend-head --message, or --reword-file"
exit 0
