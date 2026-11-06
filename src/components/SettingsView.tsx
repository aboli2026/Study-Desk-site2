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
  StickyNote,
  BookOpen,
} from 'lucide-react';
import { NoteItem, StudyFile, StickyNoteItem } from '../types';
import {
  saveAllNotesToStorage,
  getAllNotesFromStorage,
  getAllStudyFiles,
  saveStudyFileToStorage,
  saveFileEditsToStorage,
  getAllTasksFromStorage,
  saveAllTasksToStorage,
  clearStudyFilesAndEditsStorage,
} from '../utils/fileStorage';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  notesCount?: number;
  notes?: NoteItem[];
  studyFiles?: StudyFile[];
  stickyNotesCount?: number;
  onClose?: () => void;
  onDataRestored?: () => Promise<void> | void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  notesCount = 0,
  notes = [],
  studyFiles = [],
  stickyNotesCount = 0,
  onClose,
  onDataRestored,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Export Notes & Sticky Notes & Files to standard JSON file
  const handleExportNotes = async () => {
    try {
      setIsExporting(true);
      // Ensure we get latest notes directly from storage
      let allNotes = notes;
      if (!allNotes || allNotes.length === 0) {
        allNotes = await getAllNotesFromStorage();
      }

      let allFiles = studyFiles;
      if (!allFiles || allFiles.length === 0) {
        allFiles = await getAllStudyFiles();
      }

      // Collect all sticky notes from files
      const flattenedStickyNotes: (StickyNoteItem & { fileId: string; fileName: string })[] = [];
      allFiles.forEach((file) => {
        (file.stickyNotes || []).forEach((sn) => {
          flattenedStickyNotes.push({
            ...sn,
            fileId: file.id,
            fileName: file.name,
          });
        });
      });

      const tasks = getAllTasksFromStorage();
      let folders: any[] = [];
      try {
        const savedFolders = localStorage.getItem('study_workspace_folders');
        if (savedFolders) folders = JSON.parse(savedFolders);
      } catch {}

      const backupPayload = {
        app: 'StudyNotesPWA',
        signature: 'STUDY_DESK_WORKSPACE_BACKUP_V1',
        version: '2.0',
        exportedAt: new Date().toISOString(),
        stats: {
          notesCount: allNotes.length,
          stickyNotesCount: flattenedStickyNotes.length,
          filesCount: allFiles.length,
          tasksCount: tasks.length,
        },
        notes: allNotes,
        stickyNotes: flattenedStickyNotes,
        files: allFiles.map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size || 0,
          uploadDate: f.uploadDate || new Date().toISOString(),
          lastModified: f.lastModified,
          currentPage: f.currentPage || 1,
          pageCount: f.pageCount,
          stickyNotes: f.stickyNotes || [],
          edits: {
            fileId: f.id,
            stickyNotes: f.stickyNotes || [],
            pageStrokes: f.pageStrokes || {},
            currentPage: f.currentPage || 1,
            pageCount: f.pageCount,
            updatedAt: f.lastModified || new Date().toISOString(),
          },
        })),
        tasks,
        folders,
      };

      const jsonStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const downloadAnchor = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadAnchor.href = url;
      downloadAnchor.download = `StudyDesk_Backup_${dateStr}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);

      setStatusMessage({
        text: `فایل پشتیبان کامل شامل ${allNotes.length} یادداشت متنی و ${flattenedStickyNotes.length} استیکی‌نوت با موفقیت دانلود شد.`,
        type: 'success',
      });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.warn('Export error:', err);
      setStatusMessage({ text: 'خطا در خروجی گرفتن از داده‌ها.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  // 2. Import Notes & Sticky Notes from JSON / Backup file
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);

      let importedNotes: NoteItem[] = [];
      const extractedStickyNotes: (StickyNoteItem & { fileId?: string; fileName?: string })[] = [];
      const importedFiles: StudyFile[] = [];

      // 1. If parsed is a top-level array
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            if ('pageNumber' in item || 'color' in item || 'textColor' in item || 'x' in item) {
              extractedStickyNotes.push(item);
            } else if ('title' in item || 'content' in item) {
              importedNotes.push(item);
            }
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        // 2. Extract regular notes
        if (Array.isArray(parsed.notes)) {
          importedNotes = parsed.notes;
        }

        // 3. Extract direct sticky notes
        const directSticky = parsed.stickyNotes || parsed.sticky_notes;
        if (Array.isArray(directSticky)) {
          for (const item of directSticky) {
            if (item && typeof item === 'object') {
              if (item.note && typeof item.note === 'object') {
                extractedStickyNotes.push({
                  ...item.note,
                  fileId: item.fileId,
                  fileName: item.fileName,
                });
              } else {
                extractedStickyNotes.push(item);
              }
            }
          }
        }

        // 4. Extract from parsed.files
        if (Array.isArray(parsed.files)) {
          for (const f of parsed.files) {
            const fileId = f.id || `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const fileName = f.name || 'کتاب یا جزوه';
            const fileStickyNotes: StickyNoteItem[] =
              f.stickyNotes ||
              f.edits?.stickyNotes ||
              [];

            let buffer = new ArrayBuffer(0);
            if (f.dataBase64) {
              try {
                const binStr = atob(f.dataBase64);
                const bytes = new Uint8Array(binStr.length);
                for (let j = 0; j < binStr.length; j++) bytes[j] = binStr.charCodeAt(j);
                buffer = bytes.buffer;
              } catch {}
            }

            importedFiles.push({
              id: fileId,
              name: fileName,
              size: f.size || buffer.byteLength || 0,
              data: buffer,
              originalData: buffer.slice(0),
              uploadDate: f.uploadDate || new Date().toISOString(),
              lastModified: f.lastModified || new Date().toISOString(),
              currentPage: f.currentPage || f.edits?.currentPage || 1,
              pageCount: f.pageCount || f.edits?.pageCount || 1,
              scale: f.scale || 1.2,
              category: f.category,
              tags: f.tags,
              isFavorite: f.isFavorite,
              stickyNotes: fileStickyNotes,
              pageStrokes: f.pageStrokes || f.edits?.pageStrokes || {},
            });

            fileStickyNotes.forEach((sn) => {
              extractedStickyNotes.push({ ...sn, fileId, fileName });
            });
          }
        }
      }

      // 5. Ensure sticky notes are linked to study files so they show in "استیکی‌نوت‌ها" tab
      if (extractedStickyNotes.length > 0) {
        const fileGroups = new Map<string, { fileName: string; notes: StickyNoteItem[] }>();

        for (const sn of extractedStickyNotes) {
          const fId = sn.fileId || 'default_sticky_workspace';
          const fName = sn.fileName || 'یادداشت‌های چسبان (استیکی‌نوت)';
          if (!fileGroups.has(fId)) {
            fileGroups.set(fId, { fileName: fName, notes: [] });
          }
          const group = fileGroups.get(fId)!;
          if (!group.notes.some((existing) => existing.id === sn.id)) {
            group.notes.push(sn);
          }
        }

        for (const [fId, group] of fileGroups.entries()) {
          let existingFile = importedFiles.find((f) => f.id === fId);
          if (!existingFile) {
            existingFile = {
              id: fId,
              name: group.fileName,
              size: 0,
              data: new ArrayBuffer(0),
              uploadDate: new Date().toISOString(),
              stickyNotes: group.notes,
              currentPage: 1,
              pageCount: 1,
            };
            importedFiles.push(existingFile);
          } else {
            existingFile.stickyNotes = group.notes;
          }
        }
      }

      let somethingRestored = false;

      // Save imported regular notes
      if (importedNotes.length > 0) {
        await saveAllNotesToStorage(importedNotes);
        try {
          localStorage.setItem('study_workspace_notes', JSON.stringify(importedNotes));
        } catch {}
        somethingRestored = true;
      }

      // Save imported files and sticky notes
      if (importedFiles.length > 0) {
        for (const file of importedFiles) {
          await saveStudyFileToStorage(file);
          await saveFileEditsToStorage(file.id, {
            fileId: file.id,
            pageStrokes: file.pageStrokes || {},
            stickyNotes: file.stickyNotes || [],
            currentPage: file.currentPage || 1,
            pageCount: file.pageCount || 1,
            scale: file.scale || 1.2,
            updatedAt: new Date().toISOString(),
          });
          try {
            localStorage.setItem(`study_notes_${file.id}`, JSON.stringify(file.stickyNotes || []));
          } catch {}
        }
        somethingRestored = true;
      }

      // Save tasks if present
      if (parsed && Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
        saveAllTasksToStorage(parsed.tasks);
      }

      // Save folders if present
      if (parsed && Array.isArray(parsed.folders) && parsed.folders.length > 0) {
        try {
          localStorage.setItem('study_workspace_folders', JSON.stringify(parsed.folders));
        } catch {}
      }

      if (somethingRestored) {
        if (onDataRestored) {
          await onDataRestored();
        }

        const parts: string[] = [];
        if (importedNotes.length > 0) parts.push(`${importedNotes.length} یادداشت`);
        if (extractedStickyNotes.length > 0) parts.push(`${extractedStickyNotes.length} استیکی‌نوت`);
        if (importedFiles.length > 0) parts.push(`${importedFiles.length} فایل/دفترچه`);

        setStatusMessage({
          text: `بازیابی با موفقیت انجام شد: ${parts.join('، ')}.`,
          type: 'success',
        });
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({ text: 'هیچ یادداشت یا استیکی‌نوتی در این فایل یافت نشد.', type: 'error' });
      }
    } catch (err) {
      console.warn('Import error:', err);
      setStatusMessage({ text: 'قالب فایل انتخابی معتبر نیست (باید فایل JSON پشتیبان باشد).', type: 'error' });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 3. Clear all notes and sticky notes
  const handleClearAllNotes = async () => {
    if (window.confirm('آیا مطمئن هستید که می‌خواهید تمام یادداشت‌ها و استیکی‌نوت‌ها را پاک کنید؟ این عملیات غیرقابل بازگشت است.')) {
      try {
        await saveAllNotesToStorage([]);
        await clearStudyFilesAndEditsStorage();
        try {
          localStorage.removeItem('study_workspace_notes');
          localStorage.removeItem('study_workspace_folders');
        } catch {}
        if (onDataRestored) {
          await onDataRestored();
        }
        setStatusMessage({ text: 'تمامی یادداشت‌ها و استیکی‌نوت‌ها با موفقیت پاک شدند.', type: 'success' });
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
        accept=".json,application/json,.studybackup,text/plain"
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
              اکسپورت، ایمپورت و پشتیبان‌گیری کامل یادداشت‌ها، استیکی‌نوت‌ها و فایل‌ها
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

        {/* 1. Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-500 block mb-1">یادداشت‌های متنی</span>
              <span className="text-2xl font-bold font-mono text-neutral-900">{notesCount}</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 shadow-2xs">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-500 block mb-1">استیکی‌نوت‌ها</span>
              <span className="text-2xl font-bold font-mono text-amber-600">{stickyNotesCount}</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-amber-600 shadow-2xs">
              <StickyNote className="w-5 h-5 text-amber-500" />
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-neutral-50 border border-neutral-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-500 block mb-1">کتاب‌ها و جزوه‌ها</span>
              <span className="text-2xl font-bold font-mono text-neutral-900">{studyFiles.length}</span>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center text-emerald-600 shadow-2xs">
              <BookOpen className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>

        {/* 2. Storage Banner */}
        <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs font-bold text-emerald-900">
              محل ذخیره‌سازی: پایگاه داده IndexedDB داخلی مرورگر (۱۰۰٪ آفلاین و دائمی)
            </div>
          </div>
          <FileCheck className="w-5 h-5 text-emerald-600 shrink-0 hidden sm:block" />
        </div>

        {/* 3. Export Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200/80 p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">پشتیبان‌گیری کامل (یادداشت‌ها + استیکی‌نوت‌ها)</h3>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed pr-9">
                دانلود یک فایل استاندارد (JSON) از تمام یادداشت‌های متنی، استیکی‌نوت‌ها و فایل‌ها جهت انتقال امن به گوشی، کامپیوتر یا مرورگر دیگر.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportNotes}
              disabled={isExporting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'در حال خروجی گرفتن...' : 'دانلود فایل پشتیبان کامل'}</span>
            </button>
          </div>
        </div>

        {/* 4. Import Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-neutral-200/80 p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">بازیابی یادداشت‌ها و استیکی‌نوت‌ها (Import)</h3>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed pr-9">
                انتخاب فایل پشتیبان (JSON یا studybackup) و بازگردانی سریع تمام یادداشت‌ها، استیکی‌نوت‌ها، پوشه‌ها و تسک‌ها.
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

        {/* 5. Install App Box */}
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

        {/* 6. Clear Notes Danger Zone */}
        <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-rose-600">پاکسازی کامل داده‌ها</h4>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              حذف تمامی یادداشت‌ها، استیکی‌نوت‌ها و فایل‌ها از حافظه مرورگر دستگاه
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearAllNotes}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>پاکسازی کامل</span>
          </button>
        </div>
      </div>
    </div>
  );
};

