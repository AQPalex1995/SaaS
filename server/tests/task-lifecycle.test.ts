import { describe, it, expect } from 'vitest';
import {
  assertTaskTransition,
  isTaskSettled,
  isTaskTerminal,
  isTaskRetry,
  TASK_TERMINAL,
  TASK_SETTLED,
  TASK_TRANSITIONS,
} from '../src/domain/research/task-lifecycle';

describe('ResearchTask lifecycle', () => {
  it('exposes the full target state set', () => {
    for (const status of [
      'pending',
      'running',
      'completed',
      'failed',
      'requires_manual_action',
      'blocked',
      'unavailable',
      'skipped',
    ]) {
      expect(TASK_TRANSITIONS, `state ${status}`).toHaveProperty(status);
    }
  });

  it('allows valid forward transitions', () => {
    expect(() => assertTaskTransition('pending', 'running')).not.toThrow();
    expect(() => assertTaskTransition('pending', 'completed')).not.toThrow();
    expect(() => assertTaskTransition('pending', 'requires_manual_action')).not.toThrow();
    expect(() => assertTaskTransition('pending', 'unavailable')).not.toThrow();
    expect(() => assertTaskTransition('pending', 'skipped')).not.toThrow();
    expect(() => assertTaskTransition('running', 'completed')).not.toThrow();
    expect(() => assertTaskTransition('running', 'failed')).not.toThrow();
    expect(() => assertTaskTransition('running', 'blocked')).not.toThrow();
    expect(() => assertTaskTransition('running', 'unavailable')).not.toThrow();
    // A manual action resolved by a human settles the task directly (T3.4).
    expect(() => assertTaskTransition('requires_manual_action', 'completed')).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => assertTaskTransition('completed', 'running')).toThrow();
    expect(() => assertTaskTransition('completed', 'failed')).toThrow();
    expect(() => assertTaskTransition('completed', 'unavailable')).toThrow();
    expect(() => assertTaskTransition('skipped', 'running')).toThrow();
    expect(() => assertTaskTransition('skipped', 'pending')).toThrow();
    expect(() => assertTaskTransition('running', 'pending')).toThrow();
    expect(() => assertTaskTransition('pending', 'pending')).toThrow();
    expect(() => assertTaskTransition('failed', 'completed')).toThrow();
  });

  it('allows retry edges only from retryable states', () => {
    expect(() => assertTaskTransition('failed', 'running')).not.toThrow();
    expect(() => assertTaskTransition('failed', 'pending')).not.toThrow();
    expect(() => assertTaskTransition('blocked', 'running')).not.toThrow();
    expect(() => assertTaskTransition('blocked', 'pending')).not.toThrow();
    expect(() => assertTaskTransition('unavailable', 'running')).not.toThrow();
    expect(() => assertTaskTransition('unavailable', 'pending')).not.toThrow();
    expect(() => assertTaskTransition('requires_manual_action', 'running')).not.toThrow();
    expect(() => assertTaskTransition('requires_manual_action', 'pending')).not.toThrow();
    expect(() => assertTaskTransition('blocked', 'unavailable')).not.toThrow();

    expect(isTaskRetry('failed', 'running')).toBe(true);
    expect(isTaskRetry('unavailable', 'pending')).toBe(true);
    expect(isTaskRetry('requires_manual_action', 'pending')).toBe(true);
    // A brand new task is not a retry.
    expect(isTaskRetry('pending', 'running')).toBe(false);
    // Terminal states are not retryable.
    expect(isTaskRetry('completed', 'running')).toBe(false);
    expect(isTaskRetry('skipped', 'pending')).toBe(false);
  });

  it('treats completed/skipped as immutable terminal states', () => {
    for (const status of ['completed', 'skipped']) {
      expect(TASK_TERMINAL.has(status as never)).toBe(true);
      expect(isTaskTerminal(status)).toBe(true);
    }
    expect(isTaskTerminal('running')).toBe(false);
    expect(isTaskTerminal('failed')).toBe(false);
    expect(isTaskTerminal('unknown')).toBe(false);
  });

  it('treats all finished states as settled (drives case completion)', () => {
    for (const status of [
      'completed',
      'failed',
      'skipped',
      'unavailable',
      'blocked',
      'requires_manual_action',
    ]) {
      expect(TASK_SETTLED.has(status as never)).toBe(true);
      expect(isTaskSettled(status)).toBe(true);
    }
    expect(isTaskSettled('pending')).toBe(false);
    expect(isTaskSettled('running')).toBe(false);
  });
});