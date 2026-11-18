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
