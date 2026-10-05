/**
 * Pure conversion helpers: mm ↔ ft/in.
 * All storage is integer millimetres; these are UI-only.
 */

const MM_PER_INCH = 25.4;
const INCHES_PER_FOOT = 12;

export interface FtIn {
  ft: number;
  /** Whole inches (0–11) */
  inches: number;
  /** Remaining fractional inches, rounded to 1/16" */
  fracInches: number;
  /** Fractional string representation, e.g. '1/16', '3/16', or '' */
  fracString: string;
}

export const FRACTIONS_16THS: { value: number; label: string }[] = [
  { value: 0, label: '0"' },
  { value: 1 / 16, label: '1/16"' },
  { value: 2 / 16, label: '1/8"' },
  { value: 3 / 16, label: '3/16"' },
  { value: 4 / 16, label: '1/4"' },
  { value: 5 / 16, label: '5/16"' },
  { value: 6 / 16, label: '3/8"' },
  { value: 7 / 16, label: '7/16"' },
  { value: 8 / 16, label: '1/2"' },
  { value: 9 / 16, label: '9/16"' },
  { value: 10 / 16, label: '5/8"' },
  { value: 11 / 16, label: '11/16"' },
  { value: 12 / 16, label: '3/4"' },
  { value: 13 / 16, label: '13/16"' },
  { value: 14 / 16, label: '7/8"' },
  { value: 15 / 16, label: '15/16"' },
];

export function fraction16thToString(frac: number): string {
  const rounded16 = Math.round(frac * 16);
  if (rounded16 <= 0 || rounded16 >= 16) return '';
  const match = FRACTIONS_16THS.find((f) => Math.round(f.value * 16) === rounded16);
  return match ? match.label.replace('"', '') : '';
}

/** Convert integer millimetres to feet + inches + fractional inches (1/16" precision). */
export function mmToFtIn(mm: number): FtIn {
  const totalInches = mm / MM_PER_INCH;
  let ft = Math.floor(totalInches / INCHES_PER_FOOT);
  const remainingInches = totalInches - ft * INCHES_PER_FOOT;
  let wholeInches = Math.floor(remainingInches);
  // Round fractional part to nearest 1/16"
  let fracInches = Math.round((remainingInches - wholeInches) * 16) / 16;

  // Handle rounding up to a whole inch
  if (fracInches >= 1) {
    wholeInches += 1;
    fracInches = 0;
  }

  // Handle rollover: 12 inches = 1 foot
  if (wholeInches >= INCHES_PER_FOOT) {
    ft += 1;
    wholeInches -= INCHES_PER_FOOT;
  }

  const fracString = fraction16thToString(fracInches);

  return { ft, inches: wholeInches, fracInches, fracString };
}

/** Format mm as a human-readable ft/in string. */
export function formatFtIn(mm: number): string {
  const { ft, inches, fracInches, fracString } = mmToFtIn(mm);
  const parts: string[] = [];
  if (ft > 0) parts.push(`${ft}'`);

  if (inches > 0 || fracInches > 0) {
    if (fracString) {
      if (inches > 0) {
        parts.push(`${inches} ${fracString}"`);
      } else {
        parts.push(`${fracString}"`);
      }
    } else {
      parts.push(`${inches}"`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0"';
}

/** Format mm as a simple integer mm string (never point/decimal). */
export function formatMm(mm: number): string {
  return `${Math.round(mm)} mm`;
}

/**
 * Snaps a fractional value (between 0 and 1) to the nearest 1/16th (0, 1/16, 2/16, ..., 15/16).
 */
export function snapTo16th(val: number): number {
  return Math.round(val * 16) / 16;
}

/**
 * Snaps any decimal inches to the nearest 1/16th fraction.
 * e.g., 6.5 -> 6.5 (6 1/2"), 6.3 -> 6.3125 (6 5/16"), 10.1 -> 10.125 (10 1/8")
 */
export function snapInchesWith16th(inches: number): number {
  if (inches <= 0) return 0;
  const whole = Math.floor(inches);
  const frac = inches - whole;
  const snappedFrac = snapTo16th(frac);
  if (snappedFrac >= 1) {
    return whole + 1;
  }
  return whole + snappedFrac;
}

/**
 * Convert feet and inches to integer millimetres.
 * Always snaps fractional/point inches to nearest 1/16" fraction for accurate calculation,
 * and rounds result to the nearest integer mm.
 */
export function ftInToMm(ft: number, inches: number): number {
  const snappedInches = snapInchesWith16th(inches);
  const totalInches = ft * INCHES_PER_FOOT + snappedInches;
  return Math.round(totalInches * MM_PER_INCH);
}

/**
 * Parse a user-entered dimension string.
 * Accepts: "1200" (mm), "4'" (feet only), "4'6" or "4' 6"" (ft+in), "6"" (inches only).
 * Returns integer mm or null if unparseable.
 */
export function parseDimensionInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pure number → treat as mm
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && asNumber > 0) {
    return Math.round(asNumber);
  }

  // Fraction only: e.g. "3/16" or "3/16""
  const fracOnlyMatch = trimmed.match(/^(\d+)\/(\d+)"?$/);
  if (fracOnlyMatch) {
    const num = Number(fracOnlyMatch[1]);
    const den = Number(fracOnlyMatch[2]);
    if (den > 0) return ftInToMm(0, num / den);
  }

  // Feet + inches with fraction: e.g. 4' 6 3/16" or 4'6 1/2"
  const ftInFracMatch = trimmed.match(/^(\d+)'\s*(?:(\d+)\s+)?(\d+)\/(\d+)"?$/);
  if (ftInFracMatch) {
    const ft = Number(ftInFracMatch[1]);
    const wholeIn = Number(ftInFracMatch[2] || 0);
    const num = Number(ftInFracMatch[3]);
    const den = Number(ftInFracMatch[4]);
    if (den > 0) return ftInToMm(ft, wholeIn + num / den);
  }

  // Inches with fraction: e.g. 6 3/16" or 6 1/2"
  const inFracMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)"?$/);
  if (inFracMatch) {
    const wholeIn = Number(inFracMatch[1]);
    const num = Number(inFracMatch[2]);
    const den = Number(inFracMatch[3]);
    if (den > 0) return ftInToMm(0, wholeIn + num / den);
  }

  // ft/in patterns: 4'6", 4' 6", 4', 6"
  const ftInMatch = trimmed.match(/^(\d+)'\s*(\d+(?:\.\d+)?)"?$/);
  if (ftInMatch) {
    return ftInToMm(Number(ftInMatch[1]), Number(ftInMatch[2]));
  }

  const ftOnlyMatch = trimmed.match(/^(\d+)'$/);
  if (ftOnlyMatch) {
    return ftInToMm(Number(ftOnlyMatch[1]), 0);
  }

  const inOnlyMatch = trimmed.match(/^(\d+(?:\.\d+)?)"$/);
  if (inOnlyMatch) {
    return ftInToMm(0, Number(inOnlyMatch[1]));
  }

  return null;
}

/**
 * Translate a Postgres/Supabase error message to user-friendly text.
 * Specifically handles the check_lining_stock trigger.
 */
export function friendlyStockError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('vertical_line_height') ||
    lower.includes('lining') ||
    lower.includes('check_lining_stock')
  ) {
    return 'Figured glass (lining) requires a vertical line height. Please enter it before saving.';
  }
  if (lower.includes('width') && lower.includes('> 0')) {
    return 'Width must be greater than zero.';
  }
  if (lower.includes('height') && lower.includes('> 0')) {
    return 'Height must be greater than zero.';
  }
  return message;
}

/** Calculate area in square feet from integer mm dimensions. */
export function calculateAreaSqFt(widthMm: number, heightMm: number): number {
  if (widthMm <= 0 || heightMm <= 0) return 0;
  return Number(((widthMm * heightMm) / 92903.04).toFixed(2));
}

/** Calculate area in square metres from integer mm dimensions. */
export function calculateAreaSqM(widthMm: number, heightMm: number): number {
  if (widthMm <= 0 || heightMm <= 0) return 0;
  return Number(((widthMm * heightMm) / 1000000).toFixed(2));
}

/** Returns orientation and ratio info for given dimensions. */
export function getAspectRatioInfo(widthMm: number, heightMm: number): {
  orientation: 'Portrait' | 'Landscape' | 'Square';
  ratioText: string;
} {
  if (widthMm <= 0 || heightMm <= 0) {
    return { orientation: 'Square', ratioText: '1 : 1' };
  }
  if (widthMm === heightMm) {
    return { orientation: 'Square', ratioText: '1 : 1' };
  }
  if (widthMm > heightMm) {
    return {
      orientation: 'Landscape',
      ratioText: `${(widthMm / heightMm).toFixed(2)} : 1`,
    };
  }
  return {
    orientation: 'Portrait',
    ratioText: `1 : ${(heightMm / widthMm).toFixed(2)}`,
  };
}

