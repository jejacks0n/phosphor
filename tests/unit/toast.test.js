// The message at the bottom of the screen: ten seconds, whatever said it, or until it's closed; or one that stays, with a button.
import { test, expect, vi, afterEach } from 'vitest';
import { toast, toastMessage, toastAction, closeToast } from '@/composables/useToast';

afterEach(() => { vi.useRealTimers(); toastMessage.value = null; });

test('a message stays ten seconds', () => {
  vi.useFakeTimers();
  toast('Saved somewhere else.');
  vi.advanceTimersByTime(9_999);
  expect(toastMessage.value).toBe('Saved somewhere else.');
  vi.advanceTimersByTime(1);
  expect(toastMessage.value).toBe(null);
});

test('a new message gets its own ten seconds', () => {
  vi.useFakeTimers();
  toast('one');
  vi.advanceTimersByTime(8_000);
  toast('two');
  vi.advanceTimersByTime(8_000);
  expect(toastMessage.value).toBe('two');
});

test('closing it takes it away at once, and its timer can’t take the next one early', () => {
  vi.useFakeTimers();
  toast('one');
  closeToast();
  expect(toastMessage.value).toBe(null);
  vi.advanceTimersByTime(5_000);
  toast('two');
  vi.advanceTimersByTime(9_000);
  expect(toastMessage.value).toBe('two');
});

test('a message that stays has no timer, and one with an action carries it', () => {
  vi.useFakeTimers();
  const run = () => {};
  toast('Font has no lower half.', { stay: true, action: { label: 'Set up', run } });
  vi.advanceTimersByTime(60_000);
  expect(toastMessage.value).toBe('Font has no lower half.');
  expect(toastAction.value).toEqual({ label: 'Set up', run });
  toast('plain');
  expect(toastAction.value).toBe(null); // the next message has none of its own
  vi.advanceTimersByTime(10_000);
  expect(toastMessage.value).toBe(null);
});

test('closing by id closes only that message, never the one that replaced it', () => {
  const mine = toast('mine', { stay: true });
  closeToast(mine);
  expect(toastMessage.value).toBe(null);
  const again = toast('mine', { stay: true });
  toast('someone else’s');
  closeToast(again);
  expect(toastMessage.value).toBe('someone else’s');
  closeToast(); // with no id: whatever is showing
  expect(toastMessage.value).toBe(null);
});
