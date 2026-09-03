# Security notes

The MCP plugin is read-only. It fetches public community benchmark data from
`https://codexradar.com` and keeps the last successful snapshot in memory.

The optional Windows/macOS selector overlay is experimental and is not an official
OpenAI extension point. It launches the signed Microsoft Store Codex executable
or the signed and notarized macOS Codex app with a Chrome DevTools Protocol
endpoint bound to `127.0.0.1`, then injects UI
markup into `app://` pages at runtime. Clickable efficiency cells reuse the
reviewed selector's native model rows and reasoning controls to change the active
composer selection. The overlay does not edit the MSIX package, `app.asar`,
application signatures, user conversations, settings files, or private config APIs.

On Windows, the overlay activates the packaged app by AppUserModelID through
`IApplicationActivationManager::ActivateApplication`; it does not directly spawn
the executable inside `WindowsApps`. The installer performs a non-launching COM
activation preflight. Before ending a normal Codex process, the resident verifies
that the loopback debugging port is available and performs an actual packaged-app
activation while the normal process is still alive. It only performs the controlled
restart after those checks succeed. If activation, launch, or injection later fails,
the resident writes an `overlay-disabled.json` circuit-breaker state, stops
intercepting normal Codex launches, requests a standard launch without debugging
arguments when no Codex process is alive, and exits. Re-running the installer is
required to clear the breaker after the failure has been investigated.

The Windows runtime is stored below the current user's `.codex` directory rather
than `%LOCALAPPDATA%`, whose contents may be virtualized for packaged Codex
processes. A current-user, limited-run-level scheduled task starts the resident at
sign-in so the process and runtime remain visible outside the Codex process tree.

The overlay refuses to run unless the platform, architecture, package or bundle
version, app version, executable version, and `app.asar` SHA-256 all match a
reviewed entry. Built-in entries live in `windows-overlay/compatibility.json`.
After a Codex update, the resident stays alive but leaves the running standard
Codex process untouched while it periodically checks the repository's fixed
`raw.githubusercontent.com` HTTPS manifest URL. The downloaded manifest is data
only: it may add exact reviewed identities and select one of the selector
contracts already implemented by the installed runtime. It cannot download or
replace executable JavaScript, use an unknown selector contract, change the
official Windows AppUserModelID, or change the official macOS bundle and Team ID.
Invalid manifests, redirects to another URL, oversized responses, network errors,
and non-matching hashes are ignored. The last valid manifest is cached locally so
offline starts keep the same reviewed boundary.

When a matching reviewed entry appears, the resident waits for the currently
running unenhanced Codex process to exit before restoring enhanced launch. If a
client update changes the selector beyond the installed contracts, a new plugin
release is still required; the runtime does not infer or auto-approve unknown DOM.

On macOS the check also requires the official `com.openai.codex` bundle identifier
and OpenAI Team ID. Only install the overlay on a trusted local account. Other local
processes running as the same user may be able to access the loopback debugging
endpoint while Codex is open. Use `Uninstall.cmd` on Windows or `./Uninstall.sh`
on macOS to stop the background process and remove the current-user scheduled task
or startup entry.
