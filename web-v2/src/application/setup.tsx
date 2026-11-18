import {useEffect, useState} from 'react';
import {CopyField, Notice, Page, StatusBadge} from '../design/components.tsx';
import type {Bootstrap, ProductApi} from './api.ts';

/** Setup is a progress page. Choices and continuation live in the CLI. */
export function SetupPage({api, initial}: {api: Pick<ProductApi, 'bootstrap'>; initial: Bootstrap}) {
  const [status, setStatus] = useState(initial.setup);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let active = false;
    const refresh = async () => {
      if (active || document.visibilityState === 'hidden') return;
      active = true;
      try {
        const next = await api.bootstrap(controller.signal);
        if (!controller.signal.aborted) {setStatus(next.setup); setError('');}
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Progress could not refresh.');
      } finally {active = false;}
    };
    setStatus(initial.setup);
    void refresh();
    const timer = window.setInterval(() => {void refresh();}, 3000);
    return () => {controller.abort(); clearInterval(timer);};
  }, [api, initial.cacheScope]);
  const origin = new URL(initial.mcpUrl).origin;
  const command = `opencrawl setup --client claude-code --api ${origin}`;
  const clients = status?.installations.flatMap(installation => installation.clients
    .filter(client => client.client === 'claude-code' && (client.pluginState !== 'not_selected' || client.forward))
    .map(client => ({installation, client}))) ?? [];
  return <Page title="Setup" description="Connect Claude Code. You can use the workspace while setup runs.">
    <div className="stack">
      {error && <Notice tone="danger">{error} Your saved choices are unchanged.</Notice>}
      <div className="oc-form-measure"><CopyField label="Run in your terminal, or give this command to Claude Code" value={command}/></div>
      <p className="muted">The CLI saves your choices and tells you when a sign-in or approval is needed.</p>
      {!clients.length && <Notice title="Waiting for Claude Code">Run the command to get started.</Notice>}
      {clients.map(({installation, client}) => {
        const connected = client.mcp.state === 'authenticated' || !client.forward && client.mcp.state === 'observed';
        const searchable = client.proof.state === 'verified';
        const ready = client.installed && connected && (!client.forward || searchable);
        return <section className="stack" aria-label={`Claude Code on ${installation.machine.label}`} key={installation.installationId}>
          <h2>Claude Code on {installation.machine.label}</h2>
          <div className="action-row"><StatusBadge tone={ready ? 'success' : 'neutral'}>{ready ? 'Ready' : 'In progress'}</StatusBadge></div>
          <ul>
            <li>Plugin: <StatusBadge tone={client.installed ? 'success' : 'neutral'}>{client.installed ? 'Installed' : 'Waiting'}</StatusBadge></li>
            <li>Claude connection: <StatusBadge tone={connected ? 'success' : 'neutral'}>{connected ? 'Verified' : 'Waiting'}</StatusBadge></li>
            <li>New session: <StatusBadge tone={searchable ? 'success' : 'neutral'}>{!client.forward ? 'Recording off' : searchable ? 'Captured and searchable' : 'Waiting'}</StatusBadge></li>
          </ul>
          {client.history === 'import' && <p className="muted">Past sessions: {client.historyProgress.state === 'complete' ? 'Imported' : client.historyProgress.state === 'failed' ? 'Import needs attention in the CLI' : 'Importing in the background'}</p>}
        </section>;
      })}
    </div>
  </Page>;
}
