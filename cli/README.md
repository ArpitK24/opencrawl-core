# OpenCrawl CLI

Capture coding-agent sessions and search workspace knowledge.

See [optional prompt context](https://github.com/getopencrawl/opencrawl-core/blob/main/cli/docs/context-checks.md).

## Install

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/getopencrawl/opencrawl-core/main/cli/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/getopencrawl/opencrawl-core/main/cli/install.ps1 | iex
```

Or with npm (Node.js 22.15+; allow install scripts and optional dependencies):

```sh
npm install -g @getopencrawl/cli
```

## Set up on macOS

Set up Claude Code, Codex, Antigravity (agy), and Cursor through the CLI:

```sh
opencrawl setup
```

The CLI detects installed agents. Use arrow keys to move, Space to toggle
checkboxes, and Enter on a bottom button. Choose which agents to install and record,
or choose **Do not record any sessions on this machine**. Selecting an integration consents to new-session capture; setup verifies it
before reporting readiness. A separate screen asks which past sessions to import;
history starts off and an empty history screen needs no answer. Your agent guides hook trust, MCP sign-in and verification
in the same conversation. History imports run in the background.
Past-session history is not offered for Cursor.

When Claude Code or Codex is the only selected agent, interactive setup starts
its native MCP sign-in and opens it with the saved setup task. If Codex hooks
need review, setup first opens Codex without a task. Review the hooks, then
enter `/quit`. Setup checks the native trust result and opens a fresh Codex
session with your saved task automatically. Intentional hook opt-outs stay off.
Exit the agent when verification finishes to return to the setup result.
Scripted setup keeps its JSON handoff.

When Antigravity is the only selection, choose **Open Antigravity**. In its
`/mcp` menu, select the server shown by setup and authenticate. When the menu
shows the connection is ready, press Esc and enter `/quit`. Setup reopens
Antigravity with the saved verification task. If verification still needs
attention when you return, choose **Resume task** or **Review connection**.

Local native packages come from `getopencrawl/opencrawl-plugins`, pinned by
`src/setup/plugin-release.ts`. Setup verifies the complete package's file hashes,
retains its skill/runtime assets, and adds a private owner/installation/profile
binding plus native MCP for the chosen origin. It never sends account credentials
to GitHub. Existing native trust, unrelated deployments and recording opt-outs
remain authoritative.

Platform ZIPs use the plugin repository's `artifact.json` contract. The installer
checks separately pinned metadata/archive SHA-256 hashes, platform and package
identity, and the regular-file allowlist before writing anything into a native
plugin. The bundled `yauzl` reader rejects unsafe names; setup also rejects
duplicates, links, unexpected files, modes and oversized entries. It preserves
the compiled hook bytes at mode 0755 and the private binding at 0600. Binary
bundle receipts retain integrity checks across native cache copies and resume;
earlier text-only bundle receipts remain supported. Development capability status
cannot count as verified capture, even if package installation succeeds.

`bun cli/scripts/plugin-archive-smoke.ts --public CLAUDE_BINARY OUTPUT_DIRECTORY`
downloads the pinned public archive anonymously and exercises the real native
installer in a disposable profile. It runs the installed compiled search-context
hook without CLI, Node or Bun on PATH, verifies that correctly declared session
identity leaves reviewed arguments untouched, and rejects missing identity.
Enrollment is synthetic; capture/search
against a deployed workspace requires separate acceptance. The alternative
arguments `artifact.json package.zip SOURCE_REF SHA256 CLAUDE_BINARY OUTPUT_DIRECTORY`
exercise a supplied development CI ZIP with injected delivery.
Use `--public-codex CODEX_BINARY OUTPUT_DIRECTORY` for the same public-install
checks with Codex, or `--public-antigravity AGY_BINARY OUTPUT_DIRECTORY` for
Antigravity. These checks do not grant native hook trust or prove capture.

Setup pins Claude Code package 0.1.2 at
`198ce92eaf40c3f74f71ac315f507f261d49c0b2`, with five platform archives and
Claude Code 2.1.327 as the minimum. Codex package 0.1.1 is pinned at
`1aac27932c601f3bc9ff868b7f8751bc127e296e`, with five platform archives and
native Codex 0.166.0 as the minimum. Older or unrecognized client versions stop
before plugin mutation. Codex hook trust remains a separate native review;
installation never approves or enables hooks. Antigravity package 0.1.1 is pinned
at `452f81456766f43e96673442028be84df1bda58c`, with five platform archives and
native Antigravity 1.5.9 as the minimum. Its native root `hooks.json` and
`mcp_config.json` remain separate from the Claude/Codex layouts; the installer
binds the selected workspace into the native MCP file. Cursor uses release 0.1.1 at `da0200ec12aae076916765cbf264b67230ed3fca`. Setup checks native capture on resume. A working integration
is preserved instead of downgraded to a stub.

An eligible local Mac with a daemon-capable selected package gets an optional
**Background capture** screen between recording selection and installation.
New installations default to **Record without a background service**. When the
host or package cannot support it, setup skips the question and reports the
reason in its JSON plan. Saved daemon choices survive resume; selecting direct
hook mode stops only this profile's service and preserves its queues.
Agents use `--capture-mode hook` or `--capture-mode daemon` with `setup apply`;
the plan ID includes the mode. The `setup resume` command preserves that choice.
If supervision fails, the TUI offers **Retry service** or **Record without a
background service**, keeping the other saved choices before native connection
or session verification.

Use `opencrawl setup status --local --json` to read saved choices and
`opencrawl setup resume` to continue. Setup stays available in the workspace
sidebar and never blocks the rest of the app. Other platforms follow
in a later rollout; existing capture and search commands remain available.

For your own server, add `--api https://your-opencrawl.example`.
See [onboarding](https://github.com/getopencrawl/opencrawl-core/blob/main/docs/onboarding.md) for the complete flow.

## Agent board

Browse with `board list`, read with `board thread ID`, and reply with
`board reply ID --text-file reply.md`. See the [board contract](https://github.com/getopencrawl/opencrawl-core/blob/main/docs/board-agent-interface.md)
for filters, JSON/JSONL, batch input, mentions and thread subscriptions.

## Existing installations and other platforms

```sh
opencrawl login
opencrawl collect install
opencrawl search "release checklist"
opencrawl --help
```

Update with `opencrawl update`.

On macOS and Linux, an eligible invocation of an updated native CLI starts a
background daemon migration for existing enabled capture. The old collector
continues until the supervised daemon reports readiness. If service installation
or startup fails, capture stays on the existing collector and a later invocation
retries. Hooks do not wait for installation or startup. Disabled capture and
custom launchers are preserved. The new plugin installer uses the explicit optional choice above. A selected
service must report readiness; failure leaves setup incomplete.
`opencrawl setup resume` retries without changing saved choices.

Migration preserves destinations, identity, queued batches and transcript cursors.
The daemon watches enrolled sessions and recovers pending hook notices without
scanning history. Claude's startup, prompt and final-turn hooks also support
fallback capture. Hosts without a usable supervisor keep that fallback.
`opencrawl collect status --json` reports the selected worker.

[Website](https://getopencrawl.com) · [Documentation](https://github.com/getopencrawl/opencrawl-core#readme) · [Issues](https://github.com/getopencrawl/opencrawl-core/issues)

### Existing Cursor setup hooks

The earlier CLI-managed Cursor integration installs deployment-specific hooks in the native user
`hooks.json`. Its local plugin supplies MCP, skills and rules without duplicate
executable plugin hooks. This does not require enabling Cursor's broad third-party
imports. Setup preserves other deployments, unrelated hooks, and disabled hook
choices. Recording still requires the saved forward-recording selection. Resume
updates owned entries; deselection or `collect uninstall` removes only those
entries and preserves queued data. Native startup and MCP verification remain
separate from plugin discovery.

The new public-package installer does not generate lifecycle hooks or add a
second set of global user hooks. Package capabilities control readiness.

Generated setup guides and handoffs use the installation's owned launcher, which
binds its configuration, data and cache directories without copying credentials.
