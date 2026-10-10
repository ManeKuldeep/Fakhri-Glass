import {
  cleanupAppTempFiles,
  stageLabelPdf,
  stageInvoicePdf,
  stageBackupJson,
  APP_TEMP_PREFIXES,
} from '../tempFileManager';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///data/user/0/com.fakhriglass.app/cache/',
  readDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  copyAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

describe('FINDING-02 [SEC-16]: Temporary App File Manager Lifecycle & Cleanup', () => {
  const mockCacheDir = 'file:///data/user/0/com.fakhriglass.app/cache/';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes only files created by this application matching app prefixes', async () => {
    const mockFiles = [
      'fakhri_label_123.pdf',
      'fakhri_invoice_456.pdf',
      'fakhri_backup_2026-10-10.json',
      'other_app_file.tmp',
      'image_picker_cache.jpg',
    ];

    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(mockFiles);

    await cleanupAppTempFiles('all');

    // Should delete 3 fakhri files, NOT other_app_file or image_picker
    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(3);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${mockCacheDir}fakhri_label_123.pdf`, {
      idempotent: true,
    });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${mockCacheDir}fakhri_invoice_456.pdf`, {
      idempotent: true,
    });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      `${mockCacheDir}fakhri_backup_2026-10-10.json`,
      { idempotent: true },
    );
  });

  it('cleans up specific file types (e.g. only label files before new generation)', async () => {
    const mockFiles = [
      'fakhri_label_123.pdf',
      'fakhri_invoice_456.pdf',
      'fakhri_backup_2026-10-10.json',
    ];

    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue(mockFiles);

    await cleanupAppTempFiles('label');

    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(1);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(`${mockCacheDir}fakhri_label_123.pdf`, {
      idempotent: true,
    });
  });

  it('stages label PDF and purges raw source output after copy', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    const rawPrintUri = 'file:///data/cache/Print/temp_print.pdf';

    const stagedUri = await stageLabelPdf(rawPrintUri);

    expect(stagedUri).toContain(APP_TEMP_PREFIXES.label);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: rawPrintUri,
      to: stagedUri,
    });
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(rawPrintUri, { idempotent: true });
  });

  it('stages invoice PDF into tracked cache directory', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    const rawPrintUri = 'file:///data/cache/Print/temp_invoice.pdf';

    const stagedUri = await stageInvoicePdf(rawPrintUri);

    expect(stagedUri).toContain(APP_TEMP_PREFIXES.invoice);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: rawPrintUri,
      to: stagedUri,
    });
  });

  it('writes backup JSON to tracked cache file', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const dest = await stageBackupJson('{"test": true}', '2026-10-10');

    expect(dest).toContain(`${APP_TEMP_PREFIXES.backup}2026-10-10.json`);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      dest,
      '{"test": true}',
      { encoding: 'utf8' },
    );
  });
});
