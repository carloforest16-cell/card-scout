const stubUrl = new URL("./server-only-stub.js", import.meta.url).href;
const projectRoot = new URL("../", import.meta.url);

/**
 * @param {string} specifier
 * @param {import("node:module").ResolveHookContext} context
 * @param {import("node:module").ResolveHook} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: stubUrl, shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    let rel = specifier.slice(2);
    if (!/\.(js|mjs|json)$/.test(rel)) rel += ".js";
    return nextResolve(new URL(rel, projectRoot).href, context);
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.(js|mjs|json|node)$/.test(specifier)
  ) {
    return nextResolve(`${specifier}.js`, context);
  }

  return nextResolve(specifier, context);
}
