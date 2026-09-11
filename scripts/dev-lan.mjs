#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { resolveLanHost } from './lan-host.mjs';

export const API_PORT = '3001';
export const WEB_PORT = '3000';
export const COLLABORATION_PORT = '3002';

const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export function createLanProcessConfig(lanHost, baseEnv = process.env) {
  const webOrigin = `http://${lanHost}:${WEB_PORT}`;
  const apiOrigin = `http://${lanHost}:${API_PORT}`;
  const collaborationUrl = `ws://${lanHost}:${COLLABORATION_PORT}`;

  return {
    apiOrigin,
    processes: [
      {
        args: ['--filter', '@lite-notion/collaboration', 'dev'],
        env: {
          ...baseEnv,
          COLLABORATION_ALLOWED_ORIGIN: webOrigin,
          PORT: COLLABORATION_PORT,
        },
        label: 'Collaboration',
      },
      {
        args: ['--filter', '@lite-notion/api', 'dev'],
        env: {
          ...baseEnv,
          CORS_ORIGIN: webOrigin,
          PORT: API_PORT,
        },
        label: 'API',
      },
      {
        args: ['--filter', '@lite-notion/web', 'dev:lan'],
        env: {
          ...baseEnv,
          LAN_HOST: lanHost,
          NEXT_PUBLIC_API_BASE_URL: apiOrigin,
          NEXT_PUBLIC_API_MOCKING: 'disabled',
          NEXT_PUBLIC_COLLABORATION_URL: collaborationUrl,
        },
        label: 'Web',
      },
    ],
    webOrigin,
  };
}

function runDbUp() {
  const result = spawnSync(PNPM_COMMAND, ['db:up'], {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function stopChild(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }

    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
      throw error;
    }
  }
}

function createRunner() {
  let isShuttingDown = false;
  const children = new Set();

  function shutdown(exitCode, signal = 'SIGTERM') {
    if (!isShuttingDown) {
      isShuttingDown = true;
      process.exitCode = exitCode;

      for (const child of children) {
        stopChild(child, signal);
      }
    }

    if (children.size === 0) {
      process.exit(process.exitCode ?? exitCode);
    }
  }

  function startProcess({ args, env, label }) {
    const child = spawn(PNPM_COMMAND, args, {
      detached: process.platform !== 'win32',
      env,
      stdio: 'inherit',
    });

    children.add(child);

    child.on('error', (error) => {
      console.error(`${label} failed to start: ${error.message}`);
      shutdown(1);
    });

    child.on('exit', (code, signal) => {
      children.delete(child);

      if (!isShuttingDown) {
        const exitCode = code ?? 1;
        console.error(`${label} exited unexpectedly.`);
        shutdown(exitCode);
        return;
      }

      if (children.size === 0) {
        process.exit(process.exitCode ?? (signal === null ? (code ?? 0) : 0));
      }
    });
  }

  return { shutdown, startProcess };
}

export function runDevLan() {
  let lanHost;

  try {
    lanHost = resolveLanHost({
      interfaces: networkInterfaces(),
      lanHost: process.env.LAN_HOST,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Failed to resolve LAN host.');
    process.exit(1);
  }

  runDbUp();

  const config = createLanProcessConfig(lanHost);

  console.log(`Web: ${config.webOrigin}`);
  console.log(`API: ${config.apiOrigin}`);

  const runner = createRunner();

  process.on('SIGINT', () => {
    runner.shutdown(0, 'SIGINT');
  });
  process.on('SIGTERM', () => {
    runner.shutdown(0, 'SIGTERM');
  });

  for (const processConfig of config.processes) {
    runner.startProcess(processConfig);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDevLan();
}
