import path from "node:path";

export const PLUGIN_STUDIO_PACKAGE_NAME = "bb-plugin-studio";
export const PLUGIN_STUDIO_PACKAGE_VERSION = "0.1.0-alpha.3";

export function createPluginStudioRegistryDocument(args: {
  baseUrl: string;
  integrity: string;
  shasum: string;
}): Record<string, unknown> {
  const tarball = `${args.baseUrl}/${PLUGIN_STUDIO_PACKAGE_NAME}/-/${PLUGIN_STUDIO_PACKAGE_NAME}-${PLUGIN_STUDIO_PACKAGE_VERSION}.tgz`;
  return {
    name: PLUGIN_STUDIO_PACKAGE_NAME,
    "dist-tags": { latest: PLUGIN_STUDIO_PACKAGE_VERSION },
    versions: {
      [PLUGIN_STUDIO_PACKAGE_VERSION]: {
        name: PLUGIN_STUDIO_PACKAGE_NAME,
        version: PLUGIN_STUDIO_PACKAGE_VERSION,
        license: "MIT",
        engines: { bb: ">=0.43.1", bbPluginSdk: "^0.4.87" },
        dist: { integrity: args.integrity, shasum: args.shasum, tarball },
      },
    },
  };
}

export function startPluginStudioPackageRegistry(args: {
  artifactPath: string;
  integrity: string;
  shasum: string;
}): { baseUrl: string; stop(): void } {
  let baseUrl = "";
  const tarballPath = `/${PLUGIN_STUDIO_PACKAGE_NAME}/-/${PLUGIN_STUDIO_PACKAGE_NAME}-${PLUGIN_STUDIO_PACKAGE_VERSION}.tgz`;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (
        request.method === "GET" &&
        pathname === `/${PLUGIN_STUDIO_PACKAGE_NAME}`
      ) {
        return Response.json(
          createPluginStudioRegistryDocument({
            baseUrl,
            integrity: args.integrity,
            shasum: args.shasum,
          }),
        );
      }
      if (request.method === "GET" && pathname === tarballPath) {
        return new Response(Bun.file(path.resolve(args.artifactPath)), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
  return { baseUrl, stop: () => server.stop(true) };
}
