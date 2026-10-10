import * as FileSystem from 'expo-file-system/legacy';

export const APP_TEMP_PREFIXES = {
  label: 'fakhri_label_',
  invoice: 'fakhri_invoice_',
  backup: 'fakhri_backup_',
} as const;

export type AppTempFileType = 'label' | 'invoice' | 'backup' | 'all';

/**
 * Deletes previously generated temporary files created by this application
 * in the device's cache directory.
 * Only touches files matching this app's prefixes (`fakhri_*`).
 */
export async function cleanupAppTempFiles(type: AppTempFileType = 'all'): Promise<void> {
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return;

    const entries = await FileSystem.readDirectoryAsync(cacheDir);

    const targetPrefixes: string[] =
      type === 'all'
        ? Object.values(APP_TEMP_PREFIXES)
        : [APP_TEMP_PREFIXES[type]];

    for (const entry of entries) {
      const isTarget = targetPrefixes.some((p) => entry.startsWith(p));
      if (isTarget) {
        const fileUri = `${cacheDir}${entry}`;
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    }
  } catch (err) {
    // Non-blocking cleanup: never crash the UI if deletion fails
    console.warn('Failed to cleanup app temp files:', err);
  }
}

/**
 * Prepares a newly generated label PDF: cleans previous label files,
 * stages the newly generated PDF to a tracked app cache file, and cleans the initial file.
 */
export async function stageLabelPdf(sourceUri: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return sourceUri;

  await cleanupAppTempFiles('label');

  const destUri = `${cacheDir}${APP_TEMP_PREFIXES.label}${Date.now()}.pdf`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (sourceUri !== destUri) {
      await FileSystem.deleteAsync(sourceUri, { idempotent: true });
    }
    return destUri;
  } catch {
    return sourceUri;
  }
}

/**
 * Prepares a newly generated invoice PDF: cleans previous invoice files,
 * stages to tracked app cache file, and returns the new URI.
 */
export async function stageInvoicePdf(sourceUri: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return sourceUri;

  await cleanupAppTempFiles('invoice');

  const destUri = `${cacheDir}${APP_TEMP_PREFIXES.invoice}${Date.now()}.pdf`;
  try {
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (sourceUri !== destUri) {
      await FileSystem.deleteAsync(sourceUri, { idempotent: true });
    }
    return destUri;
  } catch {
    return sourceUri;
  }
}

/**
 * Writes backup JSON to a tracked temp file in cache directory,
 * after purging any previously exported backups.
 */
export async function stageBackupJson(jsonString: string, dateStr: string): Promise<string | null> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return null;

  await cleanupAppTempFiles('backup');

  const destUri = `${cacheDir}${APP_TEMP_PREFIXES.backup}${dateStr}.json`;
  try {
    await FileSystem.writeAsStringAsync(destUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return destUri;
  } catch {
    return null;
  }
}
