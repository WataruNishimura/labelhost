---
name: labelhost
description: Set up and use labelhost for named local dev server URLs (e.g. https://myapp.localhost instead of http://localhost:3000). Use when integrating labelhost into a project, configuring dev server names, setting up the local proxy, working with .localhost domains, or troubleshooting port/proxy issues.
---

# Labelhost

Replace port numbers with stable, named .localhost URLs. For humans and agents.

Labelhost is a fork of [portless](https://github.com/vercel-labs/portless) by Vercel Labs. The CLI, npm package, state directory (`~/.labelhost`), and environment variables (`LABELHOST_*`) are renamed so it can run alongside portless, and it adds the `hostnameTemplate` config field and Pkl config. Upstream portless documentation mostly applies; substitute `labelhost` for `portless` and `LABELHOST_` for `PORTLESS_`. `portless.json` and a `"portless"` key in `package.json` are still read, but `PORTLESS_*` environment variables are not.

## Why labelhost

- **Port conflicts**: `EADDRINUSE` when two projects default to the same port
- **Memorizing ports**: which app is on 3001 vs 8080?
- **Refreshing shows the wrong app**: stop one server, start another on the same port, stale tab shows wrong content
- **Monorepo multiplier**: every problem scales with each service in the repo
- **Agents test the wrong port**: AI agents guess or hardcode the wrong port
- **Cookie/storage clashes**: cookies on `localhost` bleed across apps; localStorage lost when ports shift
- **Hardcoded ports in config**: CORS allowlists, OAuth redirects, `.env` files break when ports change
- **Sharing URLs with teammates**: "what port is that on?" becomes a Slack question
- **Browser history is useless**: `localhost:3000` history is a mix of unrelated projects

## Installation

Install globally (recommended) or as a project dev dependency. Do NOT use `npx` or `pnpm dlx` for one-off execution.

```bash
# Global (available everywhere)
npm install -g labelhost

# Or per-project dev dependency
npm install -D labelhost
```

When installed per-project, invoke via package.json scripts or `npx labelhost` (since the package is local, npx will not download anything).

## Quick Start

```bash
# Install globally (or add -D to a project)
npm install -g labelhost

# Run your app (auto-starts the HTTPS proxy on port 443)
labelhost run next dev
# -> https://<project>.localhost

# Or with an explicit name
labelhost myapp next dev
# -> https://myapp.localhost
```

The proxy auto-starts when you run an app. You can also start it explicitly with `labelhost proxy start`. Auto-start reuses the configuration (port, TLS, TLDs) from the most recent proxy run, so a restart or reboot does not silently revert to defaults. Explicit env vars always take priority.

In non-interactive environments (no TTY, or `CI=1`), labelhost exits with a descriptive error instead of prompting. Task runners like turborepo should pre-start the proxy.

## Integration Patterns

### Zero-config (recommended)

Bare `labelhost` works out of the box. It runs the `"dev"` script from `package.json` through the proxy, inferring the app name from the package name, git root, or directory:

```bash
labelhost        # -> runs "dev" script, https://<project>.localhost
pnpm dev        # -> works without labelhost, plain "next dev"
```

Use an optional `labelhost.json` to override defaults (name, script, port):

```json
{ "name": "myapp" }
```

```bash
labelhost        # -> runs "dev" script, https://myapp.localhost
```

### Monorepo

One `labelhost.json` at the repo root. Labelhost discovers packages from `pnpm-workspace.yaml`, or the `"workspaces"` field in `package.json` (npm, yarn, bun):

```json
{
  "apps": {
    "apps/web": {
      "name": "myapp",
      "hostnameTemplate": "{{worktree}}.{{name}}.dev"
    },
    "apps/api": { "name": "api.myapp" }
  }
}
```

```bash
labelhost                  # from repo root: start all packages with a "dev" script
cd apps/web && labelhost   # start just one package
labelhost --script start   # run "start" instead of "dev"
```

The `apps` map is optional and only provides name or hostname-template overrides. Unlisted packages auto-discover with inferred names.

Without an `apps` map, hostnames follow `<package>.<project>.localhost`. The project name comes from the most common npm scope (e.g. `@myorg/web` and `@myorg/api` produce `myorg`), falling back to the workspace root directory name. If a package's short name matches the project name, it uses the bare `<project>.localhost`.

### Turborepo

For turborepo projects, use labelhost as the `dev` script with the real command in a separate script:

```json
{
  "scripts": { "dev": "labelhost", "dev:app": "next dev" },
  "labelhost": { "name": "myapp", "script": "dev:app" }
}
```

`pnpm dev` runs turbo, which runs `labelhost` in each package. Labelhost detects the package manager and runs `pnpm run dev:app` through the proxy.

### package.json scripts

You can still use labelhost directly in scripts:

```json
{
  "scripts": {
    "dev": "labelhost run next dev"
  }
}
```

The proxy auto-starts when you run an app. Or start it explicitly: `labelhost proxy start`.

### Multi-app setups with subdomains

```bash
labelhost myapp next dev          # https://myapp.localhost
labelhost api.myapp pnpm start    # https://api.myapp.localhost
labelhost docs.myapp next dev     # https://docs.myapp.localhost
```

By default, only explicitly registered subdomains are routed (strict mode). Start the proxy with `--wildcard` to allow any subdomain of a registered route to fall back to that app (e.g. `tenant1.myapp.localhost` routes to the `myapp` app). Exact matches always take priority over wildcards.

### Git worktrees

`labelhost run` automatically detects git worktrees. In a linked worktree, the branch name is prepended as a subdomain prefix so each worktree gets a unique URL:

```bash
# Main worktree (no prefix)
labelhost run next dev   # -> https://myapp.localhost

# Linked worktree on branch "fix-ui"
labelhost run next dev   # -> https://fix-ui.myapp.localhost
```

No config changes needed. Put `labelhost run` in `package.json` once and it works in all worktrees.

### Bypassing labelhost

Set `LABELHOST=0` to run the command directly without the proxy:

```bash
LABELHOST=0 pnpm dev   # Bypasses proxy, uses default port
```

## How It Works

1. `labelhost proxy start` starts an HTTPS reverse proxy on port 443 as a background daemon. Auto-elevates with sudo on macOS/Linux; falls back to port 1355 if sudo is unavailable. Use `--no-tls` for plain HTTP on port 80. Configurable with `-p` / `--port` or the `LABELHOST_PORT` env var. The proxy also auto-starts when you run an app.
2. `labelhost <name> <cmd>` assigns a random free port (4000-4999) via the `PORT` env var and registers the app with the proxy
3. The browser hits `https://<name>.localhost`; the proxy forwards to the app's assigned port

Outside LAN mode, the proxy and its HTTP redirect listener bind only to the IPv4 and IPv6 loopback addresses, `127.0.0.1` and `::1`. They do not accept connections through LAN, VPN, or other network interfaces.

`.localhost` domains resolve to `127.0.0.1` natively in Chrome, Firefox, and Edge. Safari relies on the system DNS resolver, which may not handle `.localhost` subdomains on all configurations. Run `labelhost hosts sync` to add entries to `/etc/hosts` if needed.

Use `labelhost proxy start --tld localhost --tld test` to serve the same app names under multiple TLDs from one proxy. `LABELHOST_URL` uses the first configured TLD. When configured TLDs overlap (e.g. `example.com` and `dev.example.com`), hostnames are matched against the longest TLD first, regardless of configuration order. `LABELHOST_TLD` accepts the same comma separated list format, e.g. `LABELHOST_TLD=localhost,test`.

TLDs can be multi-segment DNS names such as `dev.example.com`, so local URLs can mirror production structure (`myapp.dev.example.com`). Each label follows DNS rules: lowercase letters, digits, interior hyphens, 63 characters per label, 253 total. Strict OAuth providers that reject `.localhost` redirect URIs accept a real domain like `https://myapp.dev.example.com/api/auth/callback/google`.

Most frameworks (Next.js, Express, Nuxt, etc.) respect the `PORT` env var automatically. For frameworks that ignore `PORT` (Vite, VitePlus, Astro, React Router, Angular, Expo, React Native), labelhost auto-injects the correct `--port` flag and, when needed, a matching `--host` CLI flag. Injection reaches through a package script whose command starts with the framework or a known runner (`"dev": "vite"`, `"dev": "bunx vite"`). Only the framework's server commands get the flags (`dev`, `serve`, `preview`, `start`, a bare `vite`, or `vite [root]`); a command that does not serve, such as `vite build`, `vite optimize`, `vp test` or `astro check`, rejects them and is left alone. Expo connection modes (`--localhost`, `--lan`, `--tunnel`) are preserved while the assigned port is still injected. A script labelhost cannot classify is left alone too: a flag before the subcommand on a CLI whose flag grammar it does not track (`vp --mode dev build`). Labelhost also leaves a script alone when appending flags to it would not work: a compound command (`&&`, `|`, `;`), a trailing `#` comment, its own `--` option terminator, an env prefix (`NODE_ENV=production vite`), delegation to another script (`"dev": "npm run dev:vite"`), or runner flags before the script name (`bun run --bun dev`). Those keep their own port, so set it in the script yourself.

### State directory

Labelhost stores its state (routes, PID file, port file) in `~/.labelhost`. When the proxy runs under sudo, this remains the invoking user's home directory so unprivileged apps and the proxy share route registrations. Override with the `LABELHOST_STATE_DIR` environment variable.

### Environment variables

| Variable               | Description                                                                    |
| ---------------------- | ------------------------------------------------------------------------------ |
| `LABELHOST_PORT`       | Override the default proxy port (default: 443 with HTTPS, 80 without)          |
| `LABELHOST_APP_PORT`   | Use a fixed port for the app (skip auto-assignment)                            |
| `LABELHOST_HTTPS`      | HTTPS on by default; set to `0` to disable (same as `--no-tls`)                |
| `LABELHOST_LAN`        | Set to `1` to always enable LAN mode (auto-detects LAN IP)                     |
| `LABELHOST_LAN_IP`     | Pin a specific LAN IP for LAN mode                                             |
| `LABELHOST_TLD`        | Use one or more TLDs, single or multi-segment (e.g. localhost,dev.example.com) |
| `LABELHOST_WILDCARD`   | Set to `1` to allow unregistered subdomains to fall back to parent             |
| `LABELHOST_SYNC_HOSTS` | Set to `0` to disable auto-sync of /etc/hosts (on by default)                  |
| `LABELHOST_TAILSCALE`  | Set to `1` to share apps on your Tailscale network (same as `--tailscale`)     |
| `LABELHOST_FUNNEL`     | Set to `1` to share apps publicly via Tailscale Funnel (same as `--funnel`)    |
| `LABELHOST_NGROK`      | Set to `1` to share apps publicly via ngrok (same as `--ngrok`)                |
| `LABELHOST_STATE_DIR`  | Override the state directory                                                   |
| `LABELHOST=0`          | Bypass the proxy, run the command directly                                     |

### HTTP/2 + HTTPS

HTTPS with HTTP/2 is enabled by default (faster page loads for dev servers with many files). WebSockets work over both HTTP/1.1 (Upgrade) and HTTP/2 (RFC 8441 extended CONNECT), so dev server HMR works through the proxy. First run generates a local CA and adds it to the system trust store. After that, no prompts and no browser warnings.

```bash
labelhost proxy start --cert ./c.pem --key ./k.pem  # Use custom certs
labelhost proxy start --no-tls                       # Disable HTTPS (plain HTTP)
labelhost trust                                      # Add CA to trust store later
```

On Linux, `labelhost trust` supports Debian/Ubuntu, Arch, Fedora/RHEL/CentOS, and openSUSE (via `update-ca-certificates` or `update-ca-trust`). On Windows, it uses `certutil` to add the CA to the system trust store. On WSL, it updates both the Linux trust store and the Windows current-user Root store so Windows browsers trust labelhost HTTPS certificates.

### LAN mode

```bash
labelhost proxy start --lan
labelhost proxy start --lan --https
labelhost proxy start --lan --ip 192.168.1.42
```

`--lan` explicitly binds the proxy to the IPv4 and IPv6 unspecified addresses, `0.0.0.0` and `::`, and advertises `<name>.local` hostnames over mDNS so devices on the same Wi-Fi can reach your apps. Labelhost auto-detects your LAN IP and follows network changes automatically, but you can pin a specific address with `--ip <address>` or the `LABELHOST_LAN_IP` environment variable. Set `LABELHOST_LAN=1` to default to LAN mode every time the proxy starts.

Labelhost remembers LAN mode via `proxy.lan`, so if you stop a LAN proxy and start again, it stays in LAN mode. All proxy settings (port, TLS, TLDs, LAN) are persisted and reused on auto-start unless overridden by explicit flags or env vars. Use `LABELHOST_LAN=0` for one start to switch back to `.localhost` mode. If a proxy is already running with different explicit LAN/TLS/TLD settings, labelhost warns and asks you to stop it first.

LAN mode depends on the system mDNS helpers that labelhost launches: macOS includes `dns-sd`, while Linux uses `avahi-publish-address` from `avahi-utils` (install via `sudo apt install avahi-utils` or your distro’s tooling).

- **Next.js**: add your `.local` hostnames to `allowedDevOrigins`:

  ```js
  // next.config.js
  module.exports = {
    allowedDevOrigins: ["myapp.local", "*.myapp.local"],
  };
  ```

- **Expo / React Native**: labelhost always injects `--port`. React Native also gets `--host 127.0.0.1`. Expo gets `--host localhost` outside LAN mode, but in LAN mode labelhost leaves Metro on its default LAN host behavior instead of forcing `--host` or `HOST`.

### Tailscale sharing

Share dev servers with teammates on your Tailscale network using `--tailscale`, or expose to the public internet with `--funnel`:

```bash
labelhost myapp --tailscale next dev
# -> https://myapp.localhost           (local)
# -> https://devbox.yourteam.ts.net    (tailnet)

labelhost myapp --funnel next dev
# -> https://myapp.localhost           (local)
# -> https://devbox.yourteam.ts.net    (public internet)
```

Tailscale HTTPS certificates must be enabled before `--tailscale` or `--funnel` can register HTTPS URLs. Funnel must also be enabled for the tailnet and node before `--funnel` can register the public URL. If either setting is missing, labelhost exits before starting the child process.

Each `--tailscale` app is root-mounted on its own Tailscale HTTPS port (443, then 8443, 8444, etc.) so no framework `basePath` configuration is needed. Set `LABELHOST_TAILSCALE=1` to share every app by default. `labelhost list` shows both local and tailnet URLs. Tailscale serve registrations are cleaned up when the app exits. Requires `tailscale` CLI installed and connected, with Tailscale HTTPS certificates enabled.

### ngrok sharing

Expose a dev server to the public internet with ngrok using `--ngrok`:

```bash
labelhost myapp --ngrok next dev
# -> https://myapp.localhost           (local)
# -> https://abc123.ngrok.app          (public internet)
```

Set `LABELHOST_NGROK=1` to enable ngrok by default when labelhost runs an app. `labelhost list` shows both local and ngrok URLs. The ngrok tunnel is cleaned up when the app exits. Requires the `ngrok` CLI to be installed and authenticated with `ngrok config add-authtoken <token>`.

## OS startup service

Use the service command when users want the proxy to start automatically after reboot:

```bash
labelhost service install
labelhost service install --lan
labelhost service install --wildcard
LABELHOST_STATE_DIR=~/.labelhost-lan LABELHOST_LAN=1 labelhost service install
labelhost service status
labelhost service uninstall
```

The service uses labelhost defaults unless install options or `LABELHOST_*` environment variables are provided: HTTPS on port 443 with `.localhost` names. `service install` accepts proxy options including `--port`, `--no-tls`, `--lan`, `--ip`, `--tld`, `--wildcard`, `--cert`, and `--key`. Use `--state-dir <path>` or `LABELHOST_STATE_DIR=<path>` to choose where service state and logs are written.

The chosen service configuration is written into launchd, systemd, or Task Scheduler and reused after reboot. `labelhost service status` reports the installed port, HTTPS mode, TLDs, LAN mode, wildcard mode, and state directory. macOS and Linux install a root-owned service so port 443 can bind at boot. Windows installs a Task Scheduler startup task that runs as SYSTEM. Installation and removal may require administrator privileges. `labelhost clean` automatically removes the service.

## CLI Reference

| Command                                            | Description                                                    |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `labelhost`                                        | Run dev script through proxy                                   |
| `labelhost`                                        | From monorepo root: run all workspace packages                 |
| `labelhost --script <name>`                        | Run a specific package.json script (default: dev)              |
| `labelhost run [cmd] [args...]`                    | Infer name from project, run through proxy (auto-starts)       |
| `labelhost run --name <name> <cmd>`                | Override inferred base name (worktree prefix still applies)    |
| `labelhost <name> <cmd> [args...]`                 | Run app at `https://<name>.localhost` (auto-starts proxy)      |
| `labelhost get <name>`                             | Print URL for a service (for cross-service wiring)             |
| `labelhost get <name> --no-worktree`               | Print URL without worktree prefix                              |
| `labelhost list`                                   | Show active routes                                             |
| `labelhost doctor`                                 | Check proxy, routes, DNS, CA trust, and LAN prerequisites      |
| `labelhost trust`                                  | Add local CA to system trust store (for HTTPS)                 |
| `labelhost clean`                                  | Remove state, CA trust entry, and /etc/hosts block             |
| `labelhost prune`                                  | Kill orphaned dev servers from crashed sessions                |
| `labelhost prune --force`                          | Kill orphans with SIGKILL instead of SIGTERM                   |
| `labelhost proxy start`                            | Start HTTPS proxy as a daemon (port 443, auto-elevates)        |
| `labelhost proxy start --no-tls`                   | Start without HTTPS (plain HTTP on port 80)                    |
| `labelhost proxy start --lan`                      | Start in LAN mode (mDNS `.local`, auto-follows LAN IP changes) |
| `labelhost proxy start -p <number>`                | Start the proxy on a custom port                               |
| `labelhost proxy start --tld test`                 | Use .test instead of .localhost                                |
| `labelhost proxy start --tld localhost --tld test` | Serve both TLDs from one proxy                                 |
| `labelhost proxy start --tld dev.example.com`      | Use a multi-segment TLD for production-parity URLs             |
| `labelhost proxy start --foreground`               | Start the proxy in foreground (for debugging)                  |
| `labelhost proxy start --wildcard`                 | Allow unregistered subdomains to fall back to parent route     |
| `labelhost proxy stop`                             | Stop the proxy                                                 |
| `labelhost service install`                        | Start the HTTPS proxy when the OS starts                       |
| `labelhost service install --lan`                  | Start the service in LAN mode                                  |
| `labelhost service install --wildcard`             | Persist wildcard routing in the startup service                |
| `labelhost service status`                         | Show service and proxy status                                  |
| `labelhost service uninstall`                      | Remove the startup service                                     |
| `labelhost alias <name> <port>`                    | Register a static route (e.g. for Docker containers)           |
| `labelhost alias <name> <port> --force`            | Overwrite an existing route                                    |
| `labelhost alias --remove <name>`                  | Remove a static route                                          |
| `labelhost hosts sync`                             | Add routes to /etc/hosts (fixes Safari)                        |
| `labelhost hosts clean`                            | Remove labelhost entries from /etc/hosts                       |
| `labelhost <name> --app-port <n> <cmd>`            | Use a fixed port for the app instead of auto-assignment        |
| `labelhost <name> --tailscale <cmd>`               | Share the app on your Tailscale network (tailnet)              |
| `labelhost <name> --funnel <cmd>`                  | Share the app publicly via Tailscale Funnel                    |
| `labelhost <name> --ngrok <cmd>`                   | Share the app publicly via ngrok                               |
| `labelhost <name> --force <cmd>`                   | Kill the existing process and take over its route              |
| `labelhost --name <name> <cmd>`                    | Force `<name>` as app name (bypasses subcommand dispatch)      |
| `labelhost <name> -- <cmd> [args...]`              | Stop flag parsing; everything after `--` is passed to child    |
| `labelhost --help` / `-h`                          | Show help                                                      |
| `labelhost run --help`                             | Show help for a subcommand (also: alias, hosts, clean)         |
| `labelhost --version` / `-v`                       | Show version                                                   |

**Reserved names:** `run`, `get`, `alias`, `hosts`, `list`, `doctor`, `trust`, `clean`, `prune`, `proxy`, and `service` are subcommands and cannot be used as app names directly. Use `labelhost run <cmd>` to infer the name, or `labelhost --name <name> <cmd>` to force any name including reserved ones.

## labelhost.json

Optional config file. Labelhost looks for it in the current directory. Lookup order: `labelhost.pkl`, `labelhost.json`, `portless.json`, then a `"labelhost"` or `"portless"` key in `package.json`. The `portless` names exist for compatibility with upstream portless projects.

| Field              | Type    | Default                    | Description                                              |
| ------------------ | ------- | -------------------------- | -------------------------------------------------------- |
| `name`             | string  | inferred from package.json | Base app name (worktree prefix still applies)            |
| `hostnameTemplate` | string  |                            | Hostname pattern. Supports `{{name}}` and `{{worktree}}` |
| `script`           | string  | `"dev"`                    | Name of a package.json script to run                     |
| `appPort`          | number  | auto-assigned              | Fixed port for the child process                         |
| `proxy`            | boolean | auto-detected              | Whether to route through the proxy (`false` for tasks)   |
| `apps`             | object  |                            | Overrides for workspace packages, keyed by relative path |
| `turbo`            | boolean | `true`                     | Set `false` to use direct spawning instead of turborepo  |

Each `apps` entry has the same shape (`name`, `hostnameTemplate`, `script`, `appPort`, `proxy`). When `apps` is present, top-level fields apply only in single-app mode.

`hostnameTemplate` is evaluated before labelhost adds the proxy TLD. `{{name}}` is the configured or inferred app name and `{{worktree}}` is the linked-worktree branch prefix. If there is no worktree prefix, its complete dot-delimited label is removed. For example, `{{worktree}}.{{name}}.dev` resolves to `myapp.dev.localhost` in the primary checkout and `feature-auth.myapp.dev.localhost` in a linked worktree.

### Pkl config

Config can be written in [Pkl](https://pkl-lang.org) instead of JSON. Put a
`labelhost.pkl` next to your `package.json` and amend the shipped schema:

```pkl
amends "https://raw.githubusercontent.com/WataruNishimura/portless/main/packages/labelhost/pkl/Labelhost.pkl"

name = "myapp"
hostnameTemplate = "{{worktree}}.{{name}}.dev"

apps {
  ["apps/web"] { appPort = 3000 }
  ["apps/api"] { name = "api.myapp"; proxy = false }
}
```

Amending the schema is the point: a misspelled property or an out-of-range
port fails at evaluation time, pointing at the offending line, instead of
being silently ignored the way an unknown JSON key is. When the package is
installed locally, amend `node_modules/labelhost/pkl/Labelhost.pkl` to avoid
fetching over HTTP.

This requires the [pkl CLI](https://pkl-lang.org/main/current/pkl-cli/index.html)
on `PATH`, or `LABELHOST_PKL_BIN` pointing at it. Only projects with a
`labelhost.pkl` need it. A `labelhost.pkl` that fails to evaluate is reported
as an error rather than skipped, so a broken config never starts an app under
the wrong hostname.

### package.json "labelhost" key

Instead of a separate `labelhost.json`, you can add a `"labelhost"` key to your `package.json`. A string value is shorthand for setting the name:

```json
{ "labelhost": "myapp" }
```

An object supports all per-app fields (`name`, `hostnameTemplate`, `script`, `appPort`, `proxy`):

```json
{ "labelhost": { "name": "myapp", "script": "dev:app" } }
```

Precedence (closest wins): CLI flags > package.json `"labelhost"` key > labelhost.json app entry > defaults.

## Troubleshooting

### Run diagnostics

Use `labelhost doctor` first when local routing or HTTPS behavior looks wrong. It is read-only and checks Node.js, state directory permissions, proxy liveness, route entries, hostname resolution, local CA trust, and LAN mode prerequisites.

### Proxy not running

The proxy auto-starts when you run an app with `labelhost <name> <cmd>`. If it doesn't start (e.g. port conflict), start it manually:

```bash
labelhost proxy start
```

### Port already in use

Another process is bound to the proxy port. Either stop it first, or use a different port:

```bash
labelhost proxy start -p 8080
```

### Framework not respecting PORT

Labelhost auto-injects the right `--port` flag and, when needed, a matching `--host` flag for frameworks that ignore the `PORT` env var: **Vite**, **VitePlus** (`vp`), **Astro**, **React Router**, **Angular**, **Expo**, and **React Native**. SvelteKit uses Vite internally and is handled automatically. Injection reaches through a package script whose command starts with the framework or a known runner, and only for the framework's server commands (`dev`, `serve`, `preview`, `start`, or a bare `vite`) — `vite build`, `vite optimize`, `vp test` and other non-serving commands reject the flags, so they are left untouched, as is any invocation labelhost cannot classify (`vp --mode dev build`). It is also skipped for a compound command (`&&`, `|`, `;`), a trailing `#` comment, its own `--` option terminator, an env prefix (`NODE_ENV=production vite`), delegation to another script, and runner flags before the script name (`bun run --bun dev`) — each of those keeps its own port and the app returns 502, so set the port in the script yourself.

For other frameworks that don't read `PORT`, pass the port manually:

- **Webpack Dev Server**: use `--port $PORT`
- **Custom servers**: read `process.env.PORT` and listen on it

### Permission errors

The default ports (80 for HTTP, 443 for HTTPS) require `sudo` on macOS and Linux. Labelhost auto-elevates with sudo when needed. If sudo is unavailable, it falls back to port 1355 (no sudo needed). On Windows, no elevation is required.

```bash
labelhost proxy start --https           # Auto-elevates with sudo for port 443
labelhost proxy start -p 1355 --https   # No sudo needed (URLs include :1355)
labelhost proxy stop                    # Stop (use sudo if started with sudo)
```

### Safari can't find .localhost URLs

Safari relies on the system DNS resolver for `.localhost` subdomains, which may not resolve them on all macOS configurations. Chrome, Firefox, and Edge have built-in handling.

Fix:

```bash
labelhost hosts sync    # Adds current routes to /etc/hosts
labelhost hosts clean   # Remove entries later
```

Auto-syncs `/etc/hosts` for route hostnames by default. Set `LABELHOST_SYNC_HOSTS=0` to disable.

### Browser shows certificate warning with --https

The local CA may not be trusted yet. Run:

```bash
labelhost trust
```

This adds the labelhost local CA to your system trust store. After that, restart the browser.

### Remove labelhost from the machine

```bash
labelhost clean
```

Stops the proxy if needed, removes the labelhost CA from the trust store (when labelhost added it), deletes known files under state directories, and removes the labelhost `/etc/hosts` block. May require `sudo` on macOS/Linux. If trust-store removal fails, labelhost retains its CA certificate and key so a later `labelhost clean` can safely retry.

### Proxy loop (508 Loop Detected)

If your dev server proxies requests to another labelhost app (e.g. Vite proxying `/api` to `api.myapp.localhost`), the proxy must rewrite the `Host` header. Without this, labelhost routes the request back to the original app, creating an infinite loop.

Fix: set `changeOrigin: true` in the proxy config (Vite, webpack-dev-server, etc.):

```ts
// vite.config.ts
proxy: {
  "/api": {
    target: "https://api.myapp.localhost",
    changeOrigin: true,
    ws: true,
  },
}
```

Labelhost automatically sets `NODE_EXTRA_CA_CERTS` in child processes so Node.js trusts the labelhost CA. If you run a separate Node.js process outside labelhost, point it at the CA manually: `NODE_EXTRA_CA_CERTS=~/.labelhost/ca.pem`. Alternatively, use `--no-tls` for plain HTTP.

### Tailscale not working

If `--tailscale` or `--funnel` fails:

```bash
tailscale status     # Check if connected
tailscale up         # Connect to your tailnet
```

Requires the Tailscale CLI to be installed (https://tailscale.com/download) and on PATH.

### ngrok not working

If `--ngrok` fails:

```bash
ngrok version                         # Check if installed
ngrok config add-authtoken <token>    # Configure authentication
```

Requires the ngrok CLI to be installed (https://ngrok.com/download) and on PATH.

### Requirements

- Node.js 24+
- macOS, Linux, or Windows
- `openssl` (for `--https` cert generation; ships with macOS and most Linux distributions; on Windows, install via `winget install -e --id ShiningLight.OpenSSL.Dev` or use the copy bundled with Git for Windows)
- `tailscale` CLI (optional, for `--tailscale` and `--funnel`)
- `ngrok` CLI (optional, for `--ngrok`)
