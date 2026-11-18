import {setupPluginIdentity} from './plugins.ts';
import type {SetupUi} from './tui.tsx';

/** Antigravity 1.5 authenticates plugin servers inside its interactive /mcp menu. */
export async function launchAntigravitySetup(
  executable: string,
  api: string,
  prompt: string,
  needsLogin: boolean,
  ui: Pick<SetupUi, 'action' | 'signal'>,
  execute: (command: string, args: string[]) => Promise<number>,
): Promise<number> {
  if (needsLogin) {
    const server = setupPluginIdentity(api).name + '_opencrawl';
    const choice = await ui.action({
      title: 'Connect Antigravity',
      description: 'In Antigravity, enter /mcp and select this workspace.',
      details: [
        server,
        'Choose Authenticate. Follow the browser instructions and paste the code into Antigravity.',
        'When connected, close the menu with Esc and enter /quit. Setup will open your saved task.',
      ],
      actions: [{id: 'open', label: 'Open Antigravity'}, {id: 'close', label: 'Close'}],
    });
    if (choice !== 'open') return 2;
    const code = await execute(executable, []);
    if (code !== 0 || ui.signal.aborted) return code || 130;
  }
  return execute(executable, ['--prompt-interactive', prompt]);
}
