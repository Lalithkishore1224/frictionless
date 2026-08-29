export interface CodespacesLaunch {
  launchUrl: string;
  workspaceRef: string;
}

export interface CodespaceInfo {
  name: string;
  state: string;
  webUrl: string;
}

export interface CodespaceRow {
  name: string;
  state: string;
  repoFullName: string;
  webUrl: string;
}

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "servelless",
  "X-GitHub-Api-Version": "2022-11-28"
};

function ghHeaders(accessToken: string) {
  return { ...GH_HEADERS, Authorization: `Bearer ${accessToken}` };
}

function repoFullNameFromUrl(repoUrl: string): string {
  return repoUrl
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "");
}

function appUrlFor(name: string, targetPort: number): string {
  return `https://${name}-${targetPort}.app.github.dev`;
}

/**
 * Builds a 1-click Codespaces launch link for the given GitHub repository.
 * The forwarded public port is embedded as a query hint for devcontainer
 * consumers (the actual port forwarding is configured in .devcontainer.json).
 */
export function buildCodespacesLaunch(
  repoUrl: string,
  options: { ref?: string; targetPort?: number } = {}
): CodespacesLaunch {
  const { ref = "main", targetPort } = options;
  const orgRepo = repoFullNameFromUrl(repoUrl);

  const url = new URL(`https://codespaces.new/${orgRepo}`);
  url.searchParams.set("ref", ref);
  if (targetPort) url.searchParams.set("port", String(targetPort));

  return {
    launchUrl: url.toString(),
    workspaceRef: orgRepo
  };
}

/**
 * Finds the user's codespace running the given repository, if any.
 */
export async function findCodespace(
  accessToken: string,
  repoFullName: string
): Promise<CodespaceInfo | null> {
  try {
    const res = await fetch("https://api.github.com/user/codespaces", {
      headers: ghHeaders(accessToken)
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const codespaces = Array.isArray((data as { codespaces?: unknown[] }).codespaces)
      ? ((data as { codespaces: unknown[] }).codespaces as Record<string, unknown>[])
      : [];

    const needle = repoFullName.toLowerCase();
    const match = codespaces.find((cs) => {
      const repo = (cs.repository ?? {}) as Record<string, unknown>;
      const owner = (repo.owner ?? {}) as Record<string, unknown>;
      return `${owner.login ?? ""}/${repo.name ?? ""}`.toLowerCase() === needle;
    });

    if (!match) return null;
    return {
      name: String(match.name),
      state: String(match.state ?? ""),
      webUrl: String(match.web_url ?? `https://${match.name}.github.dev`)
    };
  } catch {
    return null;
  }
}

/**
 * Creates a codespace for the given repository using the Codespaces REST API
 * so the app boots automatically (the repo's devcontainer auto-starts it).
 * Returns the new codespace, or null when creation fails.
 */
export async function createCodespace(
  accessToken: string,
  repoFullName: string,
  ref = "main"
): Promise<CodespaceInfo | null> {
  try {
    const headers = ghHeaders(accessToken);
    const repoRes = await fetch(
      `https://api.github.com/repos/${repoFullName}`,
      { headers }
    );
    if (!repoRes.ok) return null;
    const repo = (await repoRes.json()) as { id: number; full_name: string };

    const res = await fetch("https://api.github.com/user/codespaces", {
      method: "POST",
      headers,
      body: JSON.stringify({ repository_id: repo.id, ref })
    });
    if (!res.ok) return null;
    const cs = (await res.json()) as { name: string; state: string; web_url: string };
    return {
      name: cs.name,
      state: cs.state,
      webUrl: cs.web_url ?? `https://${cs.name}.github.dev`
    };
  } catch {
    return null;
  }
}

/**
 * Starts a Shutdown codespace so the app boots again.
 */
export async function startCodespace(accessToken: string, name: string) {
  try {
    await fetch(`https://api.github.com/user/codespaces/${name}/start`, {
      method: "POST",
      headers: ghHeaders(accessToken)
    });
  } catch {
    // best-effort
  }
}

/**
 * Sets the visibility of a forwarded port. GitHub defaults forwarded ports to
 * private, which makes `https://<cs>-<port>.app.github.dev` return 401/403
 * for unauthenticated requests. Setting it to "public" lets anyone reach the
 * app through that URL, which is what verification and admins rely on.
 */
export async function setPortVisibility(
  accessToken: string,
  codespaceName: string,
  port: number,
  visibility: "public" | "private" = "public"
) {
  try {
    await fetch(
      `https://api.github.com/user/codespaces/${codespaceName}/ports/${port}`,
      {
        method: "POST",
        headers: ghHeaders(accessToken),
        body: JSON.stringify({ visibility })
      }
    );
  } catch {
    // best-effort
  }
}

/**
 * Stops a running codespace (frees an active slot without deleting the work).
 */
export async function stopCodespace(accessToken: string, name: string) {
  try {
    await fetch(`https://api.github.com/user/codespaces/${name}/stop`, {
      method: "POST",
      headers: ghHeaders(accessToken)
    });
  } catch {
    // best-effort
  }
}

/**
 * Deletes a codespace entirely, freeing up a slot under GitHub's codespace
 * plan limits.
 */
export async function deleteCodespace(accessToken: string, name: string) {
  await fetch(`https://api.github.com/user/codespaces/${name}`, {
    method: "DELETE",
    headers: ghHeaders(accessToken)
  });
}

/**
 * Lists every codespace owned by the authenticated user.
 */
export async function listCodespaces(
  accessToken: string
): Promise<CodespaceRow[]> {
  try {
    const res = await fetch("https://api.github.com/user/codespaces", {
      headers: ghHeaders(accessToken)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      codespaces?: Array<Record<string, unknown>>;
    };
    return (data.codespaces ?? []).map((cs) => {
      const repo = (cs.repository ?? {}) as Record<string, unknown>;
      const owner = (repo.owner ?? {}) as Record<string, unknown>;
      return {
        name: String(cs.name ?? ""),
        state: String(cs.state ?? ""),
        repoFullName: `${owner.login ?? ""}/${repo.name ?? ""}`,
        webUrl: String(cs.web_url ?? "")
      };
    });
  } catch {
    return [];
  }
}

/**
 * Resolves the live app URL for a Codespaces-backed deployment by looking up
 * the user's codespaces that are running the given repository and returning
 * the public forwarded-port URL. Returns null when no matching codespace
 * exists yet. A "Shutdown" codespace is best-effort started.
 */
export async function resolveCodespaceAppUrl(
  accessToken: string,
  repoFullName: string,
  targetPort: number
): Promise<string | null> {
  const cs = await findCodespace(accessToken, repoFullName);
  if (!cs) return null;
  if (cs.state === "Shutdown") await startCodespace(accessToken, cs.name);
  return appUrlFor(cs.name, targetPort);
}

/**
 * Reads the public Cloudflare tunnel URL a codespace publishes back to the
 * repo (`.servelless/tunnel-${codespaceName}.json`). Returns null when the
 * tunnel isn't registered (yet) or is stale.
 */
export async function resolvePublicTunnel(
  repo: string,
  codespaceName: string,
  port: number,
  accessToken?: string | null
): Promise<{ url: string } | null> {
  for (const branch of ["main", "servelless-tunnel"]) {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/.servelless/tunnel-${codespaceName}.json?ref=${branch}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) {
        // fall back to the unauthenticated raw read (public repos only)
        const raw = await fetch(
          `https://raw.githubusercontent.com/${repo}/${branch}/.servelless/tunnel-${codespaceName}.json`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!raw.ok) continue;
        const data = (await raw.json()) as {
          url?: string;
          port?: number;
          updated?: string;
        };
        if (!data.url || data.port !== port) continue;
        const updated = Date.parse(data.updated ?? "");
        if (!updated || Date.now() - updated > 60 * 60 * 1000) continue;
        return { url: data.url };
      }
      const data = (await res.json()) as { content?: string };
      if (!data.content) continue;
      const parsed = JSON.parse(
        Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
      ) as { url?: string; port?: number; updated?: string };
      if (!parsed.url || parsed.port !== port) continue;
      const updated = Date.parse(parsed.updated ?? "");
      if (!updated || Date.now() - updated > 60 * 60 * 1000) continue;
      return { url: parsed.url };
    } catch {
      // try the next branch
    }
  }
  return null;
}

/**
 * Reads the diagnostic status file a codespace's start script writes back to
 * the repo (`.servelless/status-${codespaceName}.json`), so verification can
 * report exactly what happened even when the tunnel never appeared.
 */
export async function readCodespaceStatus(
  token: string,
  repo: string,
  codespaceName: string
): Promise<{ ok?: boolean; message?: string; url?: string } | null> {
  const candidates = [
    `https://raw.githubusercontent.com/${repo}/main/.servelless/status-${codespaceName}.json`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const data = (await res.json()) as { ok?: boolean; message?: string; url?: string };
      if (data && typeof data === "object") return data;
    } catch {
      // fall through to the API
    }
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/.servelless/status-${codespaceName}.json?ref=main`,
      { headers: ghHeaders(token), signal: AbortSignal.timeout(10000) }
    );
    if (res.ok) {
      const data = (await res.json()) as { content?: string };
      if (data.content) {
        return JSON.parse(
          Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
        );
      }
    }
  } catch {
    // no status file — fall back to generic messaging
  }
  return null;
}

/**
 * Generates the .devcontainer.json fragment an operator should commit to a
 * Codespaces-enabled repo so target ports are auto-forwarded and published.
 */
export function devcontainerForPort(targetPort: number) {
  return {
    name: "Servelless App",
    image: "mcr.microsoft.com/devcontainers/universal:2",
    forwardPorts: [targetPort],
    portsAttributes: {
      [String(targetPort)]: {
        label: "App",
        onAutoForward: "notify"
      }
    }
  };
}

export interface VerifyDevcontainerRef {
  /** Git ref the codespace should be created from. */
  ref: string;
  /** True when Servelless injected a devcontainer on that branch. */
  injected: boolean;
}

export function buildStartScript(port: number, startCommandHint?: string | null): string {
  const hint = startCommandHint
    ? `START_CMD='${startCommandHint.replace(/'/g, "'\\''")}'`
    : "START_CMD=''";
  return `#!/bin/bash
set -u
export PORT=${port}
${hint}
LOG=/tmp/servelless-app.log
CF="$HOME/.servelless/cloudflared"

repo="\${GITHUB_REPOSITORY:-}"
csname="\${CODESPACE_NAME:-}"
token="\${GH_TOKEN:-\${GITHUB_TOKEN:-}}"

# Write a status file back to the repo (.servelless/status-<cs>.json) so
# verification can report exactly what happened — even on silent failures.
report() {
  [ -n "$repo" ] || return 0
  [ -n "$csname" ] || return 0
  [ -n "$token" ] || return 0
  local ok="$1" msg="$2" url="$3"
  local payload enc sha getres body
  payload=$(printf '{"ok":%s,"message":"%s","url":"%s","port":%s,"updated":"%s"}' \
    "$ok" "$msg" "$url" "$PORT" "$(date -u +%FT%TZ)")
  enc=$(printf '%s' "$payload" | base64 -w0)
  getres=$(curl -fsS -H "Authorization: Bearer $token" "https://api.github.com/repos/$repo/contents/.servelless/status-$csname.json" 2>/dev/null || true)
  sha=$(printf '%s' "$getres" | grep -o '"sha":"[^"]*"' | head -1 | sed 's/"sha":"//;s/"//')
  body=$(printf '{"message":"servelless status","content":"%s","branch":"main"%s}' "$enc" "\${sha:+, \"sha\": \"$sha\"}")
  curl -fsS -X PUT -H "Authorization: Bearer $token" "https://api.github.com/repos/$repo/contents/.servelless/status-$csname.json" -d "$body" >/dev/null 2>&1 || true
}

app_up() { curl -s -m 5 -o /dev/null "http://127.0.0.1:$PORT/"; }

# Try a candidate command; succeeds as soon as the port responds. Bails out
# early if the process exits without ever listening.
run_and_wait() {
  local cmd="$1"
  nohup bash -c "$cmd" > "$LOG" 2>&1 &
  local pid=$!
  for i in $(seq 1 20); do
    app_up && return 0
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 2
  done
  return 1
}

start_app() {
  if [ -n "$START_CMD" ]; then
    run_and_wait "$START_CMD" && return 0
  fi
  if [ -f package.json ]; then
    run_and_wait "npm start" && return 0
  fi
  for f in server.js index.js app.js main.js; do
    [ -f "$f" ] && run_and_wait "node $f" && return 0
  done
  if [ -f app.py ] || [ -f main.py ] || [ -f server.py ]; then
    for f in app.py main.py server.py; do
      [ -f "$f" ] && run_and_wait "python3 $f" && return 0
    done
  fi
  if [ -f index.html ]; then
    # No python guaranteed in the node image — use a tiny dependency-free
    # static file server so any plain HTML site just works.
    cat > /tmp/servelless-static.js <<'SERVEEOF'
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = process.cwd();
const port = Number(process.env.PORT || 3000);
const types = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain",
  ".pdf": "application/pdf", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".map": "application/json", ".xml": "application/xml"
};
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || "/").split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.normalize(path.join(root, p));
  if (!fp.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(fp).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, "0.0.0.0");
SERVEEOF
    run_and_wait "node /tmp/servelless-static.js" && return 0
  fi
  return 1
}

if ! start_app; then
  report false "app failed to start (see servelless-app.log)" ""
  echo "servelless: app failed to start"
  exit 0
fi

# Publish a real public Cloudflare tunnel (same mechanism as Cloud Shell) so
# the app URL works for anyone with no GitHub auth. The URL is written back to
# the repo under .servelless/ where verification reads it via the GitHub API.
publish_tunnel() {
  mkdir -p "$HOME/.servelless"
  if [ ! -x "$CF" ]; then
    curl -fsSL --retry 3 --connect-timeout 15 \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
      -o "$CF" || { report false "cloudflared download failed" ""; return 1; }
    chmod +x "$CF"
  fi
  for attempt in 1 2; do
    rm -f /tmp/servelless-tunnel.log
    if command -v setsid >/dev/null 2>&1; then
      setsid "$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate --logfile /tmp/servelless-tunnel.log >/dev/null 2>&1 &
    else
      nohup "$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate --logfile /tmp/servelless-tunnel.log >/dev/null 2>&1 &
    fi
    local url=""
    for i in $(seq 1 45); do
      url=$(grep -oE 'https://[a-z0-9-]+[.]trycloudflare[.]com' /tmp/servelless-tunnel.log 2>/dev/null | tail -1)
      [ -n "$url" ] && break
      sleep 2
    done
    if [ -n "$url" ]; then
      if [ -n "$repo" ] && [ -n "$csname" ] && [ -n "$token" ]; then
        local payload enc sha getres body
        payload=$(printf '{"url":"%s","port":%s,"updated":"%s"}' "$url" "$PORT" "$(date -u +%FT%TZ)")
        enc=$(printf '%s' "$payload" | base64 -w0)
        getres=$(curl -fsS -H "Authorization: Bearer $token" "https://api.github.com/repos/$repo/contents/.servelless/tunnel-$csname.json" 2>/dev/null || true)
        sha=$(printf '%s' "$getres" | grep -o '"sha":"[^"]*"' | head -1 | sed 's/"sha":"//;s/"//')
        body=$(printf '{"message":"chore: update servelless tunnel","content":"%s","branch":"main"%s}' "$enc" "\${sha:+, \"sha\": \"$sha\"}")
        if curl -fsS -X PUT -H "Authorization: Bearer $token" "https://api.github.com/repos/$repo/contents/.servelless/tunnel-$csname.json" -d "$body" >/dev/null 2>&1; then
          report true "published tunnel" "$url"
          echo "servelless: published $url"
          return 0
        fi
        # Contents API failed (restricted token) — fall back to a git push, which
        # works in codespaces via the GITHUB_TOKEN credential helper.
        git config user.email "servelless@localhost" >/dev/null 2>&1
        git config user.name "servelless" >/dev/null 2>&1
        git fetch origin main --quiet >/dev/null 2>&1
        git checkout -B servelless-tunnel origin/main >/dev/null 2>&1
        printf '{"url":"%s","port":%s,"updated":"%s"}' "$url" "$PORT" "$(date -u +%FT%TZ)" > ".servelless/tunnel-$csname.json"
        git add -f ".servelless/tunnel-$csname.json" >/dev/null 2>&1
        git commit -m "chore: servelless tunnel" >/dev/null 2>&1
        if git push -f origin servelless-tunnel >/dev/null 2>&1; then
          report true "published tunnel (git)" "$url"
          echo "servelless: published $url"
          return 0
        fi
      fi
      report false "tunnel url obtained but could not publish to repo" "$url"
      return 1
    fi
    pkill -f cloudflared 2>/dev/null || true
    sleep 2
  done
  report false "cloudflared could not obtain a tunnel url" ""
  return 1
}
publish_tunnel

# Keep this script alive so the app and tunnel processes started above are
# never reaped when the postCreateCommand session ends. Every cycle: ensure the
# app is still up, and re-publish the tunnel if cloudflared has died.
while true; do
  if ! app_up; then
    start_app >/dev/null 2>&1 || true
    sleep 15
    continue
  fi
  if ! pgrep -f "cloudflared.*tunnel" >/dev/null 2>&1; then
    publish_tunnel >/dev/null 2>&1 || true
  fi
  sleep 25
done
`;
}

function buildDevcontainerJson(port: number): string {
  const dc = {
    name: "Servelless Verify",
    image: "node:22",
    forwardPorts: [port],
    portsAttributes: {
      [String(port)]: { label: "App", onAutoForward: "notify" }
    },
    postCreateCommand:
      "bash -c 'if [ -f package.json ]; then npm install --no-fund --no-audit >/dev/null 2>&1 || true; fi; bash .devcontainer/servelless-start.sh'"
  };
  return JSON.stringify(dc, null, 2);
}

/**
 * Returns true when the repo already ships a devcontainer whose
 * postCreateCommand will boot the app automatically.
 */
async function hasAutoStartDevcontainer(
  token: string,
  repoFullName: string
): Promise<boolean> {
  for (const path of [".devcontainer/devcontainer.json", ".devcontainer.json"]) {
    const res = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${path}?ref=main`,
      { headers: ghHeaders(token), signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { content?: string };
    if (!data.content) continue;
    try {
      const parsed = JSON.parse(
        Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
      ) as { postCreateCommand?: string };
      if (typeof parsed.postCreateCommand === "string" && parsed.postCreateCommand.trim()) {
        return true;
      }
    } catch {
      // malformed devcontainer — treat as needing injection
    }
  }
  return false;
}

async function ensureBranch(token: string, repoFullName: string, branch: string) {
  const headRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/git/ref/heads/${branch}`,
    { headers: ghHeaders(token), signal: AbortSignal.timeout(15000) }
  );
  if (headRes.ok) return;

  const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, {
    headers: ghHeaders(token),
    signal: AbortSignal.timeout(15000)
  });
  if (!repoRes.ok) return;
  const repo = (await repoRes.json()) as { default_branch?: string };
  const mainRef = await fetch(
    `https://api.github.com/repos/${repoFullName}/git/ref/heads/${repo.default_branch ?? "main"}`,
    { headers: ghHeaders(token), signal: AbortSignal.timeout(15000) }
  );
  if (!mainRef.ok) return;
  const { object } = (await mainRef.json()) as { object?: { sha?: string } };
  if (!object?.sha) return;

  await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: object.sha })
  });
}

async function writeRepoFile(
  token: string,
  repoFullName: string,
  branch: string,
  path: string,
  content: string
) {
  const existing = await fetch(
    `https://api.github.com/repos/${repoFullName}/contents/${path}?ref=${branch}`,
    { headers: ghHeaders(token), signal: AbortSignal.timeout(15000) }
  );
  let sha: string | undefined;
  if (existing.ok) {
    const data = (await existing.json()) as { sha?: string };
    sha = data.sha;
  }
  const body: Record<string, unknown> = {
    message: "chore: add Servelless verification devcontainer",
    content: Buffer.from(content).toString("base64"),
    branch
  };
  if (sha) body.sha = sha;
  await fetch(`https://api.github.com/repos/${repoFullName}/contents/${path}`, {
    method: "PUT",
    headers: ghHeaders(token),
    body: JSON.stringify(body)
  });
}

/**
 * Makes a repo codespace-runnable for verification: when the repo has no
 * devcontainer that auto-starts the app, commits one on a `servelless-verify`
 * branch so a codespace created from that ref boots the app and forwards its
 * port. Returns the ref to create the codespace from.
 */
export async function ensureVerificationDevcontainer(
  token: string,
  repoFullName: string,
  port: number,
  startCommandHint?: string | null
): Promise<VerifyDevcontainerRef> {
  if (await hasAutoStartDevcontainer(token, repoFullName)) {
    return { ref: "main", injected: false };
  }
  const branch = "servelless-verify";
  try {
    await ensureBranch(token, repoFullName, branch);
    await writeRepoFile(
      token,
      repoFullName,
      branch,
      ".devcontainer/devcontainer.json",
      buildDevcontainerJson(port)
    );
    await writeRepoFile(
      token,
      repoFullName,
      branch,
      ".devcontainer/servelless-start.sh",
      buildStartScript(port, startCommandHint)
    );
    return { ref: branch, injected: true };
  } catch {
    // Fall back to whatever the repo already ships.
    return { ref: "main", injected: false };
  }
}