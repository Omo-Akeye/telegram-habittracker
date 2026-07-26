import { isValidTime } from './time.utils';

describe('isValidTime', () => {
  it('should return true for valid times', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('08:30')).toBe(true);
    expect(isValidTime('12:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
  });

  it('should return false for out-of-bound hours or minutes', () => {
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('25:10')).toBe(false);
    expect(isValidTime('12:60')).toBe(false);
    expect(isValidTime('99:99')).toBe(false);
  });

  it('should return false for invalid formats', () => {
    expect(isValidTime('8:30')).toBe(false);
    expect(isValidTime('08.30')).toBe(false);
    expect(isValidTime('abc')).toBe(false);
    expect(isValidTime('')).toBe(false);
  });
});
