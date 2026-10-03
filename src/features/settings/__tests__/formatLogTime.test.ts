import { formatLogTime } from '../utils/formatLogTime';

describe('formatLogTime', () => {
  const referenceTime = new Date('2026-10-03T12:00:00Z');

  it('formats less than 60 seconds as "Just now"', () => {
    const timestamp = new Date('2026-10-03T11:59:30Z').toISOString();
    expect(formatLogTime(timestamp, referenceTime)).toBe('Just now');
  });

  it('formats minutes ago properly', () => {
    const timestamp = new Date('2026-10-03T11:45:00Z').toISOString();
    expect(formatLogTime(timestamp, referenceTime)).toBe('15m ago');
  });

  it('formats hours ago properly', () => {
    const timestamp = new Date('2026-10-03T08:00:00Z').toISOString();
    expect(formatLogTime(timestamp, referenceTime)).toBe('4h ago');
  });

  it('formats yesterday properly', () => {
    const timestamp = new Date('2026-10-02T10:00:00Z').toISOString();
    expect(formatLogTime(timestamp, referenceTime)).toBe('Yesterday');
  });

  it('formats older dates with localized date string', () => {
    const timestamp = new Date('2026-09-20T10:00:00Z').toISOString();
    const result = formatLogTime(timestamp, referenceTime);
    expect(result).toMatch(/Sep/);
  });
});
