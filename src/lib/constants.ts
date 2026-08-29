import type { LaunchEngine } from "@prisma/client";

export const LAUNCH_ENGINES: Record<
  LaunchEngine,
  {
    label: string;
    description: string;
    blurb: string;
  }
> = {
  OAUTH_CLOUD_FLY: {
    label: "Fly.io",
    description: "Ephemeral container on Fly.io with a persistent volume",
    blurb:
      "Runs your app as a live cloud container with an auto-provisioned persistent volume and a public HTTPS URL."
  },
  GITHUB_CODESPACES: {
    label: "GitHub Codespaces",
    description: "Free cloud devcontainer workspace (60h/month)",
    blurb:
      "Launches a free GitHub Codespaces devcontainer that mounts your persistent workspace and exposes the app publicly."
  },
  OAUTH_CLOUD_SHELL: {
    label: "Google Cloud Shell",
    description: "Free Google Cloud Shell VM (auto idle shutdown, 50h/week)",
    blurb:
      "Runs your app in a free Google Cloud Shell VM with automatic idle shutdown and a public URL."
  }
};

export function engineLabel(engine: LaunchEngine): string {
  return LAUNCH_ENGINES[engine].label;
}

export const ENGINE_OAUTH_ROUTE: Record<LaunchEngine, string> = {
  OAUTH_CLOUD_FLY: "/api/oauth/fly",
  GITHUB_CODESPACES: "/api/oauth/github",
  OAUTH_CLOUD_SHELL: "/api/oauth/google"
};

/**
 * Engines whose live URL must be resolved at open time (the instance URL
 * churns whenever the cloud instance restarts), as opposed to engines whose
 * instance URL is static (e.g. https://<app>.fly.dev).
 */
const LIVE_URL_ENGINES: LaunchEngine[] = ["GITHUB_CODESPACES", "OAUTH_CLOUD_SHELL"];

export function isLiveUrlEngine(engine: LaunchEngine): boolean {
  return LIVE_URL_ENGINES.includes(engine);
}

/**
 * Ordered deployment steps shown in the UI. `key` is the `Deployment.progress`
 * value the backend writes as each step starts; the UI marks each step
 * done / in-progress / pending from this order.
 */
export const DEPLOYMENT_STEPS: Record<
  LaunchEngine,
  { key: string; label: string }[]
> = {
  GITHUB_CODESPACES: [
    { key: "creating", label: "Starting your GitHub Codespace" },
    { key: "booting", label: "Booting your app" },
    { key: "tunnel", label: "Exposing a public URL" },
    { key: "ready", label: "Your app is ready" }
  ],
  OAUTH_CLOUD_SHELL: [
    { key: "starting", label: "Starting your Google Cloud Shell VM" },
    { key: "booting", label: "Installing & booting your app" },
    { key: "tunnel", label: "Exposing a public URL" },
    { key: "ready", label: "Your app is ready" }
  ],
  OAUTH_CLOUD_FLY: [
    { key: "creating", label: "Creating your Fly app" },
    { key: "storage", label: "Provisioning storage" },
    { key: "booting", label: "Starting your container" },
    { key: "ready", label: "Your app is ready" }
  ]
};

export function deploymentSteps(engine: LaunchEngine) {
  return DEPLOYMENT_STEPS[engine] ?? [];
}
