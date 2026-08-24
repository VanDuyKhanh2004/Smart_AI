const {
  STATUS_LIST,
  VALID_TRANSITIONS,
  getAllowedNextStatuses,
  canTransition,
  isTerminal,
} = require('../services/orderStatusTransitions');

describe('getAllowedNextStatuses', () => {
  it('returns allowed transitions for a valid status', () => {
    expect(getAllowedNextStatuses('pending')).toEqual(['confirmed', 'cancelled']);
  });

  it('returns empty array for an unknown status', () => {
    expect(getAllowedNextStatuses('unknown')).toEqual([]);
  });
});

describe('canTransition', () => {
  it('returns true for a valid transition', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
  });

  it('returns false when next status is not allowed from current', () => {
    expect(canTransition('pending', 'processing')).toBe(false);
  });

  it('returns false when current status is terminal', () => {
    expect(canTransition('delivered', 'pending')).toBe(false);
  });
});

describe('isTerminal', () => {
  it('returns true for delivered', () => {
    expect(isTerminal('delivered')).toBe(true);
  });

  it('returns true for cancelled', () => {
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('returns false for a non-terminal status', () => {
    expect(isTerminal('pending')).toBe(false);
  });
});
