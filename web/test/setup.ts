import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom replaces AbortController/AbortSignal with its own classes, but Node's Request (which
 * viem's HTTP transport constructs) only accepts Node's AbortSignal. The tests stub fetch and
 * never abort, so strip a jsdom signal before handing init to Request.
 */
const NodeRequest = globalThis.Request;
class TestRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init && init.signal && init.signal instanceof globalThis.AbortSignal) {
      const { signal: _signal, ...rest } = init;
      super(input, rest);
    } else {
      super(input, init);
    }
  }
}
globalThis.Request = TestRequest as typeof Request;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete (window as unknown as { ethereum?: unknown }).ethereum;
  window.history.replaceState({}, '', '/');
});
