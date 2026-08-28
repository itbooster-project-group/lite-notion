import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
};

export default nextConfig;
