import "server-only";

import { createSign } from "node:crypto";
import {
  ACCEPT_JSON,
  APP_ID,
  DOWNLOADS_REPO,
  GITHUB_API,
  GITHUB_API_VERSION,
  GITHUB_ORG,
  INSTALLATION_ID,
  isPublisherConfigured,
} from "./config";

/**
 * The private key, handled ONLY here.
 *
 * Deliberately not exported and deliberately not in config.ts: no other module
 * has any way to obtain the PEM, so "who can sign as this App" is answerable by
 * reading one file. Never logged and never included in an error message, which
 * is why the validation below describes the problem without echoing any part of
 * the value.
 */
function privateKeyPem(): string {
  const b64 = process.env.GITHUB_PUBLISHER_PRIVATE_KEY_BASE64 ?? "";
  if (!b64) throw new GitHubError("unconfigured", "Publisher is not configured");
  const pem = Buffer.from(b64, "base64").toString("utf8");
  if (!pem.includes("BEGIN") || !pem.includes("PRIVATE KEY")) {
    throw new GitHubError(
      "unconfigured",
      "The publisher private key is not a valid PEM after base64 decoding",
    );
  }
  return pem;
}

/**
 * GitHub App authentication and the one HTTP wrapper every call goes through.
 *
 * WHY AN APP RATHER THAN A TOKEN
 * ------------------------------
 * A personal access token is a person's whole account, lives until someone
 * revokes it, and cannot be scoped to two repositories. A GitHub App
 * installation is scoped to exactly the repositories it is installed on, its
 * permissions are declared and visible, and the tokens it mints expire in an
 * hour whether or not anyone notices they leaked.
 *
 * WHAT NEVER LEAVES THIS MODULE
 * -----------------------------
 * The private key, the signed JWT and the installation token. No function here
 * returns any of them, nothing logs them, and no error message can contain
 * them: the error path deliberately reads status and a short GitHub message,
 * never the request that produced it.
 */

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type GhFailure =
  | "unconfigured"
  | "auth"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "invalid"
  | "rate-limited"
  | "server"
  | "network"
  | "timeout";

export class GitHubError extends Error {
  constructor(
    readonly failure: GhFailure,
    /** Safe to show an ADMIN. Never shown to a normal user. */
    message: string,
    readonly status?: number,
    /** Seconds to wait, when GitHub told us. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

function classify(status: number): GhFailure {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 422) return "invalid";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "server";
  return "invalid";
}

/** Turns a GitHub failure into something an admin can act on. */
export function githubErrorMessage(e: unknown): string {
  if (!(e instanceof GitHubError)) return "Something went wrong talking to GitHub.";
  switch (e.failure) {
    case "unconfigured":
      return "GitHub publishing is not configured on this deployment.";
    case "auth":
      return "GitHub rejected the publisher's credentials. The App key or installation may need attention.";
    case "forbidden":
      return "GitHub refused the request. The App may lack permission, or a branch rule may be blocking it.";
    case "not-found":
      return "GitHub could not find that repository, release or file.";
    case "conflict":
      return "Someone else changed the same thing at the same time. Retrying is safe.";
    case "invalid":
      return `GitHub rejected the request: ${e.message}`;
    case "rate-limited":
      return "GitHub is rate limiting the publisher. Wait a moment and retry.";
    case "server":
      return "GitHub had a server error. Nothing was lost. Retrying is safe.";
    case "timeout":
      return "GitHub did not respond in time. Retrying is safe.";
    default:
      return "Something went wrong talking to GitHub.";
  }
}

/* ------------------------------------------------------------------ */
/* App JWT                                                             */
/* ------------------------------------------------------------------ */

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * A short lived RS256 JWT identifying the App itself.
 *
 * `iat` is backdated a minute because GitHub rejects a token whose issued-at is
 * in the future, and small clock skew between a serverless host and GitHub is
 * normal. `exp` is well inside GitHub's ten minute ceiling.
 */
function appJwt(): string {
  if (!isPublisherConfigured) throw new GitHubError("unconfigured", "Publisher is not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 480, iss: APP_ID }));
  const signingInput = `${header}.${payload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = b64url(signer.sign(privateKeyPem()));

  return `${signingInput}.${signature}`;
}

/* ------------------------------------------------------------------ */
/* Installation token                                                  */
/* ------------------------------------------------------------------ */

/**
 * In-memory only, and deliberately so.
 *
 * An installation token expires in an hour. Persisting one would mean a
 * credential sitting in a database for no benefit, since minting a fresh one
 * costs a single request. This cache exists to avoid doing that on every call
 * within one warm instance, nothing more, and it dies with the process.
 */
let cached: {
  token: string;
  expiresAt: number;
  /** What GitHub says this token may do, e.g. { contents: "write" }. */
  permissions: Record<string, string>;
  /** "selected" when the App is installed on specific repositories only. */
  repositorySelection: string | null;
} | null = null;

/** Resolved once per process when the id was not supplied. */
let resolvedInstallationId: string | null = null;

async function installationId(): Promise<string> {
  if (INSTALLATION_ID) return INSTALLATION_ID;
  if (resolvedInstallationId) return resolvedInstallationId;

  // The App can look up its own installation on a repository it is installed
  // on. Saves the operator finding the id by hand, and cannot target anything
  // outside this organisation because the path is a constant.
  const res = await fetch(`${GITHUB_API}/repos/${GITHUB_ORG}/${DOWNLOADS_REPO}/installation`, {
    headers: {
      Accept: ACCEPT_JSON,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      Authorization: `Bearer ${appJwt()}`,
      "User-Agent": "GDMacros-Publisher",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GitHubError(
      classify(res.status),
      "Could not resolve the App installation. Is the App installed on both repositories?",
      res.status,
    );
  }
  const body = (await res.json()) as { id?: number };
  if (!body?.id) throw new GitHubError("auth", "Installation lookup returned no id");
  resolvedInstallationId = String(body.id);
  return resolvedInstallationId;
}

/**
 * A scoped, short lived token for the installation.
 *
 * Not exported: nothing outside this module ever holds one. `ghFetch` is the
 * only consumer.
 */
async function installationToken(): Promise<string> {
  const now = Date.now();
  // Refresh a minute early so a token cannot expire mid-request.
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  const id = await installationId();
  const res = await fetch(`${GITHUB_API}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: ACCEPT_JSON,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      Authorization: `Bearer ${appJwt()}`,
      "User-Agent": "GDMacros-Publisher",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GitHubError(
      classify(res.status),
      "GitHub refused to issue an installation token",
      res.status,
    );
  }

  const body = (await res.json()) as {
    token?: string;
    expires_at?: string;
    permissions?: Record<string, string>;
    repository_selection?: string;
  };
  if (!body?.token) throw new GitHubError("auth", "No installation token returned");

  cached = {
    token: body.token,
    expiresAt: body.expires_at ? Date.parse(body.expires_at) : now + 3_000_000,
    // Recorded because it is the authoritative statement of what this
    // credential can do. GitHub does not populate the `permissions` object on
    // a repository response for an installation token, so this is the only
    // place the real answer is available.
    permissions: body.permissions ?? {},
    repositorySelection: body.repository_selection ?? null,
  };
  return cached.token;
}

/** Test seam: drop any cached credential. Used between mocked test cases. */
export function __resetTokenCache() {
  cached = null;
  resolvedInstallationId = null;
}

/**
 * Facts ABOUT the cached credential, never the credential.
 *
 * Returns whether one is held and when it expires, so an operator or a
 * read-only capability check can confirm that tokens really are short lived
 * without anything ever handling the token itself. An expiry timestamp is not a
 * secret; the token is, and it does not leave this module.
 */
export function tokenDiagnostics(): {
  hasToken: boolean;
  expiresAt: string | null;
  ttlSeconds: number | null;
  permissions: Record<string, string>;
  repositorySelection: string | null;
} {
  if (!cached) {
    return {
      hasToken: false,
      expiresAt: null,
      ttlSeconds: null,
      permissions: {},
      repositorySelection: null,
    };
  }
  return {
    hasToken: true,
    expiresAt: new Date(cached.expiresAt).toISOString(),
    ttlSeconds: Math.round((cached.expiresAt - Date.now()) / 1000),
    permissions: cached.permissions,
    repositorySelection: cached.repositorySelection,
  };
}

/* ------------------------------------------------------------------ */
/* The wrapper                                                         */
/* ------------------------------------------------------------------ */

export interface GhRequest {
  method?: string;
  /** Absolute URL. Callers build these from the constants in config.ts. */
  url: string;
  body?: unknown;
  /** Raw bytes, for a release asset upload. */
  raw?: Uint8Array;
  contentType?: string;
  /** 404 is an answer, not an error, for "does this release exist". */
  allow404?: boolean;
  timeoutMs?: number;
}

export interface GhResponse<T> {
  status: number;
  data: T;
}

/**
 * One request, with the headers GitHub currently expects and no retries.
 *
 * Retry policy lives in the callers, because "safe to retry" depends entirely
 * on what the call does: re-reading a release is free, re-uploading an asset is
 * not. A blanket retry here would be the wrong default for exactly the calls
 * that matter most.
 */
export async function ghFetch<T = unknown>({
  method = "GET",
  url,
  body,
  raw,
  contentType,
  allow404 = false,
  timeoutMs = 30_000,
}: GhRequest): Promise<GhResponse<T>> {
  if (!isPublisherConfigured) {
    throw new GitHubError("unconfigured", "Publisher is not configured");
  }

  const token = await installationToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Accept: ACCEPT_JSON,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `Bearer ${token}`,
        "User-Agent": "GDMacros-Publisher",
        ...(raw
          ? { "Content-Type": contentType ?? "application/octet-stream" }
          : body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body: raw ? Buffer.from(raw) : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new GitHubError("timeout", "GitHub did not respond in time");
    }
    throw new GitHubError("network", "Could not reach GitHub");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404 && allow404) {
    return { status: 404, data: null as T };
  }

  if (!res.ok) {
    // A short message from GitHub helps an admin; the request that produced it
    // carried a token, so nothing about the request is ever included.
    let detail = "";
    try {
      const j = (await res.json()) as { message?: string; errors?: { message?: string }[] };
      detail = j?.message ?? "";
      const first = j?.errors?.[0]?.message;
      if (first) detail = detail ? `${detail}: ${first}` : first;
    } catch {
      /* a non-JSON error body tells us nothing useful */
    }
    const retryAfterHeader = res.headers.get("retry-after");
    const reset = res.headers.get("x-ratelimit-remaining") === "0";
    throw new GitHubError(
      reset && res.status === 403 ? "rate-limited" : classify(res.status),
      detail || `GitHub returned ${res.status}`,
      res.status,
      retryAfterHeader ? Number(retryAfterHeader) : undefined,
    );
  }

  if (res.status === 204) return { status: 204, data: null as T };

  const text = await res.text();
  if (!text) return { status: res.status, data: null as T };
  return { status: res.status, data: JSON.parse(text) as T };
}
