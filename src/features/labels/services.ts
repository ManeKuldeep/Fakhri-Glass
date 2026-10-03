import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { logEvent } from '../../lib/logEvent';
import { OrderWithItemsForLabels } from './types';
import { generateLabelsHtml, generatePieceLabelsFromOrder } from './utils';

export async function printOrderLabels(
  order: OrderWithItemsForLabels,
  options?: { sharePdf?: boolean },
): Promise<{ uri?: string; totalPieces: number }> {
  const pieceLabels = generatePieceLabelsFromOrder(order);

  if (pieceLabels.length === 0) {
    throw new Error('This order has no pieces to generate labels for.');
  }

  const html = generateLabelsHtml(pieceLabels);

  // 100mm × 50mm in standard PDF points (1mm = 2.83465 points)
  const widthPoints = 283.46;
  const heightPoints = 141.73;

  if (options?.sharePdf) {
    const { uri } = await Print.printToFileAsync({
      html,
      width: widthPoints,
      height: heightPoints,
    });

    if (await Sharing.isAvailableAsync()) {
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
