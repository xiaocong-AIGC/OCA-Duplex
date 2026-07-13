# Releasing

1. Run `npm ci` and `npm test`.
2. Run `npm --prefix desktop ci` and `npm --prefix desktop run build`.
3. Run `npm run build:sidecar`.
4. Build locally with `npm --prefix desktop run tauri build`, or push a `v*` tag.
5. Verify the Setup EXE on a clean Windows user account.
6. Publish the draft GitHub Release after reviewing its SHA-256 and release notes.

The repository does not commit generated sidecar or installer binaries. GitHub Actions reconstructs them from source.
