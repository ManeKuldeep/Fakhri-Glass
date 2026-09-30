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
  /** Remaining fractional inches, rounded to 1/8" */
  fracInches: number;
}

/** Convert integer millimetres to feet + inches + fractional inches (1/8" precision). */
export function mmToFtIn(mm: number): FtIn {
  const totalInches = mm / MM_PER_INCH;
  let ft = Math.floor(totalInches / INCHES_PER_FOOT);
  const remainingInches = totalInches - ft * INCHES_PER_FOOT;
  let wholeInches = Math.floor(remainingInches);
  // Round fractional part to nearest 1/8"
  let fracInches = Math.round((remainingInches - wholeInches) * 8) / 8;

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

  return { ft, inches: wholeInches, fracInches };
}

/** Format mm as a human-readable ft/in string. */
export function formatFtIn(mm: number): string {
  const { ft, inches, fracInches } = mmToFtIn(mm);
  const parts: string[] = [];
  if (ft > 0) parts.push(`${ft}'`);

  const totalIn = inches + fracInches;
  if (totalIn > 0) {
    // Show as fraction where helpful
    if (fracInches > 0) {
      parts.push(`${totalIn.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}"`);
    } else {
      parts.push(`${inches}"`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0"';
}

/** Format mm as a simple mm string. */
export function formatMm(mm: number): string {
  return `${mm} mm`;
}

/**
 * Convert feet and inches to integer millimetres.
 * Rounds to the nearest mm.
 */
export function ftInToMm(ft: number, inches: number): number {
  const totalInches = ft * INCHES_PER_FOOT + inches;
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
