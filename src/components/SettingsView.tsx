import React, { useState, useRef } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  X,
  FileCheck,
  Smartphone,
} from 'lucide-react';
import { NoteItem } from '../types';
import { saveAllNotesToStorage, getAllNotesFromStorage } from '../utils/fileStorage';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  notesCount?: number;
  notes?: NoteItem[];
  onClose?: () => void;
  onDataRestored?: () => Promise<void> | void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  notesCount = 0,
  notes = [],
  onClose,
  onDataRestored,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Export Notes to standard JSON file
  const handleExportNotes = async () => {
    try {
      setIsExporting(true);
      // Ensure we get latest notes directly from storage
      let allNotes = notes;
      if (!allNotes || allNotes.length === 0) {
        allNotes = await getAllNotesFromStorage();
      }

      const backupPayload = {
        app: 'StudyNotesPWA',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        notesCount: allNotes.length,
        notes: allNotes,
      };

      const jsonStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const downloadAnchor = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadAnchor.href = url;
      downloadAnchor.download = `notes-backup-${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      setStatusMessage({
        text: `فایل پشتیبان شامل ${allNotes.length} یادداشت با موفقیت دانلود شد.`,
        type: 'success',
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.warn('Export error:', err);
      setStatusMessage({ text: 'خطا در خروجی گرفتن از یادداشت‌ها.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  // 2. Import Notes from JSON file
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);

      let importedNotes: NoteItem[] = [];
      if (Array.isArray(parsed)) {
        importedNotes = parsed;
      } else if (parsed && Array.isArray(parsed.notes)) {
        importedNotes = parsed.notes;
      }

      if (importedNotes.length > 0) {
        // Save to IndexedDB and LocalStorage
        await saveAllNotesToStorage(importedNotes);
        try {
          localStorage.setItem('study_workspace_notes', JSON.stringify(importedNotes));
        } catch {}

        if (onDataRestored) {
          await onDataRestored();
        }

        setStatusMessage({
          text: `تعداد ${importedNotes.length} یادداشت با موفقیت بازیابی شد.`,
          type: 'success',
        });
        setTimeout(() => setStatusMessage(null), 4500);
      } else {
        setStatusMessage({ text: 'هیچ یادداشتی در این فایل یافت نشد.', type: 'error' });
      }
    } catch (err) {
      console.warn('Import error:', err);
      setStatusMessage({ text: 'قالب فایل انتخابی معتبر نیست (باید فایل JSON یادداشت‌ها باشد).', type: 'error' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 3. Clear all notes
  const handleClearAllNotes = async () => {
    if (window.confirm('آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها را پاک کنید؟ این عملیات غیرقابل بازگشت است.')) {
      try {
        await saveAllNotesToStorage([]);
        try {
          localStorage.removeItem('study_workspace_notes');
        } catch {}
        if (onDataRestored) {
          await onDataRestored();
        }
        setStatusMessage({ text: 'تمامی یادداشت‌ها با موفقیت پاک شدند.', type: 'success' });
        setTimeout(() => setStatusMessage(null), 3500);
      } catch (err) {
        console.warn('Clear error:', err);
        setStatusMessage({ text: 'خطا در پاکسازی داده‌ها.', type: 'error' });
      }
    }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col select-none overflow-hidden" dir="rtl">
      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileImport}
        accept=".json,application/json"
        className="hidden"
      />

      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
            <HardDrive className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-neutral-900">مدیریت داده‌ها و انتقال نوت‌ها</h2>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              اکسپورت (خروجی)، ایمپورت (بازیابی) و پشتیبان‌گیری محلی یادداشت‌ها
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center justify-center transition cursor-pointer"
            title="بستن و بازگشت به یادداشت‌ها"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto max-w-3xl mx-auto w-full space-y-6">
        {/* Status Toast Message */}
        {statusMessage && (
          <div
            className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-sm animate-fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* 1. Summary Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-500 block mb-1">تعداد یادداشت‌های ذخیره شده</span>
              <span className="text-2xl font-bold font-mono text-neutral-900">{notesCount}</span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-2xs">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-500 block mb-1">محل ذخیره‌سازی داده‌ها</span>
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mt-1">
                <ShieldCheck className="w-4 h-4" />
                IndexedDB داخلی مرورگر (۱۰۰٪ آفلاین)
              </span>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-emerald-600 shadow-2xs">
              <FileCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* 2. Export Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200/80 p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">خروجی گرفتن از نوت‌ها (Export)</h3>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed pr-9">
                دانلود یک فایل متنی سبک استاندارد (JSON) از تمام یادداشت‌ها جهت ذخیره روی حافظه آیفون، رایانه یا انتقال به دستگاه دیگر.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportNotes}
              disabled={isExporting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'در حال خروجی گرفتن...' : 'دانلود فایل پشتیبان (JSON)'}</span>
            </button>
          </div>
        </div>

        {/* 3. Import Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200/80 p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">وارد کردن نوت‌ها (Import)</h3>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed pr-9">
                انتخاب فایل JSON پشتیبان و بازگردانی فوری تمام یادداشت‌ها در حافظه برنامه بدون نیاز به اینترنت.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md active:scale-95 cursor-pointer shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>{isImporting ? 'در حال بازیابی...' : 'انتخاب فایل و ایمپورت'}</span>
            </button>
          </div>
        </div>

        {/* 4. Install App Box */}
        <div className="bg-neutral-50 rounded-2xl sm:rounded-3xl border border-neutral-200/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-neutral-900">نصب آفلاین روی آیفون / کامپیوتر</div>
              <div className="text-[11px] text-neutral-500">برای استفاده تمام‌صفحه و بدون نیاز به مرورگر</div>
            </div>
          </div>
          <PWAInstallButton variant="full" />
        </div>

        {/* 5. Clear Notes Danger Zone */}
        <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-rose-600">پاکسازی کامل نوت‌ها</h4>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              حذف تمامی یادداشت‌ها از حافظه مرورگر دستگاه
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearAllNotes}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>پاکسازی</span>
          </button>
        </div>
      </div>
    </div>
  );
};
