# open-wiki

**The open-source alternative to Google's Code Wiki — with MCP.**

Index any codebase with tree-sitter, generate docs with your LLM, serve them through a full-featured docs site, and expose everything as tools for coding agents via MCP. Like Notion for code agents.

```
ow /path/to/your/project
```

---

## Install

```bash
npm install -g open-wiki
```

---

## Quick Start

```bash
# 1. Set your API key
ow config set-key anthropic sk-ant-...

# 2. Index a project
ow /path/to/project

# 3. Open the docs
ow serve
# → http://localhost:8383
```

---

## Commands

### `ow [path]`

Index a project and generate documentation. Defaults to the current directory.

```bash
ow                            # index current directory
ow /path/to/project           # index a specific path
ow . --force                  # re-index all files (ignore cache)
ow . --name myapp             # override the project name
ow . --provider openai        # use a specific LLM provider
```

| Flag | Description |
|------|-------------|
| `-p, --provider <name>` | LLM provider: `anthropic`, `openai`, `google` |
| `--name <name>` | Override project name (defaults to directory name) |
| `--force` | Re-index all files regardless of changes |

---

### `ow serve`

Start the docs server.

```bash
ow serve                      # start on default port 8383
ow serve --port 3000          # custom port
```

| Flag | Description |
|------|-------------|
| `-p, --port <port>` | Port to listen on (default: `8383`) |

---

### `ow config`

Manage API keys and provider settings.

```bash
ow config set-key anthropic sk-ant-...     # set Anthropic key
ow config set-key openai sk-...            # set OpenAI key
ow config set-key google AIza...           # set Google key
ow config set-default openai              # change default provider
ow config list                            # show all configured providers
```

Supported providers: `anthropic`, `openai`, `google`

---

### `ow list`

List all indexed projects.

```bash
ow list
```

---

### `ow mcp`

MCP server for coding agents. Exposes your indexed docs as tools.

```bash
ow mcp install    # register with Claude Code (run once)
ow mcp            # start the stdio MCP server (Claude Code does this automatically)
```

After `ow mcp install`, Claude Code gets 5 tools:

| Tool | What it does |
|------|-------------|
| `list_projects` | List all indexed projects with file and symbol counts |
| `get_project_overview` | Get the architecture overview and mermaid diagram for a project |
| `get_file_doc` | Get documentation for a specific file |
| `search_docs` | Full-text search across all docs in a project |
| `get_symbols` | List all functions, classes, and interfaces in a file or project |

---

### `ow setup`

Manage the underlying docs app.

```bash
ow setup            # install the docs app (runs automatically on first use)
ow setup --reset    # wipe and reinstall from scratch
```

---

## How It Works

1. **Index** — tree-sitter parses your source files and extracts symbols, signatures, and imports
2. **Generate** — one structured LLM call per file produces a summary and per-symbol docs
3. **Diff** — only changed files are re-processed on subsequent runs
4. **Serve** — a Next.js + fumadocs app renders the generated MDX with syntax highlighting, mermaid diagrams, and AI chat
5. **MCP** — the stdio server reads directly from the SQLite index and MDX files

---

## Supported Languages

- TypeScript / JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)
- Python (`.py`)

---

## License

MIT
