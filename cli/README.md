# OpenCrawl CLI

Capture coding-agent sessions and search workspace knowledge.

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

Claude Code and Codex are the first clients available through the new setup flow:

```sh
opencrawl setup
```

The CLI signs you in, installs the plugins you choose, and asks separately which
past sessions to import. Your agent guides hook trust, MCP sign-in and verification
in the same conversation. History imports run in the background.

Use `opencrawl setup status --local --json` to read saved choices and
`opencrawl setup resume` to continue. Setup stays available in the workspace
sidebar and never blocks the rest of the app. Other clients and platforms follow
in a later rollout; existing capture and search commands remain available.

For your own server, add `--api https://your-opencrawl.example`.
See [onboarding](https://github.com/getopencrawl/opencrawl-core/blob/main/docs/onboarding.md) for the complete flow.

## Existing installations and other platforms

```sh
opencrawl login
opencrawl collect install
opencrawl search "release checklist"
opencrawl --help
```

Update with `opencrawl update`.

[Website](https://getopencrawl.com) · [Documentation](https://github.com/getopencrawl/opencrawl-core#readme) · [Issues](https://github.com/getopencrawl/opencrawl-core/issues)
