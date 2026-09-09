import assert from 'node:assert/strict';
import test from 'node:test';

import { createLanProcessConfig } from './dev-lan.mjs';

test('LAN runner process config passes exact LAN env without API bind override', () => {
  const config = createLanProcessConfig('192.168.1.42', {
    EXISTING_ENV: 'preserved',
  });

  assert.equal(config.webOrigin, 'http://192.168.1.42:3000');
  assert.equal(config.apiOrigin, 'http://192.168.1.42:3001');

  const api = config.processes.find((processConfig) => processConfig.label === 'API');
  const web = config.processes.find((processConfig) => processConfig.label === 'Web');

  assert.deepEqual(api.args, ['--filter', '@lite-notion/api', 'dev']);
  assert.equal(api.env.PORT, '3001');
  assert.equal(api.env.CORS_ORIGIN, 'http://192.168.1.42:3000');
  assert.equal(api.env.API_BIND_HOST, undefined);
  assert.equal(api.env.EXISTING_ENV, 'preserved');

  assert.deepEqual(web.args, ['--filter', '@lite-notion/web', 'dev:lan']);
  assert.equal(web.env.LAN_HOST, '192.168.1.42');
  assert.equal(web.env.NEXT_PUBLIC_API_BASE_URL, 'http://192.168.1.42:3001');
  assert.equal(web.env.NEXT_PUBLIC_API_MOCKING, 'disabled');
  assert.equal(web.env.EXISTING_ENV, 'preserved');
});
