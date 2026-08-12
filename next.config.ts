import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so the bundler does not walk up into a parent
  // directory looking for a lockfile.
  turbopack: { root: path.resolve(__dirname) },
  // Do not scatter generated tooling files through the repo.
  agentRules: false,
};

export default nextConfig;
