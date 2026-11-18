import {useEffect, useState, type ReactNode} from 'react';
import {CopyField, EmptyState, Notice, Page, Section, StatusBadge, Table} from '../design/components.tsx';
import type {Bootstrap, ProductApi} from './api.ts';

const clientNames = {'claude-code':'Claude Code', codex:'Codex', cursor:'Cursor', antigravity:'Antigravity', 'grok-bot':'Grok Bot', devin:'Devin', 'claude-desktop':'Claude Desktop', chatgpt:'ChatGPT'};

type Installation = NonNullable<Bootstrap['setup']>['installations'][number];
type Client = Installation['clients'][number];

const historyLabels = {
  not_started: 'Waiting',
  running: 'Importing in the background',
  complete: 'Imported',
  failed: 'Import needs attention in the CLI',
};

function ProgressCell({label, children}: {label: string; children: ReactNode}) {
  return <td><span className="oc-progress-label" aria-hidden="true">{label}</span><span>{children}</span></td>;
}

function ClientProgress({client, showHistory}: {client: Client; showHistory: boolean}) {
  const connected = client.mcp.state === 'authenticated' || (!client.forward && client.mcp.state === 'observed');
  const searchable = client.proof.state === 'verified';
  const ready = client.installed && connected && (!client.forward || searchable);

  return <tr>
    <th scope="row">{clientNames[client.client]}</th>
    <td><StatusBadge variant="pill" tone={ready ? 'success' : 'neutral'}>{ready ? 'Ready' : 'In progress'}</StatusBadge></td>
    <ProgressCell label="Plugin">{client.installed ? 'Installed' : 'Waiting'}</ProgressCell>
    <ProgressCell label="Workspace connection">{connected ? 'Verified' : 'Waiting'}</ProgressCell>
    <ProgressCell label="New session">{!client.forward ? 'Recording off' : searchable ? 'Captured and searchable' : 'Waiting'}</ProgressCell>
    {showHistory && <ProgressCell label="Past sessions">{client.history === 'import' ? historyLabels[client.historyProgress.state] : 'Skipped'}</ProgressCell>}
  </tr>;
}

function InstallationProgress({installation}: {installation: Installation}) {
  const showHistory = installation.clients.some(client => client.history === 'import');
  return <Section title={installation.machine.label} className="oc-management-panel oc-progress-panel">
    <Table label={`Setup progress on ${installation.machine.label}`} className="oc-progress-table">
      <thead><tr>
        <th scope="col">Client</th><th scope="col">Status</th><th scope="col">Plugin</th>
        <th scope="col">Workspace connection</th><th scope="col">New session</th>
        {showHistory && <th scope="col">Past sessions</th>}
      </tr></thead>
      <tbody>{installation.clients.map(client => <ClientProgress key={client.client} client={client} showHistory={showHistory}/>)}</tbody>
    </Table>
  </Section>;
}

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
  const installations = (status?.installations ?? []).map(installation => ({
    ...installation,
    clients: installation.clients.filter(client => client.forward || client.installed || Boolean(client.pluginState && client.pluginState !== 'not_selected')),
  })).filter(installation => installation.clients.length > 0);

  return <Page title="Setup" description="You can use the workspace while setup runs.">
    <div className="stack">
      {error && <Notice tone="danger">{error} Your saved choices are unchanged.</Notice>}
      <div className="oc-form-measure stack-sm">
        <CopyField label="Run in your terminal" value="opencrawl setup"/>
        <p className="muted">The CLI saves your choices and tells you when a sign-in or approval is needed.</p>
      </div>
      {installations.length ? <div>
        {installations.map(installation => <InstallationProgress key={installation.installationId} installation={installation}/>)}
      </div> : <EmptyState title="Waiting for setup" description="Run the command to get started."/>}
    </div>
  </Page>;
}
