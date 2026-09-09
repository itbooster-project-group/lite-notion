import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findPrivateLanIpv4,
  isClientUsableUnicastIpv4Address,
  isPrivateIpv4Address,
  LAN_HOST_HINT,
  resolveLanHost,
} from './lan-host.mjs';

test('private IPv4 auto detection selects the first non-internal RFC1918 address', () => {
  assert.equal(
    findPrivateLanIpv4({
      en0: [
        { address: '8.8.8.8', family: 'IPv4', internal: false },
        { address: '192.168.1.42', family: 'IPv4', internal: false },
      ],
      utun0: [{ address: '10.0.0.25', family: 'IPv4', internal: false }],
    }),
    '192.168.1.42',
  );
});

test('loopback addresses are ignored for auto detection', () => {
  assert.equal(
    findPrivateLanIpv4({
      lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      en0: [{ address: '192.168.1.15', family: 'IPv4', internal: false }],
    }),
    '192.168.1.15',
  );
});

test('IPv6 addresses are ignored for auto detection', () => {
  assert.equal(
    findPrivateLanIpv4({
      en0: [
        { address: 'fd00::1', family: 'IPv6', internal: false },
        { address: '10.1.2.3', family: 'IPv4', internal: false },
      ],
    }),
    '10.1.2.3',
  );
});

test('internal interfaces are ignored for auto detection', () => {
  assert.equal(
    findPrivateLanIpv4({
      lo0: [{ address: '192.168.1.10', family: 'IPv4', internal: true }],
      en0: [{ address: '172.20.10.2', family: 'IPv4', internal: false }],
    }),
    '172.20.10.2',
  );
});

test('LAN_HOST override wins over detected interfaces', () => {
  assert.equal(
    resolveLanHost({
      interfaces: {
        en0: [{ address: '192.168.1.42', family: 'IPv4', internal: false }],
      },
      lanHost: '100.64.0.10',
    }),
    '100.64.0.10',
  );
});

test('LAN_HOST accepts RFC1918 and non-RFC1918 client-usable unicast IPv4 addresses', () => {
  for (const address of ['192.168.1.42', '10.0.0.25', '172.20.10.2', '100.64.0.10']) {
    assert.equal(isClientUsableUnicastIpv4Address(address), true);
    assert.equal(resolveLanHost({ interfaces: {}, lanHost: address }), address);
  }
});

test('LAN_HOST rejects addresses that cannot be used as client URL hosts', () => {
  for (const address of ['0.0.0.0', '127.0.0.1', '224.0.0.1', '240.0.0.1', '255.255.255.255']) {
    assert.equal(isClientUsableUnicastIpv4Address(address), false);
    assert.throws(
      () => resolveLanHost({ interfaces: {}, lanHost: address }),
      new RegExp(`LAN_HOST must be a client-usable unicast IPv4 address\\. ${LAN_HOST_HINT}`),
    );
  }
});

test('private IPv4 ranges are classified for auto detection', () => {
  for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.0.1']) {
    assert.equal(isPrivateIpv4Address(address), true);
  }

  for (const address of ['172.32.0.1', '100.64.0.10', '8.8.8.8']) {
    assert.equal(isPrivateIpv4Address(address), false);
  }
});

test('clear error is thrown when no suitable auto-detected IP exists', () => {
  assert.throws(
    () =>
      resolveLanHost({
        interfaces: {
          lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
          en0: [{ address: '2001:db8::1', family: 'IPv6', internal: false }],
        },
      }),
    new RegExp(`Could not detect a private LAN IPv4 address\\. ${LAN_HOST_HINT}`),
  );
});
