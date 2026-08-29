import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { getCredential } from "./credentials";
import {
  ensureCloudShellStarted,
  ensureValidGoogleToken,
  getOrCreateCloudShellKey,
  runRemoteCommand
} from "./engines/cloudshell";
import {
  createCodespace,
  deleteCodespace,
  ensureVerificationDevcontainer,
  findCodespace,
  setPortVisibility,
  startCodespace,
  resolvePublicTunnel,
  readCodespaceStatus
} from "./engines/codespaces";
import { getAiConfig, callLLM, extractJson } from "./ai";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "servelless",
  "X-GitHub-Api-Version": "2022-11-28"
};

export function normalizeRepoUrl(input: string): string {
  return input
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/^www\./, "");
}

export interface RepoInspection {
  repoFullName: string;
  private: boolean;
  defaultBranch: string;
  files: string[];
  packageJson: Record<string, unknown> | null;
  readme: string | null;
}

export async function inspectRepo(
  repoFullName: string,
  accessToken?: string | null
): Promise<RepoInspection | null> {
  const headers: Record<string, string> = { ...GH_HEADERS };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const repoRes = await fetch(
      `https://api.github.com/repos/${repoFullName}`,
      { headers, signal: AbortSignal.timeout(15000) }
    );
    if (!repoRes.ok) return null;
    const repo = (await repoRes.json()) as {
      private?: boolean;
      default_branch?: string;
      full_name?: string;
    };

    let files: string[] = [];
    const treeRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees/${
        repo.default_branch ?? "main"
      }?recursive=1`,
      { headers, signal: AbortSignal.timeout(15000) }
    );
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as { tree?: Array<{ path?: string }> };
      files = (tree.tree ?? [])
        .map((t) => t.path ?? "")
        .filter((p) => p && !p.startsWith(".git/"));
    }

    let packageJson: Record<string, unknown> | null = null;
    for (const path of ["package.json", "app/package.json"]) {
      const pkg = await fetchRawFile(repoFullName, repo.default_branch ?? "main", path, accessToken);
      if (pkg) {
        try {
          packageJson = JSON.parse(pkg) as Record<string, unknown>;
          break;
        } catch {
          // ignore malformed package.json
        }
      }
    }

    let readme: string | null = null;
    for (const name of ["README.md", "README", "readme.md"]) {
      readme = await fetchRawFile(repoFullName, repo.default_branch ?? "main", name, accessToken);
      if (readme) break;
    }

    return {
      repoFullName: repo.full_name ?? repoFullName,
      private: Boolean(repo.private),
      defaultBranch: repo.default_branch ?? "main",
      files: files.slice(0, 200),
      packageJson,
      readme: readme ? readme.slice(0, 4000) : null
    };
  } catch {
    return null;
  }
}

async function fetchRawFile(
  repoFullName: string,
  branch: string,
  path: string,
  accessToken?: string | null
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const res = await fetch(
      `https://raw.githubusercontent.com/${repoFullName}/${branch}/${path}`,
      { headers, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export interface StaticDetection {
  runnable: boolean;
  language: string | null;
  startCommand: string | null;
  port: number | null;
  notes: string[];
}

const DEFAULT_PORTS: Record<string, number> = {
  "next": 3000,
  "vite": 5173,
  "react-scripts": 3000,
  "serve": 3000
};

export function detectRunnable(insp: RepoInspection): StaticDetection {
  const notes: string[] = [];
  const files = insp.files;
  const lower = files.map((f) => f.toLowerCase());
  const hasPackageJson = Boolean(insp.packageJson);
  const hasServerJs = lower.some(
    (f) => f === "server.js" || f === "index.js" || f === "main.js" || f === "app.js"
  );
  const hasAppPy = lower.some((f) => f === "app.py" || f === "main.py" || f === "server.py");
  const hasRequirements = lower.includes("requirements.txt");
  const hasIndexHtml = lower.includes("index.html");

  let startCommand: string | null = null;
  if (hasPackageJson) {
    const scripts = (insp.packageJson?.scripts ?? {}) as Record<string, unknown>;
    const start = typeof scripts.start === "string" ? scripts.start : null;
    if (start) startCommand = `npm start (${start})`;
    else if (hasServerJs) startCommand = "node server.js";
  } else if (hasServerJs) {
    startCommand = "node server.js";
  } else if (hasAppPy) {
    startCommand = hasRequirements ? "pip + flask" : "flask";
  } else if (hasRequirements) {
    startCommand = "pip + flask";
  } else if (hasIndexHtml) {
    startCommand = "static site (serve index.html)";
  }

  let port: number | null = null;
  const startRaw = typeof (insp.packageJson?.scripts as Record<string, unknown> | undefined)?.start === "string"
    ? ((insp.packageJson?.scripts as Record<string, unknown>).start as string)
    : null;
  if (startRaw) {
    const envPort = startRaw.match(/(?:PORT|port)=(\d+)/);
    if (envPort) port = Number(envPort[1]);
  }
  if (!port) {
    const pkgPort = (insp.packageJson as Record<string, unknown> | null)?.["port"];
    if (typeof pkgPort === "number") port = pkgPort;
  }
  if (!port) {
    for (const f of lower.filter((x) => x.endsWith(".js") && x.startsWith("server"))) {
      const idx = files.findIndex((x) => x.toLowerCase() === f);
      if (idx >= 0) {
        const src = files[idx];
        // server.js content check happens via package.json heuristic; leave default
        void src;
      }
    }
  }
  if (!port && startCommand?.includes("next")) port = DEFAULT_PORTS["next"];
  if (!port && startCommand?.includes("vite")) port = DEFAULT_PORTS["vite"];
  if (!port && hasServerJs) port = 3000;
  if (!port && hasAppPy) port = 8080;
  if (!port && hasIndexHtml) port = 3000;
  if (!port) port = 3000;

  const runnable = Boolean(startCommand);
  if (!runnable) notes.push("No package.json start script, server.js, app.py, or index.html found.");
  if (insp.private) notes.push("Repo is private; verification may need credentials.");
  if (!hasPackageJson && !hasServerJs && !hasAppPy && !hasIndexHtml) {
    notes.push("Repo looks like a static site or has no detected runtime.");
  }
  if (!runnable) notes.push("Add a package.json with a start script to make it runnable.");

  return {
    runnable,
    language: hasPackageJson ? "node" : hasAppPy ? "python" : null,
    startCommand,
    port,
    notes
  };
}

export interface AiEval {
  title?: string;
  description?: string;
  category?: string;
  runnable?: boolean;
  port?: number;
  startCommand?: string;
  issues?: string[];
}

export async function evaluateWithAi(insp: RepoInspection): Promise<AiEval | null> {
  const cfg = await getAiConfig();
  if (!cfg) return null;

  const fileList = insp.files.slice(0, 80).join("\n");
  const pkg = insp.packageJson ? JSON.stringify(insp.packageJson).slice(0, 1500) : "(none)";
  const readme = insp.readme ? insp.readme.slice(0, 1500) : "(none)";

  const system =
    "You evaluate public GitHub repositories for a web-app marketplace. " +
    "Determine if the repo contains runnable web application code and extract listing metadata. " +
    "Reply ONLY with JSON of this exact shape: " +
    '{"runnable": boolean, "title": string, "description": string (1-2 sentences), "category": string, ' +
    '"port": number, "startCommand": string, "issues": string[]}. ' +
    "Set runnable=false when the repo clearly cannot run a web server (no runtime, empty, docs-only). " +
    "`startCommand` must be an exact shell command that boots the app and keeps it running, e.g. " +
    '"npm start", "npm run dev", "node server.js", "python3 app.py", or "python3 -m http.server 8000" for ' +
    "plain static HTML sites. `port` must be the port that command listens on. If no exact command is " +
    "clear from package.json/scripts or a known entry file, set runnable=false.";
  const user = `Repo: ${insp.repoFullName}\nDefault branch: ${insp.defaultBranch}\n\nFiles:\n${fileList}\n\npackage.json:\n${pkg}\n\nREADME:\n${readme}`;

  const raw = await callLLM(cfg, { system, user, json: true });
  if (!raw) return null;
  const obj = extractJson(raw);
  if (!obj) return null;

  const issues = Array.isArray(obj.issues)
    ? obj.issues.map((i) => String(i))
    : undefined;
  return {
    title: typeof obj.title === "string" ? obj.title.slice(0, 80) : undefined,
    description:
      typeof obj.description === "string" ? obj.description.slice(0, 300) : undefined,
    category: typeof obj.category === "string" ? obj.category.slice(0, 40) : undefined,
    runnable: typeof obj.runnable === "boolean" ? obj.runnable : undefined,
    port: typeof obj.port === "number" ? obj.port : undefined,
    startCommand: typeof obj.startCommand === "string" ? obj.startCommand : undefined,
    issues
  };
}

export interface VerificationResult {
  ok: boolean;
  url: string | null;
  port: number | null;
  startCommand: string | null;
  message: string;
  engine: "CODESPACES" | "CLOUD_SHELL";
}

export async function runVerification(
  userId: string,
  repoFullName: string,
  port: number,
  engine: "CODESPACES" | "CLOUD_SHELL",
  startCommandHint?: string | null
): Promise<VerificationResult> {
  if (engine === "CLOUD_SHELL") {
    return verifyInCloudShell(userId, repoFullName, port, startCommandHint);
  }
  return verifyInCodespaces(userId, repoFullName, port, startCommandHint);
}

async function verifyInCloudShell(
  userId: string,
  repoFullName: string,
  port: number,
  startCommandHint?: string | null
): Promise<VerificationResult> {
  try {
    const credential = await ensureValidGoogleToken(userId);
    const key = await getOrCreateCloudShellKey(userId);
    const env = await ensureCloudShellStarted(
      credential.accessToken,
      key.publicKey,
      key.privateKey
    );
    if (!env?.sshHost) {
      return {
        ok: false, url: null, port, startCommand: null,
        message: "Could not reach Google Cloud Shell.",
        engine: "CLOUD_SHELL"
      };
    }

    const slug = `${repoFullName.split("/")[1]}-${userId.slice(0, 8)}`;
    const script = buildVerificationScript(repoFullName, port, slug, startCommandHint);
    await runRemoteCommand(env, key.privateKey, "cat > /tmp/servelless-verify.sh", {
      stdin: script,
      timeoutMs: 30000
    });
    await runRemoteCommand(
      env,
      key.privateKey,
      "pkill -f 'servelless-verify[.]sh' 2>/dev/null; pkill -f 'cloudflar[e]d' 2>/dev/null; sleep 1; chmod +x /tmp/servelless-verify.sh && setsid nohup /tmp/servelless-verify.sh > /tmp/servelless-verify.log 2>&1 < /dev/null & echo started",
      { timeoutMs: 30000 }
    );

    // Poll the log until the verification script reports a result.
    let output = "";
    for (let i = 0; i < 50; i += 1) {
      await new Promise((r) => setTimeout(r, 6000));
      const res = await runRemoteCommand(
        env,
        key.privateKey,
        "cat /tmp/servelless-verify.log 2>/dev/null",
        { timeoutMs: 20000 }
      );
      output = res.stdout;
      if (/RESULT_OK|RESULT_FAIL/.test(output)) break;
    }

    const fail = output.match(/RESULT_FAIL (.*)/);
    if (fail) {
      return {
        ok: false, url: null, port, startCommand: null,
        message: fail[1],
        engine: "CLOUD_SHELL"
      };
    }
    const portMatch = output.match(/RESULT_OK_PORT=(\d+)/);
    const urlMatch = output.match(/RESULT_OK_URL=(\S+)/);
    return {
      ok: true,
      url: urlMatch?.[1] ?? null,
      port: portMatch ? Number(portMatch[1]) : port,
      startCommand: "detected start command",
      message: "App started and responded on its port.",
      engine: "CLOUD_SHELL"
    };
  } catch (err) {
    return {
      ok: false, url: null, port, startCommand: null,
      message: err instanceof Error ? err.message : "Verification failed",
      engine: "CLOUD_SHELL"
    };
  }
}

async function verifyInCodespaces(
  userId: string,
  repoFullName: string,
  port: number,
  startCommandHint?: string | null
): Promise<VerificationResult> {
  try {
    const credential = await getCredential(userId, "GITHUB_CODESPACES");
    if (!credential) {
      return {
        ok: false, url: null, port, startCommand: null,
        message: "GitHub Codespaces is not connected.",
        engine: "CODESPACES"
      };
    }
    const token = credential.accessToken;

    // If the repo doesn't auto-start its app in a codespace, inject a
    // devcontainer on a `servelless-verify` branch so the app actually boots.
    const verifyRef = await ensureVerificationDevcontainer(token, repoFullName, port, startCommandHint);

    let cs = await findCodespace(token, repoFullName);
    if (verifyRef.injected) {
      // Existing codespaces were created from `main` and can't be re-ref'd;
      // delete any for this repo first to free a slot, then create fresh.
      if (cs) {
        await deleteCodespace(token, cs.name);
        cs = null;
      }
      cs = await createCodespace(token, repoFullName, verifyRef.ref);
    } else if (cs && cs.state === "Shutdown") {
      await startCodespace(token, cs.name);
    } else if (!cs) {
      cs = await createCodespace(token, repoFullName, verifyRef.ref);
    }
    if (!cs) {
      return {
        ok: false, url: null, port, startCommand: null,
        message:
          "Could not create a Codespace (GitHub plan limit). Free plans cap the " +
          "number of codespaces — stop or delete an existing one from the " +
          "Codespaces panel on the Developers page, then retry.",
        engine: "CODESPACES"
      };
    }

    // Wait for the codespace to reach a ready state (up to ~4 minutes).
    // GitHub reports ready codespaces as "Running" or "Available".
    let running = false;
    for (let i = 0; i < 48; i += 1) {
      await new Promise((r) => setTimeout(r, 5000));
      const cur = await findCodespace(token, repoFullName);
      if (cur && (cur.state === "Running" || cur.state === "Available")) {
        running = true;
        break;
      }
    }

    if (!running) {
      const cur = await findCodespace(token, repoFullName);
      return {
        ok: false, url: null, port, startCommand: null,
        message:
          `Codespace is still "${cur?.state ?? "unknown"}" after several minutes — GitHub is taking long to boot it. ` +
          "Delete the leftover codespace on the Developers page and retry, or verify via Google Cloud Shell instead.",
        engine: "CODESPACES"
      };
    }

    // GitHub defaults forwarded ports to private, which makes the app URL
    // return 401/403 for unauthenticated requests. Flip it to public first.
    await setPortVisibility(token, cs.name, port, "public");

    // Prefer a published public tunnel, then fall back to the forwarded port.
    let authGated = false;
    for (let i = 0; i < 30; i += 1) {
      const publicTunnel = await resolvePublicTunnel(repoFullName, cs.name, port, token);
      if (publicTunnel) {
        const res = await probe(publicTunnel.url, "trycloudflare.com");
        if (res.ok) {
          return {
            ok: true, url: publicTunnel.url, port, startCommand: null,
            message: "App reachable via published tunnel.",
            engine: "CODESPACES"
          };
        }
      }
      const appUrl = `https://${cs.name}-${port}.app.github.dev`;
      const res = await probe(appUrl, "app.github.dev");
      if (res.ok) {
        return {
          ok: true, url: appUrl, port, startCommand: null,
          message: "App responded on its forwarded port.",
          engine: "CODESPACES"
        };
      }
      if (res.status === 401 || res.status === 403) {
        // Port may still be private — retry making it public.
        authGated = true;
        await setPortVisibility(token, cs.name, port, "public");
      }
      await new Promise((r) => setTimeout(r, 8000));
    }

    const status = await readCodespaceStatus(token, repoFullName, cs.name);
    if (status?.message) {
      return {
        ok: false, url: null, port, startCommand: null,
        message: `Codespace reported: ${status.message}`,
        engine: "CODESPACES"
      };
    }

    return {
      ok: false, url: null, port, startCommand: null,
      message: authGated
        ? "Codespace is up but the app port is still auth-gated/private, so its URL " +
          "could not be reached. Open the codespace, make the forwarded port public, and retry."
        : verifyRef.injected
          ? "Codespace started but the app still did not respond on the forwarded port. " +
            "A devcontainer was auto-added on the `servelless-verify` branch — check it starts on port " +
            `${port} (listening on 0.0.0.0) and retry.`
          : "Codespace started but the app did not respond on the forwarded port. " +
            "The repo may need a .devcontainer.json that auto-starts the app.",
      engine: "CODESPACES"
    };
  } catch (err) {
    return {
      ok: false, url: null, port, startCommand: null,
      message: err instanceof Error ? err.message : "Verification failed",
      engine: "CODESPACES"
    };
  }
}

async function probe(
  target: string,
  expectedHost?: string
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12000)
    });
    const okStatus = res.status >= 200 && res.status < 400;
    if (!okStatus) return { ok: false, status: res.status };
    // If we got redirected away from the app host (e.g. GitHub login), the
    // "response" is an auth page, not the app — treat it as not reachable.
    const finalUrl = res.url || target;
    if (expectedHost) {
      try {
        const host = new URL(finalUrl).hostname;
        if (!host.endsWith(expectedHost)) {
          return { ok: false, status: 401 };
        }
      } catch {
        return { ok: false, status: 0 };
      }
    }
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function buildVerificationScript(
  repoFullName: string,
  port: number,
  slug: string,
  startCommandHint?: string | null
): string {
  const portSafe = String(port);
  const hint = startCommandHint
    ? `START_CMD='${startCommandHint.replace(/'/g, "'\\''")}'`
    : "START_CMD=''";
  return String.raw`
set -u
echo $$ > /tmp/servelless-verify.pid
export PORT="${portSafe}"
${hint}
WS="$HOME/servelless-verify/${slug}"
TUN="$HOME/.servelless"
CF="$TUN/cloudflared"
LOG="$WS/app.log"
mkdir -p "$TUN"
if [ ! -x "$CF" ]; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "$CF" || { echo "RESULT_FAIL cloudflared download failed" >&2; exit 0; }
  chmod +x "$CF"
fi
export PATH="$TUN/node/bin:$PATH"
if [ ! -x "$TUN/node/bin/npm" ]; then
  NODE_TAR="node-v22.23.2-linux-x64"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/\${NODE_TAR}.tar.xz" -o "$TUN/node.tar.xz" || { echo "RESULT_FAIL node download failed" >&2; exit 0; }
  tar -xJf "$TUN/node.tar.xz" -C "$TUN" || { echo "RESULT_FAIL node extract failed" >&2; exit 0; }
  mv "$TUN/$NODE_TAR" "$TUN/node"
  rm -f "$TUN/node.tar.xz"
fi
export PATH="$TUN/node/bin:$PATH"

rm -rf "$WS"
git clone --depth 1 "https://github.com/${repoFullName}.git" "$WS" || { echo "RESULT_FAIL repo clone failed" >&2; exit 0; }
cd "$WS" || exit 0
if [ -d "apps/${slug}" ]; then cd "apps/${slug}"; fi
if [ -f package.json ]; then npm install --no-fund --no-audit >/dev/null 2>&1; fi
if [ -f requirements.txt ]; then pip3 install -q -r requirements.txt >/dev/null 2>&1 || true; fi

app_up() { curl -fsS -m 5 "http://127.0.0.1:$PORT/" >/dev/null 2>&1; }

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
    run_and_wait "python3 -m http.server $PORT --bind 0.0.0.0" && return 0
  fi
  return 1
}

if ! start_app; then
  echo "RESULT_FAIL no start command worked — the app did not respond on port $PORT (last log: $LOG)"
  exit 0
fi
echo "RESULT_OK_PORT=$PORT"

rm -f "$TUN/verify-tunnel.log"
nohup "$CF" tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate --logfile "$TUN/verify-tunnel.log" >/dev/null 2>&1 &
URL=""
for i in $(seq 1 90); do
  URL=$(grep -oE 'https://[a-z0-9-]+[.]trycloudflare[.]com' "$TUN/verify-tunnel.log" 2>/dev/null | tail -1)
  [ -n "$URL" ] && break
  sleep 2
done
echo "RESULT_OK_URL=$URL"
sleep 3600
`.replace(/\\\$/g, "$");
}

export async function markSubmissionStatus(
  id: string,
  status: "CHECKING" | "VERIFIED" | "FAILED" | "UNDER_REVIEW",
  patch: {
    title?: string | null;
    description?: string | null;
    category?: string | null;
    detectedPort?: number | null;
    startCommand?: string | null;
    staticReport?: unknown;
    runReport?: unknown;
  } = {}
) {
  return prisma.appSubmission.update({
    where: { id },
    data: { status, ...patch } as Prisma.AppSubmissionUpdateInput
  });
}