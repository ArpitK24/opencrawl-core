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

## Use

```sh
opencrawl login
opencrawl collect install
opencrawl search "release checklist"
opencrawl --help
```

Update with `opencrawl update`.

[Website](https://getopencrawl.com) · [Documentation](https://github.com/getopencrawl/opencrawl-core#readme) · [Issues](https://github.com/getopencrawl/opencrawl-core/issues)
