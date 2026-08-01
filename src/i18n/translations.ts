// One plain object per language — no i18n library. TypeScript checks every
// t('key') against `en`, and `id` must satisfy the same key set (enforced by
// the `Record<TranslationKey, string>` annotation), so a missing translation
// is a compile error.

export const en = {
  appTitle: 'Uang',
  loginTagline: 'Track income and expenses in your own Google Sheet — still works offline.',
  changeSheetLabel: 'Switch Google Sheet',
  changeSheetConfirm: 'Switch Google Sheet? The data cached on this device will be cleared.',
  dismissNotification: 'Dismiss notification',
  loadingGeneric: 'Loading...',
  loadingForm: 'Loading form...',

  // Summary
  balanceLabel: 'Balance',
  balanceAllTime: 'all time',
  incomeLabel: 'Income',
  expenseLabel: 'Expense',

  // Period
  periodBarLabel: 'Time period',
  periodLastMonth: 'Last month',
  periodThisMonth: 'This month',
  periodPickMonth: 'Pick a month',
  periodOnDate: 'On {date}',

  // Category filter
  categoryFilterLabel: 'Filter by category',
  filterAllLabel: 'All',
  uncategorized: 'Uncategorized',

  // Spending trend (always this calendar month vs last, whatever period is shown)
  trendLabel: 'Spending trend',
  trendDown: 'This month you have spent {amount} less than last month ({percent}% lower).',
  trendUp: 'This month you have spent {amount} more than last month ({percent}% higher).',
  trendSame: 'This month you have spent exactly the same as last month.',

  // Spending chart
  chartViewLabel: 'Chart view',
  chartActivity: 'Activity',
  chartBreakdown: 'Breakdown',
  breakdownTitle: 'Spending by category',
  breakdownTotal: 'total spent',
  breakdownOther: 'Other',
  breakdownEmpty: 'Nothing spent in this period.',

  // Heatmap
  heatmapTitle: 'Spending',
  heatmapLess: 'less',
  heatmapMore: 'more',
  heatmapDayTotal: '{date}: {amount}',
  heatmapClearFilter: 'Show all days',

  // List
  emptyTransactions: 'No transactions yet. Tap + to add your first one.',
  emptyDayFiltered: 'No transactions on this day.',
  emptyPeriodFiltered: 'No transactions in this period.',
  emptyCategoryFiltered: 'No transactions in this category.',
  relativeToday: 'Today',
  relativeYesterday: 'Yesterday',
  pendingTag: 'Not synced',
  deleteTransactionConfirm: 'Delete this transaction?',

  // Form
  addTitle: 'Add transaction',
  editTitle: 'Edit transaction',
  typeIncome: 'Income',
  typeExpense: 'Expense',
  fieldAmount: 'Amount',
  amountPlaceholder: '0',
  fieldCategory: 'Category',
  categoryPlaceholder: 'e.g. Food, Salary',
  fieldDate: 'Date',
  fieldNote: 'Note (optional)',
  notePlaceholder: 'e.g. Lunch with team',
  saveBtn: 'Save',
  savingBtn: 'Saving...',
  updateBtn: 'Update',
  cancelBtn: 'Cancel',
  deleteBtn: 'Delete',
  addFabLabel: 'Add transaction',

  // Navigation
  navLabel: 'Sections',
  navTransactions: 'Transactions',
  navAccounts: 'Accounts',

  // Accounts
  accountsEmpty: 'No accounts yet. Tap + to add one.',
  accountAddLabel: 'Add account',
  accountAddTitle: 'Add account',
  accountEditTitle: 'Edit account',
  accountFieldName: 'Name',
  accountNamePlaceholder: 'e.g. BCA, Cash, GoPay',
  accountFieldOwner: 'Owner (optional)',
  accountOwnerPlaceholder: 'e.g. Budi',
  accountFieldIcon: 'Icon (optional)',
  accountIconPlaceholder: 'e.g. 🏦',
  accountNoOwner: 'No owner',
  accountUnassigned: 'Unassigned',
  accountTotal: 'Total',
  accountNone: 'No account',
  fieldAccount: 'Account',
  accountDeleteConfirm: 'Delete this account?',
  accountNoOpeningBalance:
    'Balances count only what you have recorded here — they do not include money an account already held.',

  // Transfers
  transferAction: '⇄ Transfer between accounts',
  transferTitle: 'Transfer',
  transferFrom: 'From',
  transferTo: 'To',
  transferSubmit: 'Transfer',
  transferHistory: 'Transfers',
  transferSameAccount: 'Pick two different accounts.',
  transferDeleteConfirm: 'Delete this transfer?',

  // Failed changes
  failedCount: '{count} change(s) the sheet refused',
  failedRetry: 'Try again',
  failedDiscard: 'Discard',

  // Backup & restore
  menuLabel: 'More',
  backupMenuItem: 'Backup & restore',
  backupTitle: 'Backup & restore',
  backupExportHeading: 'Backup',
  backupExportHelp: 'Saves everything to a JSON file on this device.',
  backupExportBtn: 'Download backup',
  backupRestoreHeading: 'Restore',
  backupRestoreHelp: 'Adds rows from a backup file. Nothing is ever deleted.',
  backupChooseFile: 'Choose a file',
  backupRestoreBtn: 'Restore',
  backupRestoring: 'Restoring...',
  backupOfflineNote: 'Connect to the internet to restore a backup.',
  backupCountTransactions: '{total} transactions — {added} new, {skipped} already present',
  backupCountAccounts: '{total} accounts — {added} new, {skipped} already present',
  backupCountTransfers: '{total} transfers — {added} new, {skipped} already present',
  backupNothingToAdd: 'Everything in this file is already here.',
  backupDone: 'Restored {added} rows, skipped {skipped} already present.',
  backupErrNotJson: 'That file is not valid JSON.',
  backupErrNotBackup: 'That file is not a Uang backup.',
  backupErrTooNew: 'That backup was made by a newer version of this app.',
  backupErrMalformed: 'That backup file is damaged and cannot be read.',
  backupErrFailed: 'The restore failed: {reason}',

  // Sync
  syncOnline: 'Online',
  syncOffline: 'Offline',
  syncPendingChanges: '{count} pending',
  syncNowBtn: 'Sync now',
  syncSyncing: 'Syncing...',

  // Install prompt
  installPromptText: 'Add Uang to your home screen',
  installBtn: 'Install',
  installDismiss: 'Not now',
  iosInstallText:
    'Add {appName} to your Home Screen: tap the Share button, then choose "Add to Home Screen".',
  androidInstallText: 'Install {appName} on your home screen to open it directly, even offline.',
  closeBtn: 'Close',

  // Pull to refresh
  pullToRefresh: 'Pull to refresh',
  releaseToRefresh: 'Release to refresh',
  refreshing: 'Refreshing...',

  // Login
  webAppUrlLabel: 'Google Apps Script Web App URL',
  connectBtn: 'Connect',
  connecting: 'Connecting...',
  invalidUrlError: 'That does not look like an Apps Script Web App URL (should end in /exec).',
  helpSummary: 'How do I get this URL?',
  helpStep1: 'Create a Google Sheet you will own.',
  helpStep2: 'Open Extensions → Apps Script and paste the Code.gs from this project.',
  helpStep3: 'Deploy → New deployment → Web app, access "Anyone".',
  helpStep4: 'Copy the Web App URL (ends in /exec) and paste it above.',

  // Errors (used outside React by sheetApi)
  errNotConnected: 'Not connected to a Google Sheet yet.',
  errFetchFailed: 'Could not load transactions.',
  errActionFailed: 'The "{action}" action failed.',
  errSyncRejected: 'A change could not be saved to your sheet: {reason}',
  errSyncFailed: 'Could not reach your sheet to save pending changes.',
  errVerifyNetwork: 'Could not reach that URL. Check your connection and the URL.',
  errVerifyStatus: 'The URL responded with status {status}.',
  errVerifyInvalid: 'That URL is not a valid deployment for this app.'
} as const;

export type TranslationKey = keyof typeof en;

export const id: Record<TranslationKey, string> = {
  appTitle: 'Uang',
  loginTagline: 'Catat pemasukan dan pengeluaran di Google Sheet milikmu — tetap jalan offline.',
  changeSheetLabel: 'Ganti Google Sheet',
  changeSheetConfirm: 'Ganti Google Sheet? Data yang tersimpan di perangkat ini akan dihapus.',
  dismissNotification: 'Tutup notifikasi',
  loadingGeneric: 'Memuat...',
  loadingForm: 'Memuat formulir...',

  balanceLabel: 'Saldo',
  balanceAllTime: 'sepanjang waktu',
  incomeLabel: 'Pemasukan',
  expenseLabel: 'Pengeluaran',

  periodBarLabel: 'Periode waktu',
  periodLastMonth: 'Bulan lalu',
  periodThisMonth: 'Bulan ini',
  periodPickMonth: 'Pilih bulan',
  periodOnDate: 'Pada {date}',

  categoryFilterLabel: 'Saring menurut kategori',
  filterAllLabel: 'Semua',
  uncategorized: 'Tanpa kategori',

  trendLabel: 'Tren pengeluaran',
  trendDown: 'Bulan ini kamu menghabiskan {amount} lebih sedikit dari bulan lalu ({percent}% lebih rendah).',
  trendUp: 'Bulan ini kamu menghabiskan {amount} lebih banyak dari bulan lalu ({percent}% lebih tinggi).',
  trendSame: 'Bulan ini kamu menghabiskan jumlah yang sama persis dengan bulan lalu.',

  chartViewLabel: 'Tampilan grafik',
  chartActivity: 'Aktivitas',
  chartBreakdown: 'Rincian',
  breakdownTitle: 'Pengeluaran per kategori',
  breakdownTotal: 'total pengeluaran',
  breakdownOther: 'Lainnya',
  breakdownEmpty: 'Tidak ada pengeluaran pada periode ini.',

  heatmapTitle: 'Pengeluaran',
  heatmapLess: 'sedikit',
  heatmapMore: 'banyak',
  heatmapDayTotal: '{date}: {amount}',
  heatmapClearFilter: 'Tampilkan semua hari',

  emptyTransactions: 'Belum ada transaksi. Ketuk + untuk menambahkan.',
  emptyDayFiltered: 'Tidak ada transaksi pada hari ini.',
  emptyPeriodFiltered: 'Tidak ada transaksi pada periode ini.',
  emptyCategoryFiltered: 'Tidak ada transaksi pada kategori ini.',
  relativeToday: 'Hari ini',
  relativeYesterday: 'Kemarin',
  pendingTag: 'Belum tersinkron',
  deleteTransactionConfirm: 'Hapus transaksi ini?',

  addTitle: 'Tambah transaksi',
  editTitle: 'Ubah transaksi',
  typeIncome: 'Pemasukan',
  typeExpense: 'Pengeluaran',
  fieldAmount: 'Jumlah',
  amountPlaceholder: '0',
  fieldCategory: 'Kategori',
  categoryPlaceholder: 'mis. Makan, Gaji',
  fieldDate: 'Tanggal',
  fieldNote: 'Catatan (opsional)',
  notePlaceholder: 'mis. Makan siang bersama tim',
  saveBtn: 'Simpan',
  savingBtn: 'Menyimpan...',
  updateBtn: 'Perbarui',
  cancelBtn: 'Batal',
  deleteBtn: 'Hapus',
  addFabLabel: 'Tambah transaksi',

  navLabel: 'Bagian',
  navTransactions: 'Transaksi',
  navAccounts: 'Akun',

  accountsEmpty: 'Belum ada akun. Ketuk + untuk menambahkan.',
  accountAddLabel: 'Tambah akun',
  accountAddTitle: 'Tambah akun',
  accountEditTitle: 'Ubah akun',
  accountFieldName: 'Nama',
  accountNamePlaceholder: 'mis. BCA, Tunai, GoPay',
  accountFieldOwner: 'Pemilik (opsional)',
  accountOwnerPlaceholder: 'mis. Budi',
  accountFieldIcon: 'Ikon (opsional)',
  accountIconPlaceholder: 'mis. 🏦',
  accountNoOwner: 'Tanpa pemilik',
  accountUnassigned: 'Tanpa akun',
  accountTotal: 'Total',
  accountNone: 'Tanpa akun',
  fieldAccount: 'Akun',
  accountDeleteConfirm: 'Hapus akun ini?',
  accountNoOpeningBalance:
    'Saldo hanya menghitung yang kamu catat di sini — belum termasuk uang yang sudah ada sebelumnya.',

  transferAction: '⇄ Transfer antar akun',
  transferTitle: 'Transfer',
  transferFrom: 'Dari',
  transferTo: 'Ke',
  transferSubmit: 'Transfer',
  transferHistory: 'Transfer',
  transferSameAccount: 'Pilih dua akun yang berbeda.',
  transferDeleteConfirm: 'Hapus transfer ini?',

  failedCount: '{count} perubahan ditolak oleh sheet',
  failedRetry: 'Coba lagi',
  failedDiscard: 'Buang',

  menuLabel: 'Lainnya',
  backupMenuItem: 'Cadangkan & pulihkan',
  backupTitle: 'Cadangkan & pulihkan',
  backupExportHeading: 'Cadangkan',
  backupExportHelp: 'Menyimpan semua data ke berkas JSON di perangkat ini.',
  backupExportBtn: 'Unduh cadangan',
  backupRestoreHeading: 'Pulihkan',
  backupRestoreHelp: 'Menambahkan baris dari berkas cadangan. Tidak ada yang dihapus.',
  backupChooseFile: 'Pilih berkas',
  backupRestoreBtn: 'Pulihkan',
  backupRestoring: 'Memulihkan...',
  backupOfflineNote: 'Hubungkan ke internet untuk memulihkan cadangan.',
  backupCountTransactions: '{total} transaksi — {added} baru, {skipped} sudah ada',
  backupCountAccounts: '{total} akun — {added} baru, {skipped} sudah ada',
  backupCountTransfers: '{total} transfer — {added} baru, {skipped} sudah ada',
  backupNothingToAdd: 'Semua isi berkas ini sudah ada di sini.',
  backupDone: 'Memulihkan {added} baris, melewati {skipped} yang sudah ada.',
  backupErrNotJson: 'Berkas itu bukan JSON yang valid.',
  backupErrNotBackup: 'Berkas itu bukan cadangan Uang.',
  backupErrTooNew: 'Cadangan itu dibuat oleh versi aplikasi yang lebih baru.',
  backupErrMalformed: 'Berkas cadangan itu rusak dan tidak dapat dibaca.',
  backupErrFailed: 'Pemulihan gagal: {reason}',

  syncOnline: 'Online',
  syncOffline: 'Offline',
  syncPendingChanges: '{count} menunggu',
  syncNowBtn: 'Sinkron sekarang',
  syncSyncing: 'Menyinkronkan...',

  installPromptText: 'Tambahkan Uang ke layar utama',
  installBtn: 'Pasang',
  installDismiss: 'Nanti',
  iosInstallText:
    'Tambahkan {appName} ke Layar Utama: ketuk tombol Bagikan, lalu pilih "Add to Home Screen".',
  androidInstallText: 'Pasang {appName} di layar utama supaya bisa dibuka langsung, termasuk saat offline.',
  closeBtn: 'Tutup',

  // Pull to refresh
  pullToRefresh: 'Tarik untuk menyegarkan',
  releaseToRefresh: 'Lepas untuk menyegarkan',
  refreshing: 'Menyegarkan...',

  webAppUrlLabel: 'URL Web App Google Apps Script',
  connectBtn: 'Hubungkan',
  connecting: 'Menghubungkan...',
  invalidUrlError: 'Itu tidak tampak seperti URL Web App Apps Script (harus diakhiri /exec).',
  helpSummary: 'Bagaimana cara mendapatkan URL ini?',
  helpStep1: 'Buat Google Sheet milikmu sendiri.',
  helpStep2: 'Buka Ekstensi → Apps Script dan tempel Code.gs dari proyek ini.',
  helpStep3: 'Deploy → New deployment → Web app, akses "Anyone".',
  helpStep4: 'Salin URL Web App (diakhiri /exec) dan tempel di atas.',

  errNotConnected: 'Belum terhubung ke Google Sheet.',
  errFetchFailed: 'Tidak dapat memuat transaksi.',
  errActionFailed: 'Aksi "{action}" gagal.',
  errSyncRejected: 'Sebuah perubahan tidak dapat disimpan ke sheet-mu: {reason}',
  errSyncFailed: 'Tidak dapat menjangkau sheet-mu untuk menyimpan perubahan tertunda.',
  errVerifyNetwork: 'Tidak dapat menjangkau URL itu. Periksa koneksi dan URL-nya.',
  errVerifyStatus: 'URL merespons dengan status {status}.',
  errVerifyInvalid: 'URL itu bukan deployment yang valid untuk aplikasi ini.'
};

export const translations = { en, id };
