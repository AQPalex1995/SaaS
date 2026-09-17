import { describe, it, expect } from 'vitest';
import {
  assertCaseTransition,
  isCaseTerminal,
  CASE_TERMINAL,
  CASE_TRANSITIONS,
} from '../src/domain/research/lifecycle';

describe('ResearchCase lifecycle', () => {
  it('exposes the full target state set', () => {
    expect(CASE_TRANSITIONS).toHaveProperty('created');
    expect(CASE_TRANSITIONS).toHaveProperty('queued');
    expect(CASE_TRANSITIONS).toHaveProperty('running');
    expect(CASE_TRANSITIONS).toHaveProperty('partial');
  });

  it('allows valid forward transitions', () => {
    expect(() => assertCaseTransition('created', 'queued')).not.toThrow();
    expect(() => assertCaseTransition('created', 'running')).not.toThrow();
    expect(() => assertCaseTransition('queued', 'running')).not.toThrow();
    expect(() => assertCaseTransition('running', 'completed')).not.toThrow();
    expect(() => assertCaseTransition('running', 'partial')).not.toThrow();
    expect(() => assertCaseTransition('running', 'failed')).not.toThrow();
    expect(() => assertCaseTransition('running', 'cancelled')).not.toThrow();
    expect(() => assertCaseTransition('pending', 'running')).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => assertCaseTransition('queued', 'created')).toThrow();
    expect(() => assertCaseTransition('completed', 'running')).toThrow();
    expect(() => assertCaseTransition('completed', 'failed')).toThrow();
    expect(() => assertCaseTransition('partial', 'completed')).toThrow();
    expect(() => assertCaseTransition('failed', 'queued')).toThrow();
    expect(() => assertCaseTransition('cancelled', 'running')).toThrow();
    expect(() => assertCaseTransition('running', 'queued')).toThrow();
  });

  it('treats completed/partial/failed/cancelled as terminal and immutable', () => {
    for (const status of ['completed', 'partial', 'failed', 'cancelled']) {
      expect(CASE_TERMINAL.has(status as never)).toBe(true);
      expect(isCaseTerminal(status)).toBe(true);
    }
    expect(isCaseTerminal('running')).toBe(false);
    expect(isCaseTerminal('created')).toBe(false);
    expect(isCaseTerminal('unknown')).toBe(false);
  });
});