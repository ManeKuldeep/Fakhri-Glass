import type * as PrintType from 'expo-print';
import type * as SharingType from 'expo-sharing';
import { logEvent } from '../../lib/logEvent';
import { cleanupAppTempFiles, stageInvoicePdf } from '../../lib/tempFileManager';
import { OrderDetailData } from './queries';
import { generateInvoiceHtml } from './invoiceUtils';

function getPrintModule(): typeof PrintType {
  try {
    return require('expo-print');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Cannot find native module') || msg.includes('ExpoPrint')) {
      throw new Error(
        'Native module ExpoPrint is not compiled into the current Android build. Please rebuild the app with "npx expo run:android" to enable PDF printing.',
      );
    }
    throw err;
  }
}

function getSharingModule(): typeof SharingType | null {
  try {
    return require('expo-sharing');
  } catch {
    return null;
  }
}

export async function printOrShareOrderInvoice(
  order: OrderDetailData,
  options?: { sharePdf?: boolean },
): Promise<{ uri?: string }> {
  const html = generateInvoiceHtml(order);
  const Print = getPrintModule();
  const Sharing = getSharingModule();

  // Standard A4 dimensions in PDF points (1 pt = 1/72 inch; A4 = 595.28 x 841.89 pt)
  const widthPoints = 595.28;
  const heightPoints = 841.89;

  // Purge any previously generated invoice temp files prior to new generation
  await cleanupAppTempFiles('invoice');

  if (options?.sharePdf) {
    const { uri: rawUri } = await Print.printToFileAsync({
      html,
      width: widthPoints,
      height: heightPoints,
    });

    const uri = await stageInvoicePdf(rawUri);

    if (Sharing && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Invoice - Order #${order.order_no} (${order.customer.name})`,
      });
    }

    await logEvent(`Invoice shared for order #${order.order_no}`);
    return { uri };
  }

  // Open native system print spooler
  await Print.printAsync({
    html,
    width: widthPoints,
    height: heightPoints,
  });

  await logEvent(`Invoice printed for order #${order.order_no}`);
  return {};
}
