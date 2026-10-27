# Let your agent generate

Copilot, Cursor and Claude Code can plan and generate APIs through the
package's MCP server, with the same engine as the generator. The server
needs `laravel/mcp`:

```bash
composer require --dev laravel/mcp
```

- **Copilot**: the extension offers the server to agent mode (VS Code
  1.101 or later) and adds a skill that teaches Copilot the generator
- **Cursor**: the extension registers the server and the skill in Cursor,
  with no `mcp.json` to write
- **Claude Code**: the sidebar copies the command that adds the server
  to the project's `.mcp.json`

The **Agents** block of the sidebar shows where the project stands, with a
button for whatever is missing.
