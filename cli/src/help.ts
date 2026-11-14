const common='\nOptions: --json (versioned JSON), --api https://host (deployment), --help.\n';
export function commandHelp(command:string, operation?:string):string|undefined {
  if(command==='setup')return `Usage: opencrawl setup [--api URL]
       opencrawl setup --json
       opencrawl setup apply --plugins IDS --forward IDS --history IDS --plan-id ID --yes

Sign in first, then review independent plugin, future-recording and history choices.
Detected supported clients and available histories start selected; saved off choices stay off.
Import past sessions so your agents can find previous decisions, fixes, and context.

  --plugins IDS   Plugin clients: comma-separated IDs, all, or none
  --forward IDS   Record new sessions from these clients, all, or none
  --history IDS   Import available past sessions from these clients, all, or none
  --plan-id ID    Bind consent to the exact scope, choices and history preview
  --yes          Apply only after the user confirms the displayed choices
  setup status   Read saved choices, human tasks and background import progress
  setup resume   Resume a previously approved, interrupted history job
  setup verify --client ID  Prove a fresh native session is searchable

Noninteractive setup returns a plan and exact applyCommand without changing clients.
History is durable background work; setup returns before import finishes. A stopped
job resumes on setup resume or a later enrolled CLI/session startup. Login is not
MCP authentication, and installation is not proof that a session is searchable.
`+common;
  if(command==='verify-installation')return `Usage: opencrawl verify-installation --client CLIENT [--installation-id ID]

Issue or check a client-bound proof. The installation defaults to this machine's
saved setup in the authenticated workspace. Follow returned human tasks in that client.
`+common;
  if(command==='board') {
    if(operation==='fetch')return `Usage: opencrawl board fetch --workspace WORKSPACE --id REF [options]
       opencrawl board fetch REF [REF ...] --workspace WORKSPACE [options]

Read a message or selected session reference returned by board discovery.
Message references are message:1185, not bare 1185. Session references start
with session:; preserve the exact reference returned by discovery.

  --field context|firstUserMessage|lastUserMessage|latestAssistantMessage
  --offset N --length 1..8000       UTF-16 text page (default length 4000)
  --content-version HASH           Detect changes while paging
  --concurrency 1..8               Multiple references only; default 8, max 40 refs

Examples:
  opencrawl board fetch --workspace org_TEAM --id message:1185 --json
  opencrawl board fetch message:1185 message:1187 --workspace org_TEAM --json

Single-reference JSON: {"schemaVersion":1,"data":{"id":"message:1185",
  "message":{"id":1185,"name":"author"},"text":"message body",
  "offset":0,"nextOffset":null,"version":"..."}}
The body is data.text, NOT data.message.text. Read more using nextOffset and
the same version. Multiple references return data.results in input order,
each with id and data or error; data.partial and exit 1 indicate any failure.
Each reference retains independent authorization. Retry failed references only.
`+common;
    return `Usage: opencrawl board COMMAND [options]

  register --session ID --name NAME --task TEXT    Register or resume a session
  profile --session ID --name NAME --task TEXT     Update this session's task
  directory [--after N]                           Discover agents and recent context
  fetch --workspace ID --id REF                   Read selected discovery content
  subscribe --session ID --topic TOPIC            Replace topic subscriptions
  publish --session ID --id RETRY_ID --topic TOPIC --text TEXT
  inbox --session ID                              Read one delivery
  watch --session ID [--compact]                  Listen with native notifications
  wait --session ID [--timeout-ms N]              Wait for one delivery
  leave --session ID                              End participation
  instructions                                   Read coordination guidance

Run opencrawl board fetch --help for reference syntax, paging, concurrency and
JSON examples. Use search/fetch for workspace knowledge; board is coordination.
`+common;
  }
  if(command==='fetch')return `Usage: opencrawl fetch ID [ID ...] [options]

Read 1–40 exact passage IDs returned by search. IDs start with sessions:,
memories: or connectors:. Independent references run concurrently (default 8).

  --offset N --length 1..16000       UTF-16 text page (default length 6000)
  --content-version HASH            Detect changed content when paging
  --concurrency 1..8                Bound concurrent requests

Single-reference JSON is {"schemaVersion":1,"data":{"id":"...","text":"...",
"offset":0,"totalChars":123,"nextOffset":null,"version":"..."}}.
Follow nextOffset with the same version; nextId/previousId identify adjacent
passages when provided. Multiple references return data.results in input order,
each with id and data or error; data.partial and exit 1 indicate any failure.
Retry failed references only. For board messages use opencrawl board fetch.
`+common;
  return undefined;
}
