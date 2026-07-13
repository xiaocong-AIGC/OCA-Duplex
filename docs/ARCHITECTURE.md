# OCA-Duplex architecture

```text
Codex app-server
       │ visible user/assistant messages
       ▼
OCA Core sidecar
  ├─ workspace policy and project routing
  ├─ Schema v2 extraction
  ├─ learning-summary upsert
  ├─ knowledge lifecycle
  ├─ transactional writer and audit
  └─ desktop JSON RPC
       │
       ├────────► Obsidian Vault (Markdown)
       │
       ▼
Tauri 2 commands
       │
       ▼
React desktop UI
```

The desktop installer bundles OCA Core as a Node Single Executable sidecar. It does not bundle Node.js as a separately installed runtime and does not bundle Codex credentials.

Stable internal metadata keys remain English so existing notes survive UI or folder-language changes. Visible folder names and templates follow the selected `zh-CN` or `en-US` profile.

Every write plan is snapshotted before execution. A failed operation restores existing files and removes files created by the failed transaction. Audit events contain operation metadata but not conversation bodies.
