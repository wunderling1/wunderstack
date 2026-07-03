/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship raw TypeScript; let Next transpile them.
  transpilePackages: ["@wunderstack/shared"],
};

export default nextConfig;
