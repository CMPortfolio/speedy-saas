import { describe, expect, it } from 'vitest';

import { classifyKeyword, helpReply, withOptOutFooter } from './keywords';

describe('classifyKeyword', () => {
  it.each(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])('%s → stop', (w) => {
    expect(classifyKeyword(w)).toBe('stop');
  });

  it.each(['START', 'YES', 'UNSTOP'])('%s → start', (w) => {
    expect(classifyKeyword(w)).toBe('start');
  });

  it.each(['HELP', 'INFO'])('%s → help', (w) => {
    expect(classifyKeyword(w)).toBe('help');
  });

  it('ignores case, surrounding whitespace and trailing punctuation', () => {
    expect(classifyKeyword('  stop  ')).toBe('stop');
    expect(classifyKeyword('Stop.')).toBe('stop');
    expect(classifyKeyword('\nHelp!\n')).toBe('help');
    expect(classifyKeyword('yes')).toBe('start');
  });

  it('treats anything else as a normal message, including sentences with the words in them', () => {
    expect(classifyKeyword('Please stop by tomorrow')).toBe('message');
    expect(classifyKeyword('I need help with my AC')).toBe('message');
    expect(classifyKeyword('')).toBe('message');
    expect(classifyKeyword('Yes please, 2pm works')).toBe('message');
  });
});

describe('helpReply', () => {
  it('names the business and the carrier-required line', () => {
    expect(helpReply('Gulf Coast Plumbing')).toBe(
      'Gulf Coast Plumbing: reply STOP to opt out. Msg & data rates may apply.',
    );
  });
});

describe('withOptOutFooter', () => {
  it('adds the business name and the opt-out line on a new line', () => {
    expect(withOptOutFooter('Sorry we missed you. What do you need?', 'Gulf Coast Plumbing')).toBe(
      'Sorry we missed you. What do you need?\nGulf Coast Plumbing. Reply STOP to opt out.',
    );
  });

  it('does not add a second footer when one is already there', () => {
    const once = withOptOutFooter('Hi there', 'Gulf Coast Plumbing');
    expect(withOptOutFooter(once, 'Gulf Coast Plumbing')).toBe(once);
  });
});
