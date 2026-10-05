import {
  mmToFtIn,
  formatFtIn,
  formatMm,
  ftInToMm,
  parseDimensionInput,
  friendlyStockError,
  calculateAreaSqFt,
  calculateAreaSqM,
  getAspectRatioInfo,
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

  it('parses feet, inches and 1/16 fraction (4\' 6 3/16")', () => {
    // 4 ft = 48 in. 48 + 6 + 3/16 = 54.1875 in = 1376.36 mm -> 1376 mm
    expect(parseDimensionInput('4\' 6 3/16"')).toBe(1376);
  });

  it('parses inches with fraction (6 1/2")', () => {
    // 6.5 in = 165.1 mm -> 165 mm
    expect(parseDimensionInput('6 1/2"')).toBe(165);
  });

  it('parses standalone fraction (3/16")', () => {
    // 3/16 in = 0.1875 in = 4.7625 mm -> 5 mm
    expect(parseDimensionInput('3/16"')).toBe(5);
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

describe('calculateAreaSqFt and calculateAreaSqM', () => {
  it('calculates area for 2440 × 1830 mm standard sheet (~48 sq ft, ~4.47 m²)', () => {
    const sqFt = calculateAreaSqFt(2440, 1830);
    const sqM = calculateAreaSqM(2440, 1830);
    expect(sqFt).toBeCloseTo(48.06, 1);
    expect(sqM).toBe(4.47);
  });

  it('calculates area for an offcut 600 × 900 mm (~5.81 sq ft, 0.54 m²)', () => {
    const sqFt = calculateAreaSqFt(600, 900);
    const sqM = calculateAreaSqM(600, 900);
    expect(sqFt).toBe(5.81);
    expect(sqM).toBe(0.54);
  });

  it('returns 0 for non-positive dimensions', () => {
    expect(calculateAreaSqFt(0, 1000)).toBe(0);
    expect(calculateAreaSqM(1000, -10)).toBe(0);
  });
});

describe('getAspectRatioInfo', () => {
  it('identifies portrait orientation correctly', () => {
    const info = getAspectRatioInfo(600, 900);
    expect(info.orientation).toBe('Portrait');
    expect(info.ratioText).toBe('1 : 1.50');
  });

  it('identifies landscape orientation correctly', () => {
    const info = getAspectRatioInfo(1200, 600);
    expect(info.orientation).toBe('Landscape');
    expect(info.ratioText).toBe('2.00 : 1');
  });

  it('identifies square pieces correctly', () => {
    const info = getAspectRatioInfo(800, 800);
    expect(info.orientation).toBe('Square');
    expect(info.ratioText).toBe('1 : 1');
  });
});

