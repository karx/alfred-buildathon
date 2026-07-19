# Discord bot integrations — learnings

Hard-won notes from wiring Alfred’s **Discord input** (Bot Gateway + @mentions) and **Discord Webhook output**. Use this when debugging invites, tokens, intents, or “connected but nothing happens.”

**Code**

| Piece | Path / id |
|-------|-----------|
| Input adapter | `src/inputs/adapters/discordAdapter.js` · id `discord` |
| Gateway client | `src/inputs/adapters/discordGateway.js` |
| Output actuator | `src/outputs/actuators/discordWebhookActuator.js` · id `discord-webhook` |
| OAuth invite + callback | `src/server/localServer.js` (`/api/adapters/discord/invite`, `/callback`) |
| Vault write-through | `knowledgeBase.writeDiscordNote` |
| Inbox | `INBOX_SOURCES` includes `discord` |

**Architecture decision (settled)**

```txt
INPUT  → Bot Gateway (outbound WS) + bot token
         @mention only → discord.message.mention → inbox + 0 Inbox/*.md

OUTPUT → Incoming Webhook URL (separate secret)
         state change → rich embed (debounced)
```

Keep **input and output as separate modules**. Do not merge “Discord adapter” into one god-class. They share a product surface (Discord), not credentials or code paths.

---

## 1. Secrets: never confuse these three

| Name (typical .env) | What it actually is | Looks like | Used for |
|---------------------|---------------------|------------|----------|
| **`DISCORD_BOT_TOKEN`** | **Bot token** (Developer Portal → **Bot** → Reset/Copy Token) | ~70 chars, **3 segments** `AAAA.BBBB.CCCC` | Gateway Identify, `Authorization: Bot …`, REST as the bot |
| **`DISCORD_BOT_SECRET` / `DISCORD_CLIENT_SECRET`** | **OAuth2 client secret** (OAuth2 → Client Secret) | Often **32 chars, 1 segment** | Exchange `authorization_code` → token when code-grant is on |
| **`DISCORD_CLIENT_ID`** | Application / client id (same as app snowflake) | ~17–19 digits | Invite URLs `client_id=…` |
| Webhook URL | Channel Integrations → Webhooks | `https://discord.com/api/webhooks/ID/TOKEN` | **Output only** (`discord-webhook`) |

### Learning

- Putting the **client secret** in `botToken` / `DISCORD_BOT_TOKEN` → `GET /users/@me` **401**.
- Alfred rejects non–three-segment “tokens” early (`looksLikeBotToken`) so mislabeled secrets fail fast with a clear message.
- **Never commit** tokens, client secrets, or full webhook URLs. Settings + gitignored `.env` only.
- Webhook URLs pasted in chat are compromised; rotate in Discord if the log may leak.

### Verify token (safe)

```bash
# Length / shape only — do not print the secret
# Bot token: 3 segments. Client secret: usually 1 short segment.

curl -s -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "User-Agent: AlfredBot (alfred-buildathon, 0.1)" \
  https://discord.com/api/v10/users/@me
# Expect JSON with "bot": true and a username
```

Prefer **curl** (or Alfred’s `fetch`) over bare Python `urllib` from some environments — Cloudflare can return odd 403/1010 blocks on non-browser-like clients.

---

## 2. Gateway intents (close code **4014**)

### Symptom

```txt
[Discord] WebSocket closed (4014 Disallowed intent(s).)
```

### Cause

Identify used a **privileged intent** that is not enabled on the application (classically **Message Content Intent**, `1 << 15`).

### Alfred default

Gateway uses **non-privileged** intents only:

| Intent | Bit | Why |
|--------|-----|-----|
| GUILDS | `1 << 0` | Ready / guild lifecycle |
| GUILD_MESSAGES | `1 << 9` | `MESSAGE_CREATE` in guilds |
| DIRECT_MESSAGES | `1 << 12` | Optional DMs |

**Not** requested by default: `MESSAGE_CONTENT` (`1 << 15`).

### Why mention-only still works

Discord still delivers **message content for messages that @mention the bot** (and DMs) without the privileged intent. That matches Alfred’s noise filter: **only bot mentions** enter the inbox.

If you later need full channel text (every message), OR in Message Content Intent in the portal **and** in `DEFAULT_INTENTS` in `discordGateway.js`.

---

## 3. “Connected” ≠ “in a server”

| Signal | Means |
|--------|--------|
| `test()` / Settings “connected” / `Connected from environment` | Bot **token is valid** |
| Gateway `Ready as <username>` | WS session is live |
| `GET /users/@me/guilds` length **> 0** | Bot is **actually in guilds** |
| Input hit `discord.message.mention` | Someone @mentioned the bot in a visible channel |

### Learning

We saw long stretches of **Ready as kaaroClaw** with **`guilds: []`**. Token and Gateway were fine; the bot had never successfully joined a guild. Always check:

```bash
curl -s -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
  -H "User-Agent: AlfredBot (alfred-buildathon, 0.1)" \
  https://discord.com/api/v10/users/@me/guilds
```

---

## 4. Inviting the bot (the painful part)

### Prefer simple bot invite (no code grant)

Developer Portal → **Bot**:

- **Public Bot** ON (unless private installs only)
- **Requires OAuth2 Code Grant** → **OFF** when you can

**Installation** tab (2025/26 gotcha):

- **Install Link** → **None** if a custom install link forces code-grant UX

Minimal invite (View Channel + Read Message History = `66560`):

```txt
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=66560&scope=bot
```

Alfred also exposes:

```txt
GET http://localhost:3737/api/adapters/discord/invite
```

### Do **not** use the OAuth2 URL Generator kitchen sink

A URL that includes many scopes will feel “authorized” but not install a bot cleanly:

```txt
scope=bot+identify+email+guilds+webhook.incoming+rpc.*+applications.commands+…
permissions=<huge mask>
redirect_uri=https://localhost:3737   # wrong scheme/path
```

**Learnings from a bad invite URL**

| Bad choice | Effect |
|------------|--------|
| Extra scopes (`email`, `rpc.*`, `webhook.incoming`, …) | User OAuth / product flows, not “add bot to server” |
| `redirect_uri=https://localhost:3737` | Must be **`http`**, full path Alfred serves, and listed under OAuth2 → Redirects |
| Giant permissions mask | Unnecessary; `66560` is enough to receive mentions |
| “Success” page with **no `guild_id`** | Often **user OAuth only** — bot **not** in server |

### Code grant path (when you cannot turn it off)

If **Requires OAuth2 Code Grant** stays ON:

1. Register redirect **exactly** (Alfred serves both):
   - `http://localhost:3737/api/adapters/discord/callback`
   - `http://localhost:3737/api/adapters/discord/oauth/callback`
2. Invite with `scope=bot`, `response_type=code`, that `redirect_uri`.
3. On callback, Alfred **exchanges** the code with `client_id` + **client secret** (`DISCORD_BOT_SECRET`).
4. Without exchange, Discord may show a guild id on the query string while **`/users/@me/guilds` stays empty** — bot never truly joins.

**Learning:** “Bot authorized for guild X” HTML without a successful **token exchange** (when code-grant is required) is a false positive. Logs should show:

```txt
[Discord OAuth] token exchange ok guild=…
```

Then re-check guild list.

### Server picker

The Discord dialog must let you **choose a server**. If you only “Authorize application” with no guild picker, expect no bot membership.

---

## 5. Input path (Alfred behavior)

### Event

- Type: `discord.message.mention`
- Source: `discord` (must stay in `VALID_SOURCES`)
- Dedup: `messageId` (in-memory ring)
- Filters: optional `guildId`, `channelIds`; always ignore other bots; require bot @mention

### Routing

1. `outputHub` / input hits (always)
2. Vault note → `0 Inbox/YYYY-MM-DD Discord <author> <snippet>.md`
3. Inbox + skill runner → todos/nudges (`classify` kind `discord-message`)

### Simulate without live Discord

```bash
curl -X POST http://localhost:3737/api/adapters/discord/ingest \
  -H 'Content-Type: application/json' \
  -d @test/fixtures/discord.mention.json
```

### Env bootstrap

On start, if Settings has no discord config, adapter reads:

- `DISCORD_BOT_TOKEN` (preferred)
- or `DISCORD_BOT_SECRET` **only if it is actually a bot token** (name is misleading — prefer renaming)
- optional `DISCORD_GUILD_ID`, `DISCORD_CHANNEL_IDS`

---

## 6. Output path (webhook actuator)

| Item | Detail |
|------|--------|
| id | `discord-webhook` |
| Config | `webhookUrl` (required), `enabled` |
| Trigger | State change (2s debounce + fingerprint skip) + `send-test` |
| Payload | Rich embed (mode, todos, nudges, top nudge) — **not** full state dump |
| API | `POST /api/actuators/discord-webhook/connect` · `…/actions/send-test` |

Webhook secret lives in the URL. Input bot token is unrelated. You can run **only out**, **only in**, or both.

---

## 7. Debug checklist (ordered)

1. **Token shape** — three segments? `users/@me` → `bot: true`?
2. **Gateway** — log `Ready as …`? Or `4014` (intents)?
3. **Guilds** — `/users/@me/guilds` non-empty?
4. **Invite** — minimal `scope=bot`? Redirect exact match? Code exchange ok if code-grant?
5. **Channel perms** — bot can View Channel where you mention?
6. **Mention** — real `@BotName`, not a role ping that doesn’t mention the user?
7. **Alfred** — `[Input] discord → discord.message.mention` · `GET /api/alfred/input-hits`?
8. **Output** — separate `webhookUrl`; `send-test` before blaming state triggers

### Useful endpoints

```txt
GET  /api/adapters
POST /api/adapters/discord/actions/status
GET  /api/adapters/discord/invite
GET  /api/adapters/discord/callback          # OAuth redirect target
POST /api/adapters/discord/ingest
GET  /api/alfred/input-hits

GET  /api/actuators
POST /api/actuators/discord-webhook/connect
POST /api/actuators/discord-webhook/actions/send-test
```

---

## 8. Portal checklist (copy/paste)

**Application**

- [ ] Bot created; token copied → `DISCORD_BOT_TOKEN`
- [ ] Client ID → `DISCORD_CLIENT_ID`
- [ ] Client secret → `DISCORD_CLIENT_SECRET` or `DISCORD_BOT_SECRET` (only for code-grant exchange)
- [ ] Message Content Intent only if you need non-mention content

**Bot tab**

- [ ] Public Bot as needed
- [ ] Requires OAuth2 Code Grant **OFF** if possible

**Installation tab**

- [ ] Install Link **None** if it fights simple invites

**OAuth2 → Redirects** (code-grant only)

- [ ] `http://localhost:3737/api/adapters/discord/callback`

**Server**

- [ ] Bot in Integrations / member list
- [ ] Channel: View Channel (+ Read History if needed)

---

## 9. Anti-patterns

- Using OAuth **client secret** as the bot token  
- Kitchen-sink OAuth scopes for “just add a bot”  
- `https://localhost` redirects (Alfred is plain **http** locally)  
- Assuming Settings “connected” means the bot is in a guild  
- Dumping full Alfred `state` JSON to Discord webhooks  
- Merging webhook out + gateway in into one adapter  
- Enabling privileged intents “just in case” without portal toggles (→ 4014 loops)  
- Committing `.env` or webhook URLs  

---

## 10. What we shipped (reference)

| Capability | Status |
|------------|--------|
| Gateway mention → inbox + vault | Working |
| Env auto-connect bot token | Working |
| Code-grant OAuth exchange on callback | Working |
| Minimal invite JSON endpoint | Working |
| Webhook state embeds + send-test | Working |
| Unit tests (adapter + webhook) | Working |

**Live verify signal (input):** `@bot` in a joined guild → input hit + `0 Inbox/…Discord….md` (+ skill extract if LLM keys present).  
**Live verify signal (output):** `send-test` → embed in the webhook channel.

---

*Last updated from the Discord input/output buildathon integration session. Prefer updating this file when a new Discord gotcha burns an hour.*
