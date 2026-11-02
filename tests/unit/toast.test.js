// The message at the bottom of the screen: ten seconds, whatever said it, or until it's closed.
import { test, expect, vi, afterEach } from 'vitest';
import { toast, toastMessage, closeToast } from '@/composables/useToast';

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
