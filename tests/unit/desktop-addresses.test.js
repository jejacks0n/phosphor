// The addresses a desktop host's room can be reached at, as the host page lists them.
import { test, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { reachableAddresses } from '../../desktop/addresses.js';

afterEach(() => vi.unstubAllEnvs());

const INTERFACES = {
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }, { address: '::1', family: 'IPv6', internal: true }],
  utun4: [{ address: '100.101.1.2', family: 'IPv4', internal: false }],
  en0: [{ address: 'fe80::1c2b', family: 'IPv6', internal: false }, { address: '192.168.1.20', family: 'IPv4', internal: false }],
  en5: [{ address: '100.63.0.9', family: 'IPv4', internal: false }],   // just under Tailscale's range: not Tailscale's
  en7: [{ address: '10.0.0.5', family: 4, internal: false }],
};

test('reachableAddresses lists LAN first, Tailscale last, skips internal and IPv6', () => {
  vi.stubEnv('PHOSPHOR_ADDRESSES', '');
  assert.deepEqual(reachableAddresses(INTERFACES, 31337), ['192.168.1.20:31337', '10.0.0.5:31337', '100.63.0.9:31337', '100.101.1.2:31337']);
  assert.deepEqual(reachableAddresses({}, 31337), []);
});

test('PHOSPHOR_ADDRESSES replaces the list', () => {
  vi.stubEnv('PHOSPHOR_ADDRESSES', ' 127.0.0.1, 10.0.0.2:4000 ,');
  assert.deepEqual(reachableAddresses(INTERFACES, 31401), ['127.0.0.1:31401', '10.0.0.2:4000']);
});

test('reachableAddresses leaves out link-local and lists 192.168, 10, 172.16-31, other addresses, then Tailscale', () => {
  vi.stubEnv('PHOSPHOR_ADDRESSES', '');
  const v4 = (address) => [{ address, family: 'IPv4', internal: false }];
  const interfaces = {
    a: v4('100.101.1.2'), b: v4('203.0.113.7'), c: v4('172.20.0.3'), d: v4('169.254.10.1'), e: v4('10.0.0.5'),
    f: v4('172.32.0.1'), g: v4('192.168.1.20'), h: v4('172.15.0.1'),
  };
  assert.deepEqual(reachableAddresses(interfaces, 31337),
    ['192.168.1.20', '10.0.0.5', '172.20.0.3', '203.0.113.7', '172.32.0.1', '172.15.0.1', '100.101.1.2'].map((ip) => `${ip}:31337`));
});
