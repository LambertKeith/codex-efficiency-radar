# Security notes

The MCP plugin is read-only. It fetches public community benchmark data from
`https://codexradar.com` and keeps the last successful snapshot in memory.

The optional Windows/macOS selector overlay is experimental and is not an official
OpenAI extension point. It launches the signed Microsoft Store Codex executable
or the signed and notarized macOS Codex app with a Chrome DevTools Protocol
endpoint bound to `127.0.0.1`, then injects UI
markup into `app://` pages at runtime. It does not edit the MSIX package,
`app.asar`, application signatures, user conversations, or Codex settings.

The overlay refuses to run unless the platform, architecture, package or bundle
version, app version, executable version, and `app.asar` SHA-256 all match a
reviewed entry in
`windows-overlay/compatibility.json`. After a Codex update, the MCP plugin keeps
working while the selector overlay remains disabled until a new build is
reviewed.

On macOS the check also requires the official `com.openai.codex` bundle identifier
and OpenAI Team ID. Only install the overlay on a trusted local account. Other local
processes running as the same user may be able to access the loopback debugging
endpoint while Codex is open. Use `Uninstall.cmd` on Windows or `./Uninstall.sh`
on macOS to stop the background process and remove the current-user startup entry.
