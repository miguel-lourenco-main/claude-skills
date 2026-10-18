# git-history-surgery — rewrite playbook and schema

## Detection tools (analyze)

| Tool | Use | Install |
|---|---|---|
| `gitleaks` | full-history secret scan (preferred) | `brew install gitleaks` / download release (MIT) |
| `trufflehog` | secret scan incl. verification | `brew install trufflehog` (AGPL-3.0) |
| git-native | working-tree pattern scan (fallback, partial) | built in |

The git-native scan matches AWS keys (`AKIA…`), private-key blocks, Slack tokens (`xox*`), Google API
keys (`AIza…`), and generic `key/secret/token/password = "…"` assignments in the working tree only.

## Removal tools (apply — one is REQUIRED)

| Tool | Remove path | Redact text | Install |
|---|---|---|---|
| `git-filter-repo` | `git filter-repo --path <p> --invert-paths --force` | `git filter-repo --replace-text rules.txt` | `pipx install git-filter-repo` |
| BFG | `bfg --delete-files <glob>` | `bfg --replace-text rules.txt` | download `bfg.jar` (GPL-3.0) |

`apply.sh` prefers `git-filter-repo`; if only BFG is present it uses BFG and then runs
`git reflog expire --expire=now --all && git gc --prune=now` to physically drop objects.

### replace-text rules file

One rule per line. Plain string, or `literal==>replacement`, or `regex:PATTERN`:
```
AKIAIOSFODNN7EXAMPLE
hunter2==>***REMOVED***
regex:password\s*=\s*.+==>password=***REMOVED***
```
Unspecified replacements default to `***REMOVED***`.

## Safety protocol (enforced by apply.sh)

1. Tier-2 gate: `--confirm` **and** `--i-understand <repo-name>`.
2. Backup ref `refs/git-steward/backup/<ts>` created at HEAD.
3. Full mirror clone into `.git-steward-backups/<repo>-<ts>.git` (gitignored).
4. Rewrite runs.
5. Force-push is **not** performed — the command is printed for the user to run deliberately:
   `git push --force-with-lease --all && git push --force-with-lease --tags`.

Restore from backup: `git clone .git-steward-backups/<repo>-<ts>.git restored.git`.

**A rewrite does not un-leak a secret** — always rotate/revoke leaked credentials regardless.

## Schema (`history-surgery/v1`)

```json
{
  "schema": "history-surgery/v1",
  "repo": "../foo",
  "secret_scan": { "method": "gitleaks|git-native",
    "findings": [ { "rule": "aws-access-key", "file": "config.txt", "commit": null, "line": 1 } ],
    "sensitive_tracked_files": [".env"], "note": "…" },
  "large_blobs": { "min_mb": 5, "items": [
    { "path": "big.bin", "mb": 5.72, "bytes": 6000000, "oid": "…", "tracked": false, "regenerable": false,
      "versions": 1, "total_bytes": 6000000, "total_mb": 5.72, "first_step": null },
    { "path": "tsconfig.tsbuildinfo", "mb": 9.1, "bytes": 9542000, "oid": "…", "tracked": true, "regenerable": true,
      "versions": 4, "total_bytes": 35000000, "total_mb": 33.38, "first_step": "untrack-and-ignore" } ] },
  "tools": { "gitleaks": false, "trufflehog": false, "git_filter_repo": false, "bfg": false,
             "rewrite_ready": false },
  "summary": { "secret_findings": 2, "sensitive_files": 0, "big_blobs": 1 }
}
```
