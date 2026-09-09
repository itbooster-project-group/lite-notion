import type { NextConfig } from 'next';

import {
  PAGE_DOCUMENT_CONTENT_SECURITY_POLICY,
  PAGE_DOCUMENT_REFERRER_POLICY,
  PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
} from './src/app/page-document-security-headers';

const lanDevHost = process.env.NODE_ENV === 'development' ? process.env.LAN_HOST : undefined;

const nextConfig: NextConfig = {
  agentRules: false,
  ...(lanDevHost === undefined || lanDevHost === '' ? {} : { allowedDevOrigins: [lanDevHost] }),
  experimental: {
    turbopackPluginRuntimeStrategy: 'workerThreads',
  },
  async headers() {
    return [
      {
        headers: [
          {
            key: 'Content-Security-Policy',
            value: PAGE_DOCUMENT_CONTENT_SECURITY_POLICY,
          },
          {
            key: 'Referrer-Policy',
            value: PAGE_DOCUMENT_REFERRER_POLICY,
          },
        ],
        source: PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
      },
    ];
  },
};

export default nextConfig;
