"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Profile {
  id: string;
  name: string;
  pin: string;
}

interface ParsedRecord {
  rowIndex: number;
  rawPin: string;
  rawDate: string;
  rawStatus: string;
  rawPunchIn: string;
  rawPunchOut: string;
  rawNotes: string;
  // Resolved & Validated fields
  userId: string | null;
  userName: string | null;
  formattedDate: string | null;
  status: 'Present' | 'WFH' | 'Leave' | 'Absent';
  punchInIso: string | null;
  punchOutIso: string | null;
  notes: string;
  // Validation status
  isValid: boolean;
  isDuplicate: boolean;
  existingRecordId: string | null;
  errors: string[];
}

interface BulkAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profiles: Profile[];
}

export default function BulkAttendanceModal({
  isOpen,
  onClose,
  onSuccess,
  profiles,
}: BulkAttendanceModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite' | 'insert_all'>('skip');
  const [uploadResult, setUploadResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number } | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setParsedRecords([]);
      setIsParsing(false);
      setIsUploading(false);
      setUploadResult(null);
      setGeneralError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Helper: Download Sample CSV Template
  const handleDownloadTemplate = () => {
    const csvContent = `pin,date,status,punch_in,punch_out,notes
1001,2026-07-01,Present,09:00,18:00,On time shift
1002,2026-07-01,WFH,09:30,18:30,Work from home
1003,2026-07-01,Leave,,,Approved annual leave
1001,2026-07-02,Present,08:55,17:55,Regular shift`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'attendance_bulk_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper: Normalize Date to YYYY-MM-DD
  const normalizeDate = (rawDate: string): string | null => {
    if (!rawDate) return null;
    const cleanDate = rawDate.trim();
    // Case 1: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      const d = new Date(cleanDate);
      if (!isNaN(d.getTime())) return cleanDate;
    }
    // Case 2: DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = cleanDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, '0');
      const month = ddmmyyyy[2].padStart(2, '0');
      const year = ddmmyyyy[3];
      return `${year}-${month}-${day}`;
    }
    // Case 3: MM/DD/YYYY
    const mmddyyyy = cleanDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
      const d = new Date(cleanDate);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return null;
  };

  // Helper: Combine Date + Time string into ISO string
  const combineDateAndTime = (dateStr: string, timeStr: string): string | null => {
    if (!timeStr || !timeStr.trim()) return null;
    const cleanTime = timeStr.trim();
    
    const isPm = /pm/i.test(cleanTime);
    const isAm = /am/i.test(cleanTime);
    let timeWithoutPeriod = cleanTime.replace(/am|pm/gi, '').trim();

    const parts = timeWithoutPeriod.split(':');
    if (parts.length < 2) return null;

    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parts[2] ? parseInt(parts[2], 10) : 0;

    if (isNaN(hours) || isNaN(minutes)) return null;

    if (isPm && hours < 12) hours += 12;
    if (isAm && hours === 12) hours = 0;

    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    const isoString = `${dateStr}T${formattedTime}`;
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  // Helper: CSV Line Parser supporting quotes
  const parseCsvText = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        lines.push(currentRow);
      }
    }

    return lines;
  };

  // Handle CSV File Selection & Pre-Flight Validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsParsing(true);
    setGeneralError(null);
    setUploadResult(null);

    try {
      const text = await selectedFile.text();
      const rows = parseCsvText(text);

      if (rows.length < 2) {
        throw new Error('CSV file appears empty or missing header row.');
      }

      const headers = rows[0].map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, ''));
      
      const pinIndex = headers.findIndex(h => h === 'pin' || h === 'user_pin' || h.includes('pin'));
      const dateIndex = headers.findIndex(h => h === 'date' || h.includes('date'));
      const statusIndex = headers.findIndex(h => h === 'status' || h.includes('status'));
      const inIndex = headers.findIndex(h => h === 'punch_in' || h === 'punchin' || h === 'in_time' || h === 'intime' || h === 'in' || (h.includes('in') && !h.includes('pin')));
      const outIndex = headers.findIndex(h => h === 'punch_out' || h === 'punchout' || h === 'out_time' || h === 'outtime' || h === 'out' || (h.includes('out') && !h.includes('about')));
      const notesIndex = headers.findIndex(h => h === 'notes' || h === 'note' || h.includes('note') || h.includes('remark'));

      if (pinIndex === -1 || dateIndex === -1) {
        throw new Error('CSV headers must include at least "pin" and "date" columns.');
      }

      const uniqueDates = Array.from(new Set(rows.slice(1).map(r => normalizeDate(r[dateIndex])).filter(Boolean) as string[]));
      let existingLogs: { id: string; user_id: string; date: string }[] = [];

      if (uniqueDates.length > 0) {
        const { data: dbLogs } = await supabase
          .from('attendance')
          .select('id, user_id, date')
          .in('date', uniqueDates);
        if (dbLogs) existingLogs = dbLogs;
      }

      const parsed: ParsedRecord[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rawPin = row[pinIndex] || '';
        const rawDate = row[dateIndex] || '';
        const rawStatus = statusIndex !== -1 ? row[statusIndex] || 'Present' : 'Present';
        const rawPunchIn = inIndex !== -1 ? row[inIndex] || '' : '';
        const rawPunchOut = outIndex !== -1 ? row[outIndex] || '' : '';
        let rawNotes = notesIndex !== -1 ? row[notesIndex] || '' : '';

        const errors: string[] = [];

        // 1. PIN Validation
        const cleanPin = rawPin.trim();
        const profileMatch = profiles.find(p => p.pin.trim() === cleanPin);
        if (!profileMatch) {
          errors.push(`PIN "${rawPin}" not found in profiles`);
        }

        // 2. Date Validation
        const formattedDate = normalizeDate(rawDate);
        if (!formattedDate) {
          errors.push(`Invalid date format "${rawDate}" (use YYYY-MM-DD)`);
        }

        // 3. Robust Status Normalization & Tolerance
        let status: 'Present' | 'WFH' | 'Leave' | 'Absent' = 'Present';
        const normStatus = rawStatus.trim().toLowerCase();

        if (normStatus.includes('wfh') || normStatus.includes('home')) {
          status = 'WFH';
        } else if (normStatus.includes('leave')) {
          status = 'Leave';
        } else if (normStatus.includes('half') || normStatus.includes('halh')) {
          status = 'Leave'; // Map half days to Leave with auto note
          if (!rawNotes) rawNotes = rawStatus.trim();
        } else if (normStatus.includes('absent') || normStatus === '-' || normStatus === '') {
          status = 'Absent';
        } else {
          status = 'Present';
        }

        // 4. Punch Times Validation
        let punchInIso: string | null = null;
        let punchOutIso: string | null = null;

        // Clear punch times for Absent or full Leave
        if (status === 'Present' || status === 'WFH') {
          if (rawPunchIn) {
            punchInIso = combineDateAndTime(formattedDate || '', rawPunchIn);
            if (!punchInIso && formattedDate) errors.push(`Invalid Punch In time "${rawPunchIn}"`);
          } else if (formattedDate) {
            punchInIso = combineDateAndTime(formattedDate, '09:00');
          }

          if (rawPunchOut && formattedDate) {
            punchOutIso = combineDateAndTime(formattedDate, rawPunchOut);
            if (!punchOutIso) errors.push(`Invalid Punch Out time "${rawPunchOut}"`);
          }
        }

        if (punchInIso && punchOutIso && new Date(punchOutIso).getTime() <= new Date(punchInIso).getTime()) {
          errors.push('Punch Out time must be later than Punch In time');
        }

        // 5. Check Duplicate in existing database records
        let isDuplicate = false;
        let existingRecordId: string | null = null;
        if (profileMatch && formattedDate) {
          const matchLog = existingLogs.find(l => l.user_id === profileMatch.id && l.date === formattedDate);
          if (matchLog) {
            isDuplicate = true;
            existingRecordId = matchLog.id;
          }
        }

        parsed.push({
          rowIndex: i,
          rawPin,
          rawDate,
          rawStatus,
          rawPunchIn,
          rawPunchOut,
          rawNotes,
          userId: profileMatch ? profileMatch.id : null,
          userName: profileMatch ? profileMatch.name : null,
          formattedDate,
          status,
          punchInIso,
          punchOutIso,
          notes: rawNotes.trim() || (status === 'WFH' ? 'Work From Home' : status === 'Leave' ? 'On Leave' : 'Bulk Import'),
          isValid: errors.length === 0,
          isDuplicate,
          existingRecordId,
          errors,
        });
      }

      setParsedRecords(parsed);
    } catch (err: any) {
      console.error('CSV parse error:', err);
      setGeneralError(err.message || 'Failed to parse CSV file.');
    } finally {
      setIsParsing(false);
    }
  };

  // Perform Bulk Upload / Import Execution
  const handleStartUpload = async () => {
    const validRecords = parsedRecords.filter(r => r.isValid);
    if (validRecords.length === 0) {
      setGeneralError('No valid records available to upload.');
      return;
    }

    setIsUploading(true);
    setGeneralError(null);
    setUploadProgress({ current: 0, total: validRecords.length });

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < validRecords.length; i++) {
        const record = validRecords[i];
        setUploadProgress({ current: i + 1, total: validRecords.length });

        if (record.isDuplicate && conflictStrategy === 'skip') {
          skippedCount++;
          continue;
        }

        const payload: any = {
          user_id: record.userId,
          date: record.formattedDate,
          punch_in: record.punchInIso,
          punch_out: record.punchOutIso,
          status: record.status,
          notes: record.notes,
        };

        if (record.isDuplicate && conflictStrategy === 'overwrite' && record.existingRecordId) {
          const { error: updateErr } = await supabase
            .from('attendance')
            .update(payload)
            .eq('id', record.existingRecordId);

          if (updateErr) {
            console.error('Update error:', updateErr);
            failedCount++;
          } else {
            updatedCount++;
          }
        } else {
          const { error: insertErr } = await supabase
            .from('attendance')
            .insert(payload);

          if (insertErr) {
            console.error('Insert error:', insertErr);
            failedCount++;
          } else {
            insertedCount++;
          }
        }
      }

      setUploadResult({
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
        failed: failedCount,
      });

      onSuccess();
    } catch (err: any) {
      console.error('Upload error:', err);
      setGeneralError(err.message || 'Error occurred during bulk upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const validCount = parsedRecords.filter(r => r.isValid).length;
  const invalidCount = parsedRecords.filter(r => !r.isValid).length;
  const duplicateCount = parsedRecords.filter(r => r.isValid && r.isDuplicate).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl space-y-6 border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-100 text-purple-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </span>
              Bulk Attendance CSV Import
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Upload historical attendance records for multiple team members without corrupting current database logs.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-6 overflow-y-auto pr-1 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/30 p-5 text-center transition-all hover:bg-purple-50/60">
              <input
                type="file"
                accept=".csv, .tsv, .txt"
                onChange={handleFileChange}
                disabled={isParsing || isUploading}
                id="csv-file-input"
                className="hidden"
              />
              <label htmlFor="csv-file-input" className="cursor-pointer space-y-2 block">
                <div className="mx-auto h-10 w-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-lg">
                  📁
                </div>
                <div>
                  <span className="text-xs font-bold text-purple-800 block">
                    {file ? file.name : 'Click to select CSV File or drag & drop'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Supports .CSV files with headers (pin, date, status, punch_in, punch_out, notes)
                  </span>
                </div>
              </label>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 flex flex-col justify-between space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📥</span> CSV Template
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Need the exact formatting? Download our ready-to-use sample template.
                </p>
              </div>

              <button
                onClick={handleDownloadTemplate}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-sm cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                <span>Download Sample CSV</span>
              </button>
            </div>
          </div>

          {generalError && (
            <div className="rounded-2xl bg-rose-50 border-l-4 border-rose-500 p-4 text-xs font-bold text-rose-700">
              {generalError}
            </div>
          )}

          {isParsing && (
            <div className="p-8 text-center space-y-3">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
              <p className="text-xs font-bold text-slate-600">Parsing and validating CSV rows against database profiles...</p>
            </div>
          )}

          {uploadResult && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-2">
              <h4 className="text-sm font-black text-emerald-900 flex items-center gap-2">
                <span>🎉</span> Bulk Attendance Upload Complete!
              </h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold pt-2">
                <div className="rounded-xl bg-white p-2 border border-emerald-100">
                  <span className="block text-emerald-600 text-lg">{uploadResult.inserted}</span>
                  <span className="text-[10px] text-slate-400">New Inserted</span>
                </div>
                <div className="rounded-xl bg-white p-2 border border-emerald-100">
                  <span className="block text-sky-600 text-lg">{uploadResult.updated}</span>
                  <span className="text-[10px] text-slate-400">Updated</span>
                </div>
                <div className="rounded-xl bg-white p-2 border border-emerald-100">
                  <span className="block text-amber-600 text-lg">{uploadResult.skipped}</span>
                  <span className="text-[10px] text-slate-400">Skipped</span>
                </div>
                <div className="rounded-xl bg-white p-2 border border-emerald-100">
                  <span className="block text-rose-600 text-lg">{uploadResult.failed}</span>
                  <span className="text-[10px] text-slate-400">Failed</span>
                </div>
              </div>
            </div>
          )}

          {parsedRecords.length > 0 && !uploadResult && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700">
                    Total Rows: {parsedRecords.length}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800">
                    ✓ Valid: {validCount}
                  </span>
                  {duplicateCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">
                      ⚠️ Existing Logs: {duplicateCount}
                    </span>
                  )}
                  {invalidCount > 0 && (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800">
                      ❌ Invalid: {invalidCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400">Conflict Option:</span>
                  <select
                    value={conflictStrategy}
                    onChange={(e: any) => setConflictStrategy(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-500 shadow-sm"
                  >
                    <option value="skip">Skip Existing DB Records (Recommended)</option>
                    <option value="overwrite">Overwrite Existing DB Records</option>
                    <option value="insert_all">Insert All (Allow Duplicates)</option>
                  </select>
                </div>
              </div>

              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span>Uploading attendance records...</span>
                    <span>{uploadProgress.current} / {uploadProgress.total}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm max-h-60 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[10px] font-extrabold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">PIN / Employee</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">In - Out</th>
                      <th className="p-3">Validation & Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRecords.map((r, idx) => (
                      <tr
                        key={idx}
                        className={
                          !r.isValid
                            ? 'bg-rose-50/50 hover:bg-rose-50'
                            : r.isDuplicate
                            ? 'bg-amber-50/40 hover:bg-amber-50'
                            : 'hover:bg-slate-50'
                        }
                      >
                        <td className="p-3 text-slate-400 font-mono text-[11px]">{r.rowIndex}</td>
                        <td className="p-3 font-semibold text-slate-800">
                          {r.userName ? (
                            <div>
                              <span>{r.userName}</span>
                              <span className="ml-1 text-[10px] font-mono text-slate-400">({r.rawPin})</span>
                            </div>
                          ) : (
                            <span className="text-rose-600 font-bold">PIN "{r.rawPin}" (Not Found)</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-slate-700">{r.formattedDate || r.rawDate}</td>
                        <td className="p-3 font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] ${
                              r.status === 'Present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.status === 'WFH'
                                ? 'bg-amber-100 text-amber-800'
                                : r.status === 'Leave'
                                ? 'bg-violet-100 text-violet-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-600">
                          {r.punchInIso ? new Date(r.punchInIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                          {' - '}
                          {r.punchOutIso ? new Date(r.punchOutIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </td>
                        <td className="p-3">
                          {!r.isValid ? (
                            <div className="text-rose-600 font-bold text-[11px] leading-tight">
                              ❌ {r.errors.join('; ')}
                            </div>
                          ) : r.isDuplicate ? (
                            <div className="text-amber-700 font-medium text-[11px]">
                              ⚠️ Existing Record ({conflictStrategy === 'skip' ? 'Will Skip' : conflictStrategy === 'overwrite' ? 'Will Overwrite' : 'Will Add Duplicate'})
                            </div>
                          ) : (
                            <div className="text-emerald-700 font-medium text-[11px]">
                              ✓ Ready to import {r.notes ? `(${r.notes})` : ''}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 shrink-0">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-600 hover:bg-slate-50 cursor-pointer transition-all"
          >
            {uploadResult ? 'Close' : 'Cancel'}
          </button>

          {parsedRecords.length > 0 && !uploadResult && (
            <button
              onClick={handleStartUpload}
              disabled={isUploading || validCount === 0}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-100 cursor-pointer active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Uploading...
                </>
              ) : (
                `Import ${validCount} Valid Records`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
