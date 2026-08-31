import { describe, expect, it } from 'vitest';
import { guardExitCode } from './globalSetup';

/*
 * Guards the fix for a run that reported "1 failed" and exited 0.
 *
 * That is the worst class of bug in a test setup: every CI step passes, the
 * commit is pushed, and the suite has been telling you nothing. The mechanism
 * is described on guardExitCode; this pins the behaviour.
 */
function fakeProcess(initial?: number) {
  const listeners: (() => void)[] = [];
  const state = { code: initial as number | string | null | undefined };

  guardExitCode(
    () => state.code,
    (code) => {
      state.code = code;
    },
    (listener) => listeners.push(listener),
  );

  return {
    get code() {
      return state.code;
    },
    /** Whatever cleared it, the code is `codeAtExit` when the process ends. */
    exitWith(codeAtExit: number | undefined = 0) {
      state.code = codeAtExit;
      for (const listener of listeners) listener();
      return state.code;
    },
  };
}

describe('the run’s exit code', () => {
  it('is restored to 1 when the suite failed', () => {
    expect(fakeProcess(1).exitWith(0)).toBe(1);
  });

  it('stays 0 when the suite passed', () => {
    // The mirror image matters just as much: a guard that always exits 1
    // fails every green run and gets deleted within the day.
    expect(fakeProcess(0).exitWith(0)).toBe(0);
  });

  it('stays 0 when nothing set a code at all', () => {
    expect(fakeProcess().exitWith(0)).toBe(0);
  });

  it('does not flatten a different failure code set later', () => {
    expect(fakeProcess(1).exitWith(2)).toBe(2);
  });
});
