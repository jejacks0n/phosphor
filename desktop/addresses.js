// The addresses this machine's room can be reached at: its LAN addresses first, Tailscale's (100.64.0.0/10) last.
// PHOSPHOR_ADDRESSES (comma-separated, the port added where one isn't given) replaces the list, for the
// end-to-end tests.
import os from 'node:os';
import process from 'node:process';

const isTailscale = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
};

export function reachableAddresses(interfaces = os.networkInterfaces(), port) {
  const given = process.env.PHOSPHOR_ADDRESSES?.split(',').map((a) => a.trim()).filter(Boolean);
  if (given?.length) return given.map((a) => (/:\d+$/.test(a) ? a : `${a}:${port}`));
  const ips = Object.values(interfaces).flat()
    .filter((i) => !i.internal && (i.family === 'IPv4' || i.family === 4))
    .map((i) => i.address);
  return [...ips.filter((ip) => !isTailscale(ip)), ...ips.filter(isTailscale)].map((ip) => `${ip}:${port}`);
}
