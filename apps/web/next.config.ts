import type { NextConfig } from 'next';

import {
  PAGE_DOCUMENT_CONTENT_SECURITY_POLICY,
  PAGE_DOCUMENT_REFERRER_POLICY,
  PAGE_DOCUMENT_SECURITY_HEADER_SOURCE,
} from './src/app/page-document-security-headers';

const nextConfig: NextConfig = {
  agentRules: false,
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
