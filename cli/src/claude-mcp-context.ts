import {closeSync, constants, fstatSync, openSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join} from 'node:path';
import {apiOrigin} from './oauth.ts';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value);

/** Use only the configuration scope Claude says served this call. A label can
 * be reused by a project, SDK or plugin for an entirely different endpoint. */
export function claudeMcpTool(event: JsonObject, api: string): string | undefined {
  const server = event.mcp_server;
  if (!object(server) || typeof server.name !== 'string' || !server.name || typeof event.tool_name !== 'string') return;
  const prefix = 'mcp__' + server.name.replace(/[^a-zA-Z0-9_-]/g, '_') + '__';
  if (!event.tool_name.startsWith(prefix)) return;
  const project = process.env.CLAUDE_PROJECT_DIR || event.cwd;
  let file: string;
  switch (server.source) {
    case 'user':
    case 'local':
      file = join(process.env.CLAUDE_CONFIG_DIR || homedir(), '.claude.json');
      break;
    case 'project':
      if (typeof project !== 'string' || !isAbsolute(project)) return;
      file = join(project, '.mcp.json');
      break;
    default: return;
  }
  try {
    const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
    let config: unknown;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) return;
      config = JSON.parse(readFileSync(fd, 'utf8'));
    } finally { closeSync(fd); }
    if (server.source === 'local') {
      if (typeof project !== 'string' || !object(config) || !object(config.projects)) return;
      config = config.projects[project];
    }
    if (!object(config) || !object(config.mcpServers) || !Object.hasOwn(config.mcpServers, server.name)) return;
    const target = config.mcpServers[server.name];
    if (!object(target) || !['http','sse'].includes(String(target.type)) || typeof target.url !== 'string') return;
    const origin = apiOrigin(api), endpoint = origin + '/mcp';
    if (target.url !== endpoint) {
      // Replicas' workspace-identity transport pins both audience and upstream
      // in its loopback relay URL. Compare the whole transport, including port.
      const encode = (value: string) => Buffer.from(value).toString('base64url');
      if (process.env.OPENCRAWL_AUTH !== 'replicas-workspace' ||
          target.url !== 'http://127.0.0.1:17323/identity/' + encode(origin) + '/' + encode(endpoint)) return;
    }
    return event.tool_name.slice(prefix.length);
  } catch { return; }
}
