// What someone types to join a desktop room, read as host and port, or a plain reason it isn't one.
import { test, expect } from 'vitest';
import { DEFAULT_PORT, parseAddress } from '@/social/address.js';

test('parseAddress reads messy addresses, with the default port', () => {
  expect(DEFAULT_PORT).toBe(31337);
  expect(parseAddress('192.168.1.20')).toEqual({ host: '192.168.1.20', port: 31337, address: '192.168.1.20:31337' });
  expect(parseAddress(' 192.168.1.20:4000 ')).toEqual({ host: '192.168.1.20', port: 4000, address: '192.168.1.20:4000' });
  expect(parseAddress('ws://my-mac.local:4000/')).toEqual({ host: 'my-mac.local', port: 4000, address: 'my-mac.local:4000' });
  expect(parseAddress('http://my-mac.local')).toEqual({ host: 'my-mac.local', port: 31337, address: 'my-mac.local:31337' });
  expect(parseAddress('[fe80::1]:31337')).toEqual({ host: 'fe80::1', port: 31337, address: '[fe80::1]:31337' });
  expect(parseAddress('[::1]')).toEqual({ host: '::1', port: 31337, address: '[::1]:31337' });
});

test('parseAddress gives the bad ones a reason', () => {
  expect(parseAddress('')).toEqual({ error: 'empty' });
  expect(parseAddress('  ws://  ')).toEqual({ error: 'empty' });
  expect(parseAddress('host:abc')).toEqual({ error: 'bad-port' });
  expect(parseAddress('host:70000')).toEqual({ error: 'bad-port' });
  expect(parseAddress('host:0')).toEqual({ error: 'bad-port' });
  expect(parseAddress('host:')).toEqual({ error: 'bad-port' });
  expect(parseAddress('a b')).toEqual({ error: 'bad-host' });
  expect(parseAddress('fe80::1')).toEqual({ error: 'bad-host' });   // IPv6 needs its brackets, or the port can't be told apart
  expect(parseAddress('host/room')).toEqual({ error: 'bad-host' });
  expect(parseAddress('[nope]:31337')).toEqual({ error: 'bad-host' });
});
