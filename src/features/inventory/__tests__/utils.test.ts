import {
  mmToFtIn,
  formatFtIn,
  formatMm,
  ftInToMm,
  ftInToMmWithFrac,
  inToMm,
  inToMmWithFrac,
  mmToInches,
  formatInches,
  parseDimensionInput,
  friendlyStockError,
  calculateAreaSqFt,
  calculateAreaSqM,
  getAspectRatioInfo,
  snapTo16th,
  snapInchesWith16th,
  mmFractionToString,
  FRACTIONS_MM_16THS,
} from '../utils';

describe('snapTo16th and snapInchesWith16th', () => {
  it('snaps decimal 0.5 to 0.5 (8/16 = 1/2)', () => {
    expect(snapTo16th(0.5)).toBe(0.5);
  });

  it('snaps decimal 0.25 to 0.25 (4/16 = 1/4)', () => {
    expect(snapTo16th(0.25)).toBe(0.25);
  });

  it('snaps decimal 0.3 to 0.3125 (5/16)', () => {
    expect(snapTo16th(0.3)).toBe(0.3125);
  });

  it('snaps decimal 0.1 to 0.125 (2/16 = 1/8)', () => {
    expect(snapTo16th(0.1)).toBe(0.125);
  });

  it('snaps 6.5 inches to 6.5 (6 1/2")', () => {
    expect(snapInchesWith16th(6.5)).toBe(6.5);
  });

  it('snaps 6.3 inches to 6.3125 (6 5/16")', () => {
    expect(snapInchesWith16th(6.3)).toBe(6.3125);
  });

  it('ftInToMm automatically snaps decimal inches to 1/16 fraction', () => {
    // 6.3 inches -> 6.3125 in * 25.4 = 160.3375 mm -> 160 mm
    expect(ftInToMm(0, 6.3)).toBe(160);
  });
});

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

describe('mmFractionToString and FRACTIONS_MM_16THS', () => {
  it('has 16 simplified fraction items', () => {
    expect(FRACTIONS_MM_16THS).toHaveLength(16);
    expect(FRACTIONS_MM_16THS[0].label).toBe('0');
    expect(FRACTIONS_MM_16THS[1].label).toBe('1/16');
    expect(FRACTIONS_MM_16THS[2].label).toBe('1/8');
    expect(FRACTIONS_MM_16THS[8].label).toBe('1/2');
    expect(FRACTIONS_MM_16THS[15].label).toBe('15/16');
  });

  it('converts fractions to simplified strings', () => {
    expect(mmFractionToString(0.5)).toBe('1/2');
    expect(mmFractionToString(0.25)).toBe('1/4');
    expect(mmFractionToString(0.125)).toBe('1/8');
    expect(mmFractionToString(0.0625)).toBe('1/16');
    expect(mmFractionToString(0.6875)).toBe('11/16');
    expect(mmFractionToString(0)).toBe('');
  });
});

describe('formatMm', () => {
  it('formats whole number 1200 as "1200 mm"', () => {
    expect(formatMm(1200)).toBe('1200 mm');
  });

  it('formats decimal 100.5 as "100 1/2 mm"', () => {
    expect(formatMm(100.5)).toBe('100 1/2 mm');
  });

  it('formats decimal 100.25 as "100 1/4 mm"', () => {
    expect(formatMm(100.25)).toBe('100 1/4 mm');
  });

  it('formats decimal 100.0625 as "100 1/16 mm"', () => {
    expect(formatMm(100.0625)).toBe('100 1/16 mm');
  });

  it('formats converted decimal 139.7 as "139 11/16 mm"', () => {
    expect(formatMm(139.7)).toBe('139 11/16 mm');
  });

  it('formats fraction-only 0.5 as "1/2 mm"', () => {
    expect(formatMm(0.5)).toBe('1/2 mm');
  });

  it('formats 0 as "0 mm"', () => {
    expect(formatMm(0)).toBe('0 mm');
  });
});

describe('ftInToMmWithFrac', () => {
  it('converts 1 foot (12 inches) to 304 mm with 13/16 mm fraction', () => {
    const res = ftInToMmWithFrac(1, 0);
    expect(res.wholeMm).toBe(304);
    expect(res.fracMm).toBe(13 / 16);
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

  it('parses number with explicit mm unit', () => {
    expect(parseDimensionInput('1200 mm')).toBe(1200);
  });

  it('parses mm with 1/16 fraction (100 1/2 mm)', () => {
    expect(parseDimensionInput('100 1/2 mm')).toBe(101);
  });

  it('parses mm with fraction without unit (100 1/4)', () => {
    expect(parseDimensionInput('100 1/4')).toBe(100);
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

  it('parses inches with in/inch/inches suffix', () => {
    expect(parseDimensionInput('48 in')).toBe(1219);
    expect(parseDimensionInput('54 inch')).toBe(1372);
    expect(parseDimensionInput('10 inches')).toBe(254);
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

describe('inToMm', () => {
  it('converts 48 inches to 1219 mm', () => {
    expect(inToMm(48)).toBe(1219);
  });

  it('converts 54 inches to 1372 mm', () => {
    expect(inToMm(54)).toBe(1372);
  });

  it('handles zero or negative', () => {
    expect(inToMm(0)).toBe(0);
    expect(inToMm(-5)).toBe(0);
  });
});

describe('inToMmWithFrac', () => {
  it('converts 48 inches to whole 1219 mm with 3/16 fraction', () => {
    const res = inToMmWithFrac(48);
    expect(res.wholeMm).toBe(1219);
    expect(res.fracMm).toBe(3 / 16);
    expect(res.totalMm).toBe(1219 + 3 / 16);
  });

  it('converts 10 inches to exact 254 mm with 0 fraction', () => {
    const res = inToMmWithFrac(10);
    expect(res.wholeMm).toBe(254);
    expect(res.fracMm).toBe(0);
    expect(res.totalMm).toBe(254);
  });
});

describe('mmToInches and formatInches', () => {
  it('converts mm to rounded inches', () => {
    expect(mmToInches(1219)).toBe(47.99);
    expect(mmToInches(254)).toBe(10);
  });

  it('formats mm as inches string', () => {
    expect(formatInches(1219)).toBe('48"');
    expect(formatInches(1372)).toBe('54"');
    expect(formatInches(254)).toBe('10"');
    expect(formatInches(0)).toBe('0"');
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

