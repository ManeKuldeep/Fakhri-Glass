import type * as PrintType from 'expo-print';
import type * as SharingType from 'expo-sharing';
import { logEvent } from '../../lib/logEvent';
import { cleanupAppTempFiles, stageLabelPdf } from '../../lib/tempFileManager';
import { OrderWithItemsForLabels } from './types';
import { generateLabelsHtml, generatePieceLabelsFromOrder } from './utils';

/**
 * Lazily loads expo-print so missing native modules don't crash
 * the entire app on boot when running an APK built before the package was installed.
 */
function getPrintModule(): typeof PrintType {
  try {
    return require('expo-print');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Cannot find native module') || msg.includes('ExpoPrint')) {
      throw new Error(
        'Native module ExpoPrint is not compiled into the current Android build. Please rebuild the app with "npx expo run:android" to enable thermal label printing.',
      );
    }
    throw err;
  }
}

/**
 * Lazily loads expo-sharing if available.
 */
function getSharingModule(): typeof SharingType | null {
  try {
    return require('expo-sharing');
  } catch {
    return null;
  }
}

export async function printOrderLabels(
  order: OrderWithItemsForLabels,
  options?: { sharePdf?: boolean },
): Promise<{ uri?: string; totalPieces: number }> {
  const pieceLabels = generatePieceLabelsFromOrder(order);

  if (pieceLabels.length === 0) {
    throw new Error('This order has no pieces to generate labels for.');
  }

  const html = generateLabelsHtml(pieceLabels);
  const Print = getPrintModule();
  const Sharing = getSharingModule();

  // 100mm × 50mm in standard PDF points (1mm = 2.83465 points)
  const widthPoints = 283.46;
  const heightPoints = 141.73;

  // Purge any previously generated label temp files prior to new generation
  await cleanupAppTempFiles('label');

  if (options?.sharePdf) {
    const { uri: rawUri } = await Print.printToFileAsync({
      html,
      width: widthPoints,
      height: heightPoints,
    });

    const uri = await stageLabelPdf(rawUri);

    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Piece Labels - Order #${order.order_no}`,
      });
    }

    // Call log_event RPC (errors are swallowed inside logEvent)
    await logEvent(`Labels printed for order #${order.order_no}`);

    return { uri, totalPieces: pieceLabels.length };
  }

  // Open native printer spooler
  await Print.printAsync({
    html,
    width: widthPoints,
    height: heightPoints,
  });

  await logEvent(`Labels printed for order #${order.order_no}`);

  return { totalPieces: pieceLabels.length };
}

