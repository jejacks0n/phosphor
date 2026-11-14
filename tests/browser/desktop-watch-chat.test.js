// A desktop watcher's Watch takes the chat and presence lines the host relays, each named by its sender's self-signed
// pass, which a kept message holds on to past its expiry (claimsOf checks it with now = 0).
import { test, expect } from 'vitest';
import { Watch } from '@/social/watching';
import { makeSelfPass } from '@/social/selfPass';
import { newId, signedText } from '@/social/chat';
import { sign } from '@/social/keys';
import { toBase64url } from '@/social/base64url';

test('a desktop Watch shows a chat message and a presence line named by a self pass', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  const publicKey = toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const { pass, claims } = await makeSelfPass({ privateKey: pair.privateKey, publicKey }, 'ann');
  const heard = [];
  const watch = new Watch({ send() {}, config: {}, connectWithinMs: 1000, roomId: 'r_1', passKey: async () => null, onRoom() {}, onArt() {}, onView() {}, onState() {}, onChat: (event) => heard.push(event) });
  watch.connect();   // its socket peer waits for the host's offer, which never comes here
  const ts = Date.now(), text = 'hello', id = newId();
  const sig = await sign(pair.privateKey, signedText('r_1', claims.sub, { id, ts, text }));
  await watch.chat({ t: 'chat', pass, id, ts, text, sig });
  await watch.chat({ t: 'presence', pass, id: newId(), ts, presence: 'joined' });
  watch.close();
  expect(heard.map((e) => [e.type, e.claims?.name, e.entry?.text ?? e.entry?.presence])).toEqual([['chat', 'ann', 'hello'], ['presence', 'ann', 'joined']]);
});
