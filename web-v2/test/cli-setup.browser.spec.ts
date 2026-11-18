import {test, expect} from '@playwright/test';
import type {Bootstrap} from '../src/application/api.ts';

const bootstrap:Bootstrap={cacheScope:'cli-setup-test',workspace:{name:'Disposable workspace',userName:'Alex',email:'alex@example.com',role:'admin'},mcpUrl:'https://disposable.example/mcp',setupPrompt:'',canInvite:true,onboarding:{completed:false,next:'/onboarding'},setup:{schemaVersion:1,scope:{tenantId:'workspace',userId:'alex'},firstWin:null,installations:[]}};
for(const viewport of [{width:1280,height:800},{width:390,height:844}])test(`incomplete CLI setup permits navigation and history at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.route('**/api/console/bootstrap',route=>route.fulfill({json:bootstrap}));
  await page.goto('/setup?full-app');
  await expect(page.getByRole('heading',{name:'Setup',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Run in your terminal',exact:true})).toHaveValue('opencrawl setup');
  let documents=0;page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())documents++;});
  if(viewport.width<600)await page.getByRole('button',{name:'Open workspace navigation'}).click();
  await page.getByRole('navigation',{name:'Workspace navigation'}).getByRole('link',{name:'Sessions',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sessions',exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByRole('heading',{name:'Setup',exact:true})).toBeVisible();
  await page.goForward();await expect(page.getByRole('heading',{name:'Sessions',exact:true})).toBeVisible();
  expect(documents).toBe(0);
});

test('searchable capture alone stays pending until native Claude MCP is verified',async({page})=>{
  const data=structuredClone(bootstrap);
  data.setup!.installations=[{installationId:'install',machine:{id:'machine',label:'Test Mac'},updatedAt:'2026-11-17T12:00:00Z',clients:[{client:'claude-code',installed:true,pluginState:'installed',forward:true,history:'skip',historyProgress:{state:'not_started',completed:0},hookTrust:'not_required',mcp:{state:'observed'},proof:{state:'verified'},humanTasks:[]}]}];
  await page.route('**/api/console/bootstrap',route=>route.fulfill({json:data}));
  await page.goto('/setup?full-app');
  await expect(page.getByText('Captured and searchable',{exact:true})).toBeVisible();
  await expect(page.getByText('In progress',{exact:true})).toBeVisible();
  await expect(page.getByText('Ready',{exact:true})).toHaveCount(0);
  data.setup!.installations[0]!.clients[0]!.mcp.state='authenticated';
  await expect(page.getByText('Ready',{exact:true})).toBeVisible({timeout:6000});
});

test('machine groups keep client checks readable at desktop and compact widths', async ({page}) => {
  const data = structuredClone(bootstrap);
  const client: NonNullable<Bootstrap['setup']>['installations'][number]['clients'][number] = {
    client: 'codex', installed: true, forward: true, history: 'import',
    historyProgress: {state: 'failed', completed: 0}, hookTrust: 'trusted',
    mcp: {state: 'authenticated'}, proof: {state: 'verified'}, humanTasks: [],
  };
  const laptop = {installationId: 'one', machine: {id: 'one', label: 'Development laptop'}, updatedAt: '2026-11-17T12:00:00Z'};
  const desktop = {installationId: 'two', machine: {id: 'two', label: 'Office desktop'}, updatedAt: laptop.updatedAt};
  data.setup!.installations = [
    {...laptop, clients: [client, {...client, client: 'cursor', history: 'skip', forward: false}]},
    {...desktop, clients: [{...client, history: 'skip'}]},
    {...desktop, installationId: 'three', machine: {id: 'three', label: 'Unused machine'},
      clients: [{...client, installed: false, forward: false, pluginState: 'not_selected'}]},
  ];
  await page.route('**/api/console/bootstrap', route => route.fulfill({json: data}));
  await page.goto('/setup?full-app');
  const group = page.getByRole('region', {name: 'Development laptop', exact: true});
  const codex = group.getByRole('row').filter({has: page.getByRole('rowheader', {name: 'Codex'})});
  for (const width of [1280, 900, 390, 320]) {
    await page.setViewportSize({width, height: 850});
    await expect(group.getByRole('rowheader')).toHaveCount(2);
    await expect(codex.getByText('Import needs attention in the CLI')).toBeVisible();
    await expect(group.getByText('Recording off')).toBeVisible();
    await expect(group.getByRole('row').filter({hasText: 'Cursor'}).getByText('Skipped')).toBeVisible();
    const table = group.getByRole('region', {name: 'Setup progress on Development laptop'});
    expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (width < 1000) await expect(codex.getByText('Workspace connection')).toBeVisible();
  }
  await expect(page.getByRole('region', {name: 'Office desktop', exact: true}).getByRole('columnheader', {name: 'Past sessions'})).toHaveCount(0);
  await expect(page.getByRole('heading', {name: 'Unused machine'})).toHaveCount(0);
});
