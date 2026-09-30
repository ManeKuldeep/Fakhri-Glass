import {
  mmToFtIn,
  formatFtIn,
  formatMm,
  ftInToMm,
  parseDimensionInput,
  friendlyStockError,
} from '../utils';

describe('ftInToMm', () => {
  it('converts 4 feet 0 inches to 1219 mm', () => {
    expect(ftInToMm(4, 0)).toBe(1219);
  });

  it('converts 0 feet 12 inches to 305 mm', () => {
    expect(ftInToMm(0, 12)).toBe(305);
  });

  it('converts 4 feet 6 inches', () => {
    // 4'6" = 54 inches = 1371.6 mm → rounds to 1372
    expect(ftInToMm(4, 6)).toBe(1372);
  });

  it('handles zero', () => {
    expect(ftInToMm(0, 0)).toBe(0);
  });
});

describe('mmToFtIn', () => {
  it('converts 1219 mm to ~4 feet 0 inches', () => {
    const result = mmToFtIn(1219);
    expect(result.ft).toBe(4);
    expect(result.inches).toBe(0);
  });

  it('converts 305 mm to ~1 foot 0 inches', () => {
    const result = mmToFtIn(305);
    expect(result.ft).toBe(1);
  });
});

describe('formatMm', () => {
  it('formats 1200 as "1200 mm"', () => {
    expect(formatMm(1200)).toBe('1200 mm');
  });
});

describe('formatFtIn', () => {
  it('formats 1219 mm as something with feet', () => {
    const result = formatFtIn(1219);
    expect(result).toContain("'");
  });

  it('formats 0 mm as 0"', () => {
    expect(formatFtIn(0)).toBe('0"');
  });
});

describe('parseDimensionInput', () => {
  it('parses plain number as mm', () => {
    expect(parseDimensionInput('1200')).toBe(1200);
  });

  it('rounds fractional mm', () => {
    expect(parseDimensionInput('1200.7')).toBe(1201);
  });

  it('parses feet-only', () => {
    expect(parseDimensionInput("4'")).toBe(1219);
  });

  it('parses ft + in', () => {
    expect(parseDimensionInput('4\'6"')).toBe(1372);
  });

  it('parses ft + in without trailing quote', () => {
    expect(parseDimensionInput("4'6")).toBe(1372);
  });

  it('parses inches-only', () => {
    expect(parseDimensionInput('12"')).toBe(305);
  });

  it('returns null for empty string', () => {
    expect(parseDimensionInput('')).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseDimensionInput('abc')).toBeNull();
  });

  it('returns null for zero', () => {
    // 0 is not > 0
    expect(parseDimensionInput('0')).toBeNull();
  });

  it('returns null for negative', () => {
    expect(parseDimensionInput('-5')).toBeNull();
  });
});

describe('friendlyStockError', () => {
  it('translates lining error', () => {
    const msg = friendlyStockError(
      'new row violates check_lining_stock: vertical_line_height_mm is null',
    );
    expect(msg).toContain('vertical line height');
  });

  it('passes through unknown errors', () => {
    expect(friendlyStockError('some other error')).toBe('some other error');
  });
});
