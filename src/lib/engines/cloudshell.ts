import { getCredential, saveCredential } from "@/lib/credentials";
import type { DecryptedCredential } from "@/lib/credentials";
import { config } from "@/lib/config";

const CLOUDSHELL_API = "https://cloudshell.googleapis.com/v1";
const DEFAULT_ENV = "users/me/environments/default";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPE_ERROR_MESSAGE =
  "Google didn't grant Cloud Shell access (the Cloud Platform scope is missing). " +
  "Reconnect Google Cloud Shell from your dashboard (Settings → Google Cloud Shell), " +
  "and on the Google consent screen make sure Cloud Platform access is allowed.";

export interface CloudShellEnvironment {
  id: string;
  state: string;
  sshHost?: string;
  sshPort?: number;
  sshUsername?: string;
  webPreviewUrl?: string;
}

function gHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

/**
 * Fetches the user's default Cloud Shell environment. Returns null when the
 * account has never initialized Cloud Shell (the user must open
 * https://shell.cloud.google.com once). Throws immediately on auth/API
 * failures so the UI can fail fast instead of polling for minutes.
 */
export async function getCloudShellEnvironment(
  accessToken: string
): Promise<CloudShellEnvironment | null> {
  const res = await fetch(`${CLOUDSHELL_API}/${DEFAULT_ENV}`, {
    headers: gHeaders(accessToken)
  });
  if (res.ok) return (await res.json()) as CloudShellEnvironment;
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    throw new Error(SCOPE_ERROR_MESSAGE);
  }
  throw new Error(`Google Cloud Shell API error (HTTP ${res.status})`);
}

/**
 * Returns a Google Cloud Shell credential whose access token is not expired,
 * refreshing it via the stored refresh token when needed.
 */
export async function ensureValidGoogleToken(
  userId: string
): Promise<DecryptedCredential> {
  const cred = await getCredential(userId, "OAUTH_CLOUD_SHELL");
  if (!cred) {
    throw new Error("Google Cloud Shell is not connected. Connect it from your dashboard first.");
  }

  const stillValid =
    cred.expiresAt &&
    cred.expiresAt.getTime() > Date.now() + 5 * 60 * 1000;
  if (stillValid) return cred;

  if (!cred.refreshToken) {
    throw new Error(
      "The Google Cloud Shell connection has expired. Reconnect it from your dashboard (Settings → Google Cloud Shell)."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: cred.refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) {
    throw new Error(
      "Google could not refresh the Cloud Shell session. Reconnect it from your dashboard (Settings → Google Cloud Shell)."
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Google returned no token during refresh.");
  }

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await saveCredential(userId, "OAUTH_CLOUD_SHELL", {
    accessToken: json.access_token,
    refreshToken: cred.refreshToken,
    privateKey: cred.privateKey ?? null,
    expiresAt
  });

  return { ...cred, accessToken: json.access_token, expiresAt };
}

/**
 * Registers our SSH public key on the default environment using the dedicated
 * addPublicKey endpoint, polling the returned long-running operation.
 */
async function addPublicKey(accessToken: string, publicKey: string) {
  const res = await fetch(`${CLOUDSHELL_API}/${DEFAULT_ENV}:addPublicKey`, {
    method: "POST",
    headers: gHeaders(accessToken),
    body: JSON.stringify({ key: publicKey })
  });
  const text = await res.text();
  if (!res.ok) {
    if (/ALREADY_EXISTS/i.test(text)) return; // key already registered
    if (res.status === 401 || res.status === 403) throw new Error(SCOPE_ERROR_MESSAGE);
    throw new Error(`Google Cloud Shell key registration failed (HTTP ${res.status})`);
  }
  let json: { name?: string } = {};
  try {
    json = JSON.parse(text) as { name?: string };
  } catch {
    json = {};
  }
  if (!json.name) return;
  for (let i = 0; i < 30; i += 1) {
    const opRes = await fetch(`${CLOUDSHELL_API}/${json.name}`, {
      headers: gHeaders(accessToken)
    });
    const op = (await opRes.json()) as {
      done?: boolean;
      error?: { message?: string; status?: string };
    };
    if (op.done) {
      if (op.error) {
        throw new Error(
          `Google Cloud Shell key registration failed: ${op.error.message ?? op.error.status}`
        );
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out while registering the SSH key on Google Cloud Shell");
}

/**
 * Starts the default Cloud Shell environment, registers our SSH public key,
 * and verifies the key actually works over SSH before returning. Returns null
 * when the environment cannot be reached.
 */
export async function ensureCloudShellStarted(
  accessToken: string,
  publicKey: string,
  privateKey: string
): Promise<CloudShellEnvironment | null> {
  // Ensure the environment is booted (start is a no-op when already running).
  try {
    const res = await fetch(`${CLOUDSHELL_API}/${DEFAULT_ENV}:start`, {
      method: "POST",
      headers: gHeaders(accessToken),
      body: "{}"
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) throw new Error(SCOPE_ERROR_MESSAGE);
      throw new Error(`Google Cloud Shell start failed (HTTP ${res.status})`);
    }
  } catch (err) {
    if (err instanceof Error && !/FETCH_FAILED/.test(err.message)) throw err;
  }

  let env: CloudShellEnvironment | null = null;
  for (let i = 0; i < 45; i += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    env = await getCloudShellEnvironment(accessToken);
    if (env && env.state === "RUNNING" && env.sshHost) break;
  }
  if (!env || !env.sshHost) return null;

  await addPublicKey(accessToken, publicKey);

  // The authorized key can take a few seconds to propagate; poll SSH until our
  // key actually authenticates so the bootstrap doesn't fail on a race.
  for (let i = 0; i < 10; i += 1) {
    try {
      await runRemoteCommand(env, privateKey, "echo ssh-ok", {
        timeoutMs: 20000
      });
      return env;
    } catch {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  return null;
}

export function generateSshKeyPair(): {
  privateKey: string;
  publicKey: string;
} {
  // Cloud Shell's addPublicKey only supports ssh-rsa / ssh-dss / ecdsa keys.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { utils: sshUtils } = require("ssh2");
  const pair = sshUtils.generateKeyPairSync("rsa", { bits: 2048 });
  const privateKey = pair.private.toString();
  const publicKey = publicKeyFromPrivate(privateKey);
  return { privateKey, publicKey };
}

export function publicKeyFromPrivate(privateKey: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { utils: sshUtils } = require("ssh2");
  const parsed = sshUtils.parseKey(privateKey);
  if (parsed instanceof Error) throw parsed;
  return `${parsed.type} ${parsed.getPublicSSH().toString("base64")}`;
}

/**
 * Returns a usable Cloud Shell SSH keypair for the user, generating and
 * persisting a fresh RSA key when none exists (or the stored one is an
 * unsupported type, e.g. the old ed25519 keys).
 */
export async function getOrCreateCloudShellKey(
  userId: string
): Promise<{ privateKey: string; publicKey: string }> {
  const cred = await getCredential(userId, "OAUTH_CLOUD_SHELL");
  if (!cred) {
    throw new Error("Google Cloud Shell is not connected. Connect it from your dashboard first.");
  }
  let privateKey = cred.privateKey ?? null;
  if (privateKey) {
    try {
      const pub = publicKeyFromPrivate(privateKey);
      if (pub.startsWith("ssh-rsa")) {
        return { privateKey, publicKey: pub };
      }
    } catch {
      privateKey = null;
    }
  }
  const pair = generateSshKeyPair();
  privateKey = pair.privateKey;
  await saveCredential(userId, "OAUTH_CLOUD_SHELL", {
    accessToken: cred.accessToken,
    refreshToken: cred.refreshToken ?? null,
    privateKey
  });
  return { privateKey, publicKey: pair.publicKey };
}

/**
 * Runs a single command over SSH on the Cloud Shell VM, feeding `stdin` if
 * provided. Resolves with the combined output and exit code.
 */
export async function runRemoteCommand(
  env: CloudShellEnvironment,
  privateKey: string,
  command: string,
  options: { stdin?: string; timeoutMs?: number } = {}
): Promise<{ stdout: string; code: number }> {
  const { stdin, timeoutMs = 120000 } = options;
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require("ssh2");
    const conn = new Client();
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, (execErr: Error | undefined, stream: any) => {
          if (execErr) {
            clearTimeout(timer);
            conn.end();
            reject(execErr);
            return;
          }
          stream.on("close", (code: number) => {
            clearTimeout(timer);
            conn.end();
            resolve({ stdout: `${out}${err}`.trim(), code: code ?? 0 });
          });
          stream.on("data", (d: Buffer) => (out += d.toString()));
          stream.stderr.on("data", (d: Buffer) => (err += d.toString()));
          if (stdin) {
            stream.write(stdin);
            stream.end();
          }
        });
      })
      .on("error", (e: Error) => {
        clearTimeout(timer);
        reject(e);
      })
      .connect({
        host: env.sshHost!,
        port: env.sshPort ?? 22,
        username: env.sshUsername!,
        privateKey,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 6
      });
  });
}

/**
 * Generates the bootstrap script that runs inside the Cloud Shell VM: it
 * clones the app repo, installs deps, starts the app and a Cloudflare quick
 * tunnel, and publishes the public URL back to the repo (mirroring the
 * Codespaces tunnel mechanism).
 */
export function cloudshellBootstrapScript(input: {
  repo: string;
  slug: string;
  port: number;
  token: string;
}): string {
  const { repo, slug, port, token } = input;
  return String.raw`
set -u
echo $$ > /tmp/servelless-bootstrap.pid
export GITHUB_TOKEN="${token}"
export REPO="${repo}"
export PORT="${port}"
export SLUG="${slug}"
TUN="$HOME/.servelless"
WS="$HOME/servelless/$SLUG"
CF="$TUN/cloudflared"
REPO_KEY=$(echo "$REPO" | tr '/' '-')
mkdir -p "$TUN"

if [ ! -x "$CF" ]; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "$CF" || { echo "cloudflared download failed" >&2; exit 1; }
  chmod +x "$CF"
fi

# Cloud Shell ships node without npm on the SSH PATH; bundle a portable
# Node.js (which includes npm) on first run and reuse it afterwards.
export PATH="$TUN/node/bin:$PATH"
if [ ! -x "$TUN/node/bin/npm" ]; then
  NODE_TAR="node-v22.23.2-linux-x64"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/\${NODE_TAR}.tar.xz" -o "$TUN/node.tar.xz" || { echo "node download failed" >&2; exit 1; }
  tar -xJf "$TUN/node.tar.xz" -C "$TUN" || { echo "node extract failed" >&2; exit 1; }
  mv "$TUN/$NODE_TAR" "$TUN/node"
  rm -f "$TUN/node.tar.xz"
fi
export PATH="$TUN/node/bin:$PATH"

if [ ! -d "$WS/.git" ]; then
  git clone "https://x-access-token:\${GITHUB_TOKEN}@github.com/\${REPO}.git" "$WS" || { echo "clone failed" >&2; exit 1; }
fi
cd "$WS" || exit 1
git pull -q --rebase 2>/dev/null || true

# Monorepo support: when the app lives under apps/<slug>, work from there.
if [ -d "$WS/apps/$SLUG" ]; then
  cd "$WS/apps/$SLUG" || exit 1
fi

if [ -f package.json ]; then npm install --no-fund --no-audit >/dev/null 2>&1; fi
if [ -f requirements.txt ]; then pip3 install -q -r requirements.txt >/dev/null 2>&1 || true; fi

app_up() { curl -fsS -m 5 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; }

start_app() {
  pkill -f "flask run.*$PORT" 2>/dev/null || true
  pkill -f "node server.js" 2>/dev/null || true
  sleep 1
  if [ -f package.json ]; then
    nohup npm start > "$WS/app.log" 2>&1 &
  elif [ -f server.js ]; then
    nohup node server.js > "$WS/app.log" 2>&1 &
  elif [ -f app.py ]; then
    nohup python3 -m flask run --host 0.0.0.0 --port "$PORT" --no-debugger --no-reload > "$WS/app.log" 2>&1 &
  else
    echo "no start command" >&2
    return 1
  fi
  for i in $(seq 1 30); do
    app_up && return 0
    sleep 2
  done
  return 1
}

cf_running() { pgrep -f "cloudflared tunnel --url http://127.0.0.1:$PORT" >/dev/null 2>&1; }

publish() {
  local url="$1"
  mkdir -p "$WS/.servelless"
  printf '{"url":"%s","port":%s,"updated":"%s"}\n' "$url" "$PORT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$WS/.servelless/tunnel-\${SLUG}.json"
  cd "$WS" || return
  git config user.email "servelless@users.noreply.github.com" 2>/dev/null
  git config user.name "servelless" 2>/dev/null
  git add ".servelless/tunnel-\${SLUG}.json" 2>/dev/null
  git commit -m "chore: tunnel url" --allow-empty >/dev/null 2>&1
  local BR
  BR=$(git symbolic-ref --short HEAD 2>/dev/null || echo main)
  for t in 1 2 3; do
    git push "https://x-access-token:\${GITHUB_TOKEN}@github.com/\${REPO}.git" "HEAD:$BR" >/dev/null 2>&1 && return 0
    sleep 5
  done
  return 1
}

start_app || { echo "app failed to start" >&2; exit 1; }

while true; do
  if ! cf_running; then
    rm -f "$TUN/tunnel.log"
    nohup "$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate --logfile "$TUN/tunnel.log" >/dev/null 2>&1 &
  fi

  URL=""
  for i in $(seq 1 90); do
    URL=$(grep -oE 'https://[a-z0-9-]+[.]trycloudflare[.]com' "$TUN/tunnel.log" 2>/dev/null | tail -1)
    [ -n "$URL" ] && break
    sleep 2
  done

  if [ -n "$URL" ] && app_up; then
    publish "$URL"
  fi

  for i in $(seq 1 40); do
    if ! cf_running; then break; fi
    if ! app_up; then break; fi
    sleep 15
  done
  sleep 5
done
`.trim().replace(/\\\$/g, "$");
}

/**
 * Reads the public tunnel URL a Cloud Shell bootstrap published to the app
 * repo's main branch. Tries the per-app slug file first, then the older
 * repo-key file for previously deployed instances.
 */
export async function resolveCloudShellTunnel(
  repo: string,
  slug: string,
  port: number
): Promise<string | null> {
  const candidates = [
    `tunnel-${slug}.json`,
    `tunnel-${repo.replace(/\//g, "-")}.json`
  ];
  for (const file of candidates) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${repo}/main/.servelless/${file}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        url?: string;
        port?: number;
        updated?: string;
      };
      if (!data.url || data.port !== port) continue;
      const updated = Date.parse(data.updated ?? "");
      if (!updated || Date.now() - updated > 60 * 60 * 1000) continue;
      return data.url;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Kills the app + tunnel processes inside the Cloud Shell VM (best-effort
 * "manual stop"). The session then idles and Google reclaims it automatically.
 */
export async function stopCloudShellApp(
  env: CloudShellEnvironment,
  privateKey: string
) {
  try {
    await runRemoteCommand(
      env,
      privateKey,
      "pkill -f 'servelless-bootstrap[.]sh' 2>/dev/null; pkill -f 'cloudflar[e]d' 2>/dev/null; pkill -f 'flask ru[n]' 2>/dev/null; pkill -f 'node server[.]js' 2>/dev/null; echo stopped",
      { timeoutMs: 30000 }
    );
  } catch {
    // best-effort
  }
}