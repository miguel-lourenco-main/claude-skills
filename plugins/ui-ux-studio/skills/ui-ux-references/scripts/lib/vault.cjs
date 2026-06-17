'use strict';
// Resolve the reference vault location. The vault is DATA, not code: it lives
// outside the plugin so it survives `/plugin update` (which replaces the cache)
// and stays git-committable in the monorepo checkout.
//
// Resolution order:
//   1. $UIUX_VAULT (explicit override; ~ expanded)
//   2. a `vault/` directory beside the code (dev / monorepo checkout)
//   3. the stable default ~/.claude/ui-ux-references-vault
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveVault(root) {
  const env = process.env.UIUX_VAULT;
  if (env) return path.resolve(env.replace(/^~(?=$|\/)/, os.homedir()));
  const local = path.join(root, 'vault');
  if (fs.existsSync(local)) return local;
  return path.join(os.homedir(), '.claude', 'ui-ux-references-vault');
}

module.exports = { resolveVault };
