import { Share } from 'react-native';
import type * as SharingType from 'expo-sharing';
import { supabase } from '../../../lib/supabase';
import { logEvent } from '../../../lib/logEvent';
import { cleanupAppTempFiles, stageBackupJson } from '../../../lib/tempFileManager';

function getSharingModule(): typeof SharingType | null {
  try {
    return require('expo-sharing');
  } catch {
    return null;
  }
}

export interface BackupExportResult {
  success: boolean;
  totalRecords: number;
}

/**
 * Exports current shop data (categories, products, stock_items, customers, orders, order_items)
 * as a JSON payload and presents the native share sheet.
 * Upon successful share, logs 'Backup exported' via log_event RPC.
 */
export async function exportShopBackup(): Promise<BackupExportResult> {
  // Purge any previously exported backup temp files
  await cleanupAppTempFiles('backup');

  const [
    categoriesRes,
    productsRes,
    stockItemsRes,
    customersRes,
    ordersRes,
    orderItemsRes,
  ] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('products').select('*').order('name'),
    supabase.from('stock_items').select('*').order('created_at'),
    supabase.from('customers').select('*').order('name'),
    supabase.from('orders').select('*').order('order_no'),
    supabase.from('order_items').select('*'),
  ]);

  // Check for any errors
  const errors = [
    categoriesRes.error,
    productsRes.error,
    stockItemsRes.error,
    customersRes.error,
    ordersRes.error,
    orderItemsRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(`Failed to read shop data: ${errors[0]?.message}`);
  }

  const categories = categoriesRes.data ?? [];
  const products = productsRes.data ?? [];
  const stockItems = stockItemsRes.data ?? [];
  const customers = customersRes.data ?? [];
  const orders = ordersRes.data ?? [];
  const orderItems = orderItemsRes.data ?? [];

  const totalRecords =
    categories.length +
    products.length +
    stockItems.length +
    customers.length +
    orders.length +
    orderItems.length;

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');

  const payload = {
    app: 'Fakhri Glass',
    format_version: '1.0',
    exported_at: now.toISOString(),
    record_counts: {
      categories: categories.length,
      products: products.length,
      stock_items: stockItems.length,
      customers: customers.length,
      orders: orders.length,
      order_items: orderItems.length,
      total: totalRecords,
    },
    data: {
      categories,
      products,
      stock_items: stockItems,
      customers,
      orders,
      order_items: orderItems,
    },
  };

  const jsonString = JSON.stringify(payload, null, 2);

  const backupUri = await stageBackupJson(jsonString, dateStr);
  const Sharing = getSharingModule();
  let shared = false;

  if (backupUri && Sharing && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(backupUri, {
      UTI: 'public.json',
      mimeType: 'application/json',
      dialogTitle: `Fakhri_Glass_Backup_${dateStr}.json`,
    });
    shared = true;
  } else {
    const shareResult = await Share.share({
      title: `Fakhri_Glass_Backup_${dateStr}.json`,
      message: jsonString,
    });
    if (shareResult.action === Share.sharedAction) {
      shared = true;
    }
  }

  if (shared) {
    await logEvent('Backup exported');
  }

  return {
    success: true,
    totalRecords,
  };
}
