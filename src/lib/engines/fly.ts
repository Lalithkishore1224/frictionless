const MACHINES_API = "https://api.machines.dev/v1";

async function flyFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<{ status: number; json: unknown }> {
  const token = accessToken.startsWith("FlyV1 ") ? accessToken.slice(6) : accessToken;
  const res = await fetch(`${MACHINES_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response
  }
  return { status: res.status, json };
}

export interface FlyVolume {
  id: string;
  name: string;
  size_gb: number;
  region: string;
  status: string;
}

export interface FlyMachine {
  id: string;
  name: string;
  state: string;
  region?: string;
}

export interface FlyCreateMachineInput {
  image: string;
  targetPort: number;
  volumeId: string;
  appName: string;
  env?: Record<string, string>;
  memoryMb?: number;
}

export async function listFlyApps(accessToken: string, org = "personal") {
  const { status, json } = await flyFetch(`/apps?org_slug=${org}`, accessToken);
  if (status !== 200) throw new Error(`Fly: failed to list apps (${status})`);
  return json as Array<{ name: string; org?: string }>;
}

/**
 * Step 1 of the orchestration: ensure a Fly app namespace exists, then
 * return its name. When no org is supplied Fly defaults to the user's
 * personal organization.
 */
export async function ensureFlyApp(
  appName: string,
  accessToken: string,
  org?: string
): Promise<string> {
  const { status } = await flyFetch(`/apps/${appName}`, accessToken);
  if (status === 200) return appName;

  const body: Record<string, unknown> = { app_name: appName, network: "default" };
  if (org) body.org_slug = org;
  const { status: createStatus, json } = await flyFetch("/apps", accessToken, {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (createStatus !== 200 && createStatus !== 201) {
    throw new Error(
      `Fly: could not create app "${appName}" (${createStatus}): ${JSON.stringify(json)}`
    );
  }
  return appName;
}

/**
 * Step 1 (volumes): provision an isolated persistent volume for the app.
 */
export async function provisionVolume(
  appName: string,
  accessToken: string,
  options: { sizeGb?: number; name?: string; region?: string } = {}
): Promise<FlyVolume> {
  const { sizeGb = 1, name, region } = options;
  const body: Record<string, unknown> = {
    size_gb: sizeGb,
    name: name ?? `${appName}-data`
  };
  if (region) body.region = region;
  const { status, json } = await flyFetch(
    `/apps/${appName}/volumes`,
    accessToken,
    { method: "POST", body: JSON.stringify(body) }
  );
  if (status !== 200 && status !== 201) {
    throw new Error(
      `Fly: volume provisioning failed (${status}): ${JSON.stringify(json)}`
    );
  }
  return json as FlyVolume;
}

export async function listVolumes(appName: string, accessToken: string) {
  const { status, json } = await flyFetch(
    `/apps/${appName}/volumes`,
    accessToken
  );
  if (status !== 200) return [];
  return json as FlyVolume[];
}

/**
 * Step 2 (machines): spin up the container with the mounted volume and a
 * public HTTPS service on the target port.
 */
export async function createMachine(
  appName: string,
  accessToken: string,
  input: FlyCreateMachineInput
): Promise<FlyMachine> {
  const machineConfig = {
    config: {
      image: input.image,
      auto_destroy: true,
      restart: {
        policy: "on-fail",
        max_retries: 3
      },
      env: input.env ?? {},
      mounts: [
        {
          volume: input.volumeId,
          path: "/data"
        }
      ],
      guest: {
        cpu_kind: "shared",
        cpus: 1,
        memory_mb: input.memoryMb ?? 256
      },
      services: [
        {
          protocol: "tcp",
          internal_port: input.targetPort,
          auto_stop_machines: true,
          ports: [
            { port: 443, handlers: ["tls", "http"] },
            { port: 80, handlers: ["http"] }
          ]
        }
      ]
    }
  };

  const { status, json } = await flyFetch(
    `/apps/${appName}/machines`,
    accessToken,
    { method: "POST", body: JSON.stringify(machineConfig) }
  );
  if (status !== 200 && status !== 201) {
    throw new Error(
      `Fly: machine creation failed (${status}): ${JSON.stringify(json)}`
    );
  }
  return json as FlyMachine;
}

export async function stopMachine(
  appName: string,
  machineId: string,
  accessToken: string
) {
  const { status } = await flyFetch(
    `/apps/${appName}/machines/${machineId}/stop`,
    accessToken,
    { method: "POST" }
  );
  if (status !== 200 && status !== 202) {
    throw new Error(`Fly: failed to stop machine (${status})`);
  }
}

export async function deleteMachine(
  appName: string,
  machineId: string,
  accessToken: string
) {
  const { status } = await flyFetch(
    `/apps/${appName}/machines/${machineId}`,
    accessToken,
    { method: "DELETE" }
  );
  if (status !== 200 && status !== 202) {
    throw new Error(`Fly: failed to delete machine (${status})`);
  }
}

export function publicUrlForMachine(appName: string, _machineName: string) {
  // Fly machines with a public service (443/80) are reachable at the app's
  // domain; machine hostnames are internal-only.
  return `https://${appName}.fly.dev`;
}

export function sanitizeAppName(appName: string): string {
  const cleaned = appName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 32) || "app";
}
