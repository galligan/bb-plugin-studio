import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { surfaceCatalog } from "../apps/workbench/src/surface-catalog.ts";
import { runCapturedCommand } from "../packages/inspection/src/captured-command.ts";
import { nativeCommandEnv } from "../packages/inspection/src/native-env.ts";
const repositoryRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
const targetPath = path.join(repositoryRoot, "compatibility/bb-target.json");

interface DependencyTarget {
  id: string;
  package: string;
  localRange: string;
  upstreamRange: string;
}

interface TokenTarget {
  name: string;
  localValue: string;
  upstreamValue?: string;
  source: string;
}

export interface CompatibilityTarget {
  schemaVersion: 2;
  acceptedDecision?: string | null;
  target: {
    minimumBbVersion: string;
    verifiedThroughBbVersion: string;
    pluginSdkVersion: string;
    pluginSdkEngineRange: string;
    upstreamRef: string;
  };
  publicArtifacts: {
    appPackageUrl: string;
    pluginSdkPackageUrl: string;
    themeCssUrl: string;
    themeCssSha256: string;
    declarations: Record<"backend" | "app", { url: string; sha256: string }>;
    registry: { url: string; sha256: string; items: string[] };
  };
  dependencies: DependencyTarget[];
  measuredTokens: TokenTarget[];
  registrationPaths: string[];
}

interface DependencyObservation {
  local?: string;
  upstream?: string;
  localError?: string;
  upstreamError?: string;
}

interface TokenObservation {
  local?: string;
  upstream?: string;
  localError?: string;
  upstreamError?: string;
}

export interface CompatibilityObservations {
  bbVersion?: string;
  bbError?: string;
  pluginSdkEngineRange?: string;
  pluginSdkVersion?: string;
  pluginSdkError?: string;
  registrySha256?: string;
  registryItems?: string[];
  registryError?: string;
  themeCssSha256?: string;
  themeCssError?: string;
  declarationSha256: Partial<Record<"backend" | "app", string>>;
  declarationErrors?: Partial<Record<"backend" | "app", string>>;
  dependencies: Record<string, DependencyObservation>;
  tokens: Record<string, TokenObservation>;
  registrationPaths: string[];
}

export type CompatibilityStatus = "pass" | "fail" | "unverified" | "notice";

export interface CompatibilityCheck {
  id: string;
  status: CompatibilityStatus;
  target: unknown;
  observed: unknown;
  nextAction?: string;
}

export interface CompatibilityReport {
  schemaVersion: 1;
  upstreamRef: string;
  outcome: "pass" | "fail" | "accepted-drift";
  decision?: string;
  checks: CompatibilityCheck[];
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

function exactCheck(
  id: string,
  target: unknown,
  observed: unknown,
  nextAction: string,
  error?: string,
): CompatibilityCheck {
  if (error || observed === undefined) {
    return {
      id,
      status: "unverified",
      target,
      observed: error ?? "No observation was produced.",
      nextAction,
    };
  }
  return serialized(target) === serialized(observed)
    ? { id, status: "pass", target, observed }
    : { id, status: "fail", target, observed, nextAction };
}

function semanticVersion(version: string): [number, number, number, string?] {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(
      version,
    );
  if (!match) throw new Error(`Expected a semantic version, got ${version}.`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]];
}

function compareVersions(left: string, right: string): number {
  const leftParts = semanticVersion(left);
  const rightParts = semanticVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = Number(leftParts[index]) - Number(rightParts[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  if (leftParts[3] === rightParts[3]) return 0;
  if (leftParts[3] === undefined) return 1;
  if (rightParts[3] === undefined) return -1;
  return leftParts[3].localeCompare(rightParts[3]);
}

function engineRangeTargetsSdkVersion(range: string, version: string): boolean {
  return range === `^${version}` || range === `>=${version}`;
}

function bbVersionCheck(
  target: CompatibilityTarget["target"],
  observed?: string,
  error?: string,
): CompatibilityCheck {
  const supported = {
    minimum: target.minimumBbVersion,
    verifiedThrough: target.verifiedThroughBbVersion,
  };
  if (error || observed === undefined) {
    return {
      id: "bb.version",
      status: "unverified",
      target: supported,
      observed: error ?? "No observation was produced.",
      nextAction: "Install a supported bb release and rerun the probe.",
    };
  }
  if (compareVersions(observed, target.minimumBbVersion) < 0) {
    return {
      id: "bb.version",
      status: "fail",
      target: supported,
      observed,
      nextAction: `Upgrade bb to ${target.minimumBbVersion} or newer.`,
    };
  }
  if (compareVersions(observed, target.verifiedThroughBbVersion) > 0) {
    return {
      id: "bb.version",
      status: "notice",
      target: supported,
      observed,
      nextAction:
        "Run the latest-release compatibility audit; this installed version is newer than the verified-through boundary.",
    };
  }
  return { id: "bb.version", status: "pass", target: supported, observed };
}

export function evaluateCompatibility(
  target: CompatibilityTarget,
  observed: CompatibilityObservations,
): CompatibilityReport {
  const checks: CompatibilityCheck[] = [
    exactCheck(
      "target.release-coherence",
      [],
      targetCoherenceIssues(target),
      "Make upstreamRef, verifiedThroughBbVersion, SDK range, and every public artifact URL identify one release.",
    ),
    bbVersionCheck(target.target, observed.bbVersion, observed.bbError),
    exactCheck(
      "plugin-sdk.engine-range",
      target.target.pluginSdkEngineRange,
      observed.pluginSdkEngineRange,
      "Align the example plugin engines.bbPluginSdk range or review and update the target.",
    ),
    exactCheck(
      "plugin-sdk.public-version",
      target.target.pluginSdkVersion,
      observed.pluginSdkVersion,
      "Inspect the public SDK release contract and update the target after compatibility review.",
      observed.pluginSdkError,
    ),
    exactCheck(
      "component-registry.sha256",
      target.publicArtifacts.registry.sha256,
      observed.registrySha256,
      "Review the public registry diff, then update its digest and item list together.",
      observed.registryError,
    ),
    exactCheck(
      "component-registry.items",
      target.publicArtifacts.registry.items,
      observed.registryItems,
      "Review added or removed public components before updating the recorded item list.",
      observed.registryError,
    ),
    exactCheck(
      "theme.sha256",
      target.publicArtifacts.themeCssSha256,
      observed.themeCssSha256,
      "Review the complete public theme diff before updating the verified-through target.",
      observed.themeCssError,
    ),
    ...(["backend", "app"] as const).map((name) =>
      exactCheck(
        `plugin-sdk.declaration.${name}.sha256`,
        target.publicArtifacts.declarations[name].sha256,
        observed.declarationSha256[name],
        `Review the ${name} SDK declaration diff even if the SDK package version is unchanged.`,
        observed.declarationErrors?.[name],
      ),
    ),
  ];

  for (const dependency of target.dependencies) {
    const value = observed.dependencies[dependency.id];
    checks.push(
      exactCheck(
        `dependency.${dependency.id}.local`,
        dependency.localRange,
        value?.local,
        `Review ${dependency.package} in the workbench and update the compatibility target.`,
        value?.localError,
      ),
      exactCheck(
        `dependency.${dependency.id}.upstream`,
        dependency.upstreamRange,
        value?.upstream,
        `Review upstream ${dependency.package} changes before updating the target.`,
        value?.upstreamError,
      ),
    );
  }

  for (const token of target.measuredTokens) {
    const value = observed.tokens[token.name];
    checks.push(
      exactCheck(
        `token.${token.name}.local`,
        token.localValue,
        value?.local,
        `Remeasure ${token.name} in live bb and record the manual comparison before updating the target.`,
        value?.localError,
      ),
    );
    if (token.upstreamValue !== undefined) {
      checks.push(
        exactCheck(
          `token.${token.name}.upstream`,
          token.upstreamValue,
          value?.upstream,
          `Review the public theme change for ${token.name}, remeasure live bb, then update the target.`,
          value?.upstreamError,
        ),
      );
    }
  }

  checks.push(
    exactCheck(
      "plugin-registration.paths",
      target.registrationPaths,
      observed.registrationPaths,
      "Reconcile the public surface catalog and declaration coverage, then update the target.",
    ),
  );

  return {
    schemaVersion: 1,
    upstreamRef: target.target.upstreamRef,
    outcome: checks.every(
      ({ status }) => status === "pass" || status === "notice",
    )
      ? "pass"
      : "fail",
    checks,
  };
}

function targetCoherenceIssues(target: CompatibilityTarget): string[] {
  const issues: string[] = [];
  const expectedRef = `desktop-v${target.target.verifiedThroughBbVersion}`;
  if (target.target.upstreamRef !== expectedRef) {
    issues.push(`upstreamRef must be ${expectedRef}`);
  }
  if (
    !engineRangeTargetsSdkVersion(
      target.target.pluginSdkEngineRange,
      target.target.pluginSdkVersion,
    )
  ) {
    issues.push("plugin SDK engine range must target the recorded SDK version");
  }
  if (
    compareVersions(
      target.target.minimumBbVersion,
      target.target.verifiedThroughBbVersion,
    ) > 0
  ) {
    issues.push("minimum bb version cannot exceed verified-through bb version");
  }
  const gitUrls = [
    target.publicArtifacts.appPackageUrl,
    target.publicArtifacts.pluginSdkPackageUrl,
    target.publicArtifacts.themeCssUrl,
    target.publicArtifacts.registry.url,
  ];
  if (gitUrls.some((url) => !url.includes(`/${target.target.upstreamRef}/`))) {
    issues.push(
      "git public artifact URLs must contain upstreamRef as their release path",
    );
  }
  const sdkMarker = `@get-bb/plugin-sdk@${target.target.pluginSdkVersion}/`;
  const declarationUrls = [
    target.publicArtifacts.declarations.backend.url,
    target.publicArtifacts.declarations.app.url,
  ];
  if (
    declarationUrls.some(
      (url) =>
        !url.includes(`/${target.target.upstreamRef}/`) &&
        !url.includes(sdkMarker),
    )
  ) {
    issues.push(
      "declaration URLs must identify the git tag or the recorded SDK version",
    );
  }
  return issues;
}

function packageRange(
  packageJson: Record<string, unknown>,
  packageName: string,
): string | undefined {
  for (const section of ["dependencies", "devDependencies"] as const) {
    const values = packageJson[section];
    if (values && typeof values === "object" && !Array.isArray(values)) {
      const value = (values as Record<string, unknown>)[packageName];
      if (typeof value === "string") return value;
    }
  }
  return undefined;
}

function cssVariable(css: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*:\\s*([^;]+);`).exec(css)?.[1]?.trim();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "bb-plugin-studio-compatibility-check" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseBbVersion(output: string): string | undefined {
  return /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/.exec(output)?.[1];
}

function executableIsMissing(stderr: string): boolean {
  return (
    /\bENOENT\b/.test(stderr) || /Executable not found in \$PATH/i.test(stderr)
  );
}

export async function observeBbVersion(
  explicit = process.env.BB_CLI?.trim(),
  run = runCapturedCommand,
): Promise<string> {
  const candidates = explicit
    ? [explicit]
    : ["bb", path.join(repositoryRoot, "plugins/studio/node_modules/.bin/bb")];
  let missingError: string | undefined;
  for (const candidate of candidates) {
    const result = await run(candidate, ["--version"], repositoryRoot, {
      timeoutMs: 10_000,
      env: nativeCommandEnv(process.env),
    });
    if (result.exitCode === 0) {
      const version = parseBbVersion(`${result.stdout}\n${result.stderr}`);
      if (!version) {
        throw new Error(`${candidate} --version returned no semantic version.`);
      }
      return version;
    }
    const detail = [result.stderr.trim(), result.stdout.trim()]
      .filter(Boolean)
      .join("\n");
    const failure = `${candidate} --version exited ${result.exitCode}${
      detail ? `: ${detail}` : ""
    }`;
    if (!explicit && executableIsMissing(result.stderr)) {
      missingError = failure;
      continue;
    }
    throw new Error(failure);
  }
  throw new Error(missingError ?? "No bb executable is available.");
}

export async function collectCompatibilityObservations(
  target: CompatibilityTarget,
): Promise<CompatibilityObservations> {
  const observed: CompatibilityObservations = {
    dependencies: {},
    tokens: {},
    declarationSha256: {},
    registrationPaths: surfaceCatalog.map(
      ({ registrationPath }) => registrationPath,
    ),
  };

  try {
    observed.bbVersion = await observeBbVersion();
  } catch (error) {
    observed.bbError = `bb --version failed: ${message(error)}`;
  }

  const [pluginPackageText, workbenchPackageText, localCss] = await Promise.all(
    [
      readFile(
        path.join(repositoryRoot, "plugins/studio/package.json"),
        "utf8",
      ),
      readFile(
        path.join(repositoryRoot, "apps/workbench/package.json"),
        "utf8",
      ),
      readFile(
        path.join(repositoryRoot, "apps/workbench/src/styles.css"),
        "utf8",
      ),
    ],
  );
  const pluginPackage = JSON.parse(pluginPackageText) as Record<
    string,
    unknown
  >;
  const engines = pluginPackage.engines;
  if (engines && typeof engines === "object" && !Array.isArray(engines)) {
    const range = (engines as Record<string, unknown>).bbPluginSdk;
    if (typeof range === "string") observed.pluginSdkEngineRange = range;
  }
  const workbenchPackage = JSON.parse(workbenchPackageText) as Record<
    string,
    unknown
  >;

  let upstreamPackage: Record<string, unknown> | undefined;
  try {
    upstreamPackage = JSON.parse(
      await fetchText(target.publicArtifacts.appPackageUrl),
    ) as Record<string, unknown>;
  } catch (error) {
    const detail = `Could not read public app package: ${message(error)}`;
    for (const dependency of target.dependencies)
      observed.dependencies[dependency.id] = { upstreamError: detail };
  }
  for (const dependency of target.dependencies) {
    const current = observed.dependencies[dependency.id] ?? {};
    observed.dependencies[dependency.id] = {
      ...current,
      local: packageRange(workbenchPackage, dependency.package),
      upstream: upstreamPackage
        ? packageRange(upstreamPackage, dependency.package)
        : undefined,
    };
  }

  try {
    const sdkPackage = JSON.parse(
      await fetchText(target.publicArtifacts.pluginSdkPackageUrl),
    ) as Record<string, unknown>;
    if (typeof sdkPackage.version === "string")
      observed.pluginSdkVersion = sdkPackage.version;
    else observed.pluginSdkError = "Public SDK package has no version.";
  } catch (error) {
    observed.pluginSdkError = `Could not read public SDK package: ${message(error)}`;
  }

  try {
    const registryText = await fetchText(target.publicArtifacts.registry.url);
    const registry = JSON.parse(registryText) as {
      items?: Array<{ name?: unknown }>;
    };
    observed.registrySha256 = createHash("sha256")
      .update(registryText)
      .digest("hex");
    observed.registryItems = registry.items?.flatMap(({ name }) =>
      typeof name === "string" ? [name] : [],
    );
    if (!observed.registryItems)
      observed.registryError = "Registry has no items array.";
  } catch (error) {
    observed.registryError = `Could not read public registry: ${message(error)}`;
  }

  let upstreamCss: string | undefined;
  try {
    upstreamCss = await fetchText(target.publicArtifacts.themeCssUrl);
    observed.themeCssSha256 = createHash("sha256")
      .update(upstreamCss)
      .digest("hex");
  } catch (error) {
    const detail = `Could not read public theme CSS: ${message(error)}`;
    observed.themeCssError = detail;
    for (const token of target.measuredTokens) {
      if (token.upstreamValue !== undefined)
        observed.tokens[token.name] = { upstreamError: detail };
    }
  }
  await Promise.all(
    (["backend", "app"] as const).map(async (name) => {
      try {
        const declarations = await fetchText(
          target.publicArtifacts.declarations[name].url,
        );
        observed.declarationSha256[name] = createHash("sha256")
          .update(declarations)
          .digest("hex");
      } catch (error) {
        observed.declarationErrors ??= {};
        observed.declarationErrors[name] =
          `Could not read public ${name} declarations: ${message(error)}`;
      }
    }),
  );
  for (const token of target.measuredTokens) {
    const current = observed.tokens[token.name] ?? {};
    observed.tokens[token.name] = {
      ...current,
      local: cssVariable(localCss, token.name),
      upstream: upstreamCss ? cssVariable(upstreamCss, token.name) : undefined,
    };
  }
  return observed;
}

export function validCompatibilityDecision(
  text: string,
  now = new Date(),
): boolean {
  const status = /^Status:\s*accepted\s*$/im.test(text);
  const owner = /^Owner:\s*\S.+$/im.test(text);
  const reason = /^Reason:\s*\S.+$/im.test(text);
  const expiry = /^Expires:\s*(\d{4}-\d{2}-\d{2})\s*$/im.exec(text)?.[1];
  const expiryDate = expiry ? new Date(`${expiry}T00:00:00Z`) : undefined;
  const validDate = Boolean(
    expiry &&
    expiryDate &&
    !Number.isNaN(expiryDate.valueOf()) &&
    expiryDate.toISOString().slice(0, 10) === expiry,
  );
  const maximumExpiry = new Date(now);
  maximumExpiry.setUTCDate(maximumExpiry.getUTCDate() + 90);
  return Boolean(
    status &&
    owner &&
    reason &&
    validDate &&
    expiryDate &&
    expiryDate >= new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`) &&
    expiryDate <= maximumExpiry,
  );
}

export function resolveCompatibilityDecisionPath(
  target: CompatibilityTarget,
  decisionArgument: string,
): string {
  const normalized = decisionArgument.replaceAll("\\", "/");
  if (target.acceptedDecision !== normalized) {
    throw new Error(
      "The decision path must be recorded as acceptedDecision in compatibility/bb-target.json.",
    );
  }
  if (!/^compatibility\/decisions\/[A-Za-z0-9._-]+\.md$/.test(normalized)) {
    throw new Error(
      "Compatibility decisions must be Markdown files under compatibility/decisions/.",
    );
  }
  return path.join(repositoryRoot, ...normalized.split("/"));
}

export function formatCompatibilityReport(report: CompatibilityReport): string {
  const lines = [
    `bb Plugin Studio compatibility: ${report.outcome}`,
    `Target: ${report.upstreamRef}`,
  ];
  for (const check of report.checks) {
    lines.push(
      `${check.status === "pass" ? "✓" : check.status === "notice" ? "!" : "✗"} ${check.id}: ${check.status}`,
    );
    if (check.status !== "pass") {
      lines.push(`  targeted: ${serialized(check.target)}`);
      lines.push(`  observed: ${serialized(check.observed)}`);
      if (check.nextAction) lines.push(`  next: ${check.nextAction}`);
    }
  }
  if (report.decision) lines.push(`Decision: ${report.decision}`);
  return `${lines.join("\n")}\n`;
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function sha256(value: unknown, name: string): string {
  const text = string(value, name);
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${name} must be a lowercase SHA-256 digest.`);
  }
  return text;
}

function stringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array.`);
  }
  const values = value.map((entry, index) =>
    string(entry, `${name}[${index}]`),
  );
  if (new Set(values).size !== values.length)
    throw new Error(`${name} must be unique.`);
  return values;
}

function publicArtifactUrl(
  value: unknown,
  ref: string,
  suffix: string,
  name: string,
): string {
  const text = string(value, name);
  const url = new URL(text);
  const expectedPath = `/get-bb/bb/${ref}/${suffix}`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "raw.githubusercontent.com" ||
    url.pathname !== expectedPath ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must be the immutable public ${expectedPath} artifact.`,
    );
  }
  return text;
}

function publicDeclarationUrl(
  value: unknown,
  ref: string,
  sdkVersion: string,
  name: "backend" | "app",
  fieldName: string,
): string {
  const text = string(value, fieldName);
  const url = new URL(text);
  const bundledFile =
    name === "app" ? "bb-plugin-sdk-app.d.ts" : "bb-plugin-sdk.d.ts";
  const sourceFile = name === "app" ? "app-contract.ts" : "backend-contract.ts";
  const gitBundled = `/get-bb/bb/${ref}/packages/plugin-sdk/bundled-types/${bundledFile}`;
  const gitSource = `/get-bb/bb/${ref}/packages/plugin-sdk/src/${sourceFile}`;
  const unpkgBundled = `/@get-bb/plugin-sdk@${sdkVersion}/bundled-types/${bundledFile}`;
  const gitOk =
    url.protocol === "https:" &&
    url.hostname === "raw.githubusercontent.com" &&
    (url.pathname === gitBundled || url.pathname === gitSource) &&
    !url.search &&
    !url.hash;
  const unpkgOk =
    url.protocol === "https:" &&
    url.hostname === "unpkg.com" &&
    url.pathname === unpkgBundled &&
    !url.search &&
    !url.hash;
  if (!gitOk && !unpkgOk) {
    throw new Error(
      `${fieldName} must be the immutable public ${gitBundled}, ${gitSource}, or ${unpkgBundled} artifact.`,
    );
  }
  return text;
}

export function parseCompatibilityTarget(value: unknown): CompatibilityTarget {
  const root = record(value, "compatibility target");
  if (root.schemaVersion !== 2) throw new Error("schemaVersion must be 2.");
  const target = record(root.target, "target");
  const minimumBbVersion = string(
    target.minimumBbVersion,
    "target.minimumBbVersion",
  );
  const verifiedThroughBbVersion = string(
    target.verifiedThroughBbVersion,
    "target.verifiedThroughBbVersion",
  );
  semanticVersion(minimumBbVersion);
  semanticVersion(verifiedThroughBbVersion);
  const pluginSdkVersion = string(
    target.pluginSdkVersion,
    "target.pluginSdkVersion",
  );
  const pluginSdkEngineRange = string(
    target.pluginSdkEngineRange,
    "target.pluginSdkEngineRange",
  );
  const upstreamRef = string(target.upstreamRef, "target.upstreamRef");
  const artifacts = record(root.publicArtifacts, "publicArtifacts");
  const registry = record(artifacts.registry, "publicArtifacts.registry");
  const declarations = record(
    artifacts.declarations,
    "publicArtifacts.declarations",
  );
  const dependencies = (
    Array.isArray(root.dependencies) ? root.dependencies : []
  ).map((entry, index) => {
    const item = record(entry, `dependencies[${index}]`);
    return {
      id: string(item.id, `dependencies[${index}].id`),
      package: string(item.package, `dependencies[${index}].package`),
      localRange: string(item.localRange, `dependencies[${index}].localRange`),
      upstreamRange: string(
        item.upstreamRange,
        `dependencies[${index}].upstreamRange`,
      ),
    };
  });
  if (dependencies.length === 0)
    throw new Error("dependencies must be a non-empty array.");
  if (new Set(dependencies.map(({ id }) => id)).size !== dependencies.length) {
    throw new Error("dependency ids must be unique.");
  }
  const measuredTokens = (
    Array.isArray(root.measuredTokens) ? root.measuredTokens : []
  ).map((entry, index) => {
    const item = record(entry, `measuredTokens[${index}]`);
    const upstreamValue = item.upstreamValue;
    return {
      name: string(item.name, `measuredTokens[${index}].name`),
      localValue: string(
        item.localValue,
        `measuredTokens[${index}].localValue`,
      ),
      ...(upstreamValue === undefined
        ? {}
        : {
            upstreamValue: string(
              upstreamValue,
              `measuredTokens[${index}].upstreamValue`,
            ),
          }),
      source: string(item.source, `measuredTokens[${index}].source`),
    };
  });
  if (measuredTokens.length === 0)
    throw new Error("measuredTokens must be a non-empty array.");
  if (
    new Set(measuredTokens.map(({ name }) => name)).size !==
    measuredTokens.length
  ) {
    throw new Error("measured token names must be unique.");
  }
  const acceptedDecision = root.acceptedDecision;
  if (acceptedDecision !== null && typeof acceptedDecision !== "string") {
    throw new Error(
      "acceptedDecision must be null or a repository-relative string.",
    );
  }
  return {
    schemaVersion: 2,
    acceptedDecision,
    target: {
      minimumBbVersion,
      verifiedThroughBbVersion,
      pluginSdkVersion,
      pluginSdkEngineRange,
      upstreamRef,
    },
    publicArtifacts: {
      appPackageUrl: publicArtifactUrl(
        artifacts.appPackageUrl,
        upstreamRef,
        "apps/app/package.json",
        "publicArtifacts.appPackageUrl",
      ),
      pluginSdkPackageUrl: publicArtifactUrl(
        artifacts.pluginSdkPackageUrl,
        upstreamRef,
        "packages/plugin-sdk/package.json",
        "publicArtifacts.pluginSdkPackageUrl",
      ),
      themeCssUrl: publicArtifactUrl(
        artifacts.themeCssUrl,
        upstreamRef,
        "apps/app/src/components/ui/theme.css",
        "publicArtifacts.themeCssUrl",
      ),
      themeCssSha256: sha256(
        artifacts.themeCssSha256,
        "publicArtifacts.themeCssSha256",
      ),
      declarations: Object.fromEntries(
        (["backend", "app"] as const).map((name) => {
          const declaration = record(
            declarations[name],
            `publicArtifacts.declarations.${name}`,
          );
          return [
            name,
            {
              url: publicDeclarationUrl(
                declaration.url,
                upstreamRef,
                pluginSdkVersion,
                name,
                `publicArtifacts.declarations.${name}.url`,
              ),
              sha256: sha256(
                declaration.sha256,
                `publicArtifacts.declarations.${name}.sha256`,
              ),
            },
          ];
        }),
      ) as CompatibilityTarget["publicArtifacts"]["declarations"],
      registry: {
        url: publicArtifactUrl(
          registry.url,
          upstreamRef,
          "packages/plugin-registry/r/index.json",
          "publicArtifacts.registry.url",
        ),
        sha256: sha256(registry.sha256, "publicArtifacts.registry.sha256"),
        items: stringArray(registry.items, "publicArtifacts.registry.items"),
      },
    },
    dependencies,
    measuredTokens,
    registrationPaths: stringArray(root.registrationPaths, "registrationPaths"),
  };
}

export async function loadCompatibilityTarget(): Promise<CompatibilityTarget> {
  return parseCompatibilityTarget(
    JSON.parse(await readFile(targetPath, "utf8")),
  );
}

export function projectCompatibilityTargetToRelease(
  target: CompatibilityTarget,
  version: string,
): CompatibilityTarget {
  semanticVersion(version);
  const from = `/${target.target.upstreamRef}/`;
  const upstreamRef = `desktop-v${version}`;
  const to = `/${upstreamRef}/`;
  const projectUrl = (url: string) => url.replace(from, to);
  return {
    ...target,
    target: {
      ...target.target,
      verifiedThroughBbVersion: version,
      upstreamRef,
    },
    publicArtifacts: {
      ...target.publicArtifacts,
      appPackageUrl: projectUrl(target.publicArtifacts.appPackageUrl),
      pluginSdkPackageUrl: projectUrl(
        target.publicArtifacts.pluginSdkPackageUrl,
      ),
      themeCssUrl: projectUrl(target.publicArtifacts.themeCssUrl),
      declarations: {
        backend: {
          ...target.publicArtifacts.declarations.backend,
          url: projectUrl(target.publicArtifacts.declarations.backend.url),
        },
        app: {
          ...target.publicArtifacts.declarations.app,
          url: projectUrl(target.publicArtifacts.declarations.app.url),
        },
      },
      registry: {
        ...target.publicArtifacts.registry,
        url: projectUrl(target.publicArtifacts.registry.url),
      },
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const candidateIndex = args.indexOf("--candidate-version");
  const candidateVersion =
    candidateIndex >= 0 ? args[candidateIndex + 1] : undefined;
  const decisionIndex = args.indexOf("--decision");
  const decisionPath = decisionIndex >= 0 ? args[decisionIndex + 1] : undefined;
  const unknown = args.filter(
    (arg, index) =>
      arg !== "--json" &&
      arg !== "--decision" &&
      arg !== "--candidate-version" &&
      index !== decisionIndex + 1 &&
      index !== candidateIndex + 1,
  );
  if (
    unknown.length > 0 ||
    (decisionIndex >= 0 && !decisionPath) ||
    (candidateIndex >= 0 && !candidateVersion) ||
    (candidateVersion && decisionPath)
  ) {
    throw new Error(
      "Usage: bun run compatibility:check [--json] [--decision <record.md> | --candidate-version <version>]",
    );
  }

  const committedTarget = await loadCompatibilityTarget();
  const target = candidateVersion
    ? projectCompatibilityTargetToRelease(committedTarget, candidateVersion)
    : committedTarget;
  const observations = await collectCompatibilityObservations(target);
  const report = evaluateCompatibility(target, observations);
  if (report.outcome === "fail" && decisionPath) {
    if (report.checks.some(({ status }) => status === "unverified")) {
      throw new Error(
        "Compatibility decisions cannot waive unverified probes.",
      );
    }
    const resolvedDecision = resolveCompatibilityDecisionPath(
      target,
      decisionPath,
    );
    const decisionStat = await lstat(resolvedDecision);
    if (!decisionStat.isFile() || decisionStat.isSymbolicLink()) {
      throw new Error(
        "Compatibility decision must be a regular, non-symlink file.",
      );
    }
    const decisionText = await readFile(resolvedDecision, "utf8");
    if (!validCompatibilityDecision(decisionText)) {
      throw new Error(
        "Compatibility decision must contain accepted Status, Owner, Reason, and an unexpired Expires date.",
      );
    }
    report.outcome = "accepted-drift";
    report.decision = target.acceptedDecision ?? undefined;
  }

  process.stdout.write(
    json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatCompatibilityReport(report),
  );
  if (report.outcome === "fail") process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${message(error)}\n`);
    process.exitCode = 1;
  });
}
