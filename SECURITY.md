# Security and privacy

OCA-Duplex reads local Codex task metadata and, when allowed by the selected capture mode, visible conversation contents. Treat the generated Vault as sensitive data.

## Defaults

- Tool results are disabled by default.
- Stable app-server methods are used by default.
- Safe mode requires explicit workspace-to-project mappings.
- Runtime state is ignored by Git by default.
- Writes are dry-run unless the user confirms or passes `--write`.

## Never distribute

- `~/.codex/auth.json` or any Codex credential store.
- A real user's `.oca-duplex/runtime-state.json`.
- Personal Vault notes or generated conversation captures without consent.
- Real API keys, access tokens, cookies, or private connector results.

## Reporting

Please report vulnerabilities privately to the repository owner before opening a public issue containing sensitive reproduction data.

