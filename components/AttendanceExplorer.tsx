"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface AttendanceRecord {
  id?: string;
  user_id: string;
  date: string;
  punch_in: string | null;
  punch_out: string | null;
  status?: string;
  notes?: string;
  created_at?: string;
}

interface Profile {
  id: string;
  name: string;
  pin: string;
  role?: string;
}

export interface ResourceAttendanceItem {
  id?: string;
  userId: string;
  userName: string;
  userPin: string;
  userRole: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  status: 'Present' | 'WFH' | 'Leave' | 'Absent';
  notes: string;
  shiftDuration: string;
  recordId: string | null;
}

interface AttendanceExplorerProps {
  isAdmin: boolean;
}

export default function AttendanceExplorer({ isAdmin }: AttendanceExplorerProps) {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<ResourceAttendanceItem | null>(null);

  // Missing Column Migration States
  const [isMissingColumns, setIsMissingColumns] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const migrationSql = `-- Run this in your Supabase SQL Editor:
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Present';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.attendance ALTER COLUMN punch_in DROP NOT NULL;`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(migrationSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Filtering state
  const [filterDate, setFilterDate] = useState<string>(() => {
    if (isAdmin) {
      return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
    }
    return '';
  });

  const [filterMonth, setFilterMonth] = useState<string>(() => {
    if (!isAdmin) {
      const d = new Date();
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      return `${year}-${month}`;
    }
    return '';
  });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Status Edit State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editStatus, setEditStatus] = useState<string>('Present');
  const [editDate, setEditDate] = useState<string>('');
  const [editPunchIn, setEditPunchIn] = useState<string>('');
  const [editPunchOut, setEditPunchOut] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editLoading, setEditLoading] = useState<boolean>(false);

  // Manual Add State
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [addUserId, setAddUserId] = useState<string>('');
  const [addStatus, setAddStatus] = useState<string>('Present');
  const [addDate, setAddDate] = useState<string>(() => new Date().toLocaleDateString("en-CA"));
  const [addPunchIn, setAddPunchIn] = useState<string>('09:00');
  const [addPunchOut, setAddPunchOut] = useState<string>('17:00');
  const [addNotes, setAddNotes] = useState<string>('');
  const [addLoading, setAddLoading] = useState<boolean>(false);

  // 1. Fetch attendance records and profiles
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch attendance logs
      const { data: logsData, error: fetchError } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false });

      if (fetchError) {
        if (fetchError.message.includes('notes') || fetchError.message.includes('status') || fetchError.message.includes('schema cache')) {
          setIsMissingColumns(true);
        }
        throw fetchError;
      }
      setIsMissingColumns(false);
      setLogs(logsData || []);

      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, pin, role');

      if (profilesError) {
        console.warn('Could not fetch profiles via direct query, attempting RPC:', profilesError);
        const { data: rpcProfiles } = await supabase.rpc('get_team_profiles');
        if (rpcProfiles) setProfiles(rpcProfiles);
      } else if (profilesData) {
        setProfiles(profilesData);
      }
    } catch (err: unknown) {
      console.error('Error fetching attendance data:', err);
      setError('Failed to fetch attendance records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helpers
  const formatTime = (isoString: string | null) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString("en-US", {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString("en-US", { weekday: 'long' });
  };

  const getShiftDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return 'N/A';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (isNaN(diff) || diff <= 0) return 'N/A';
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.round((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  const getTimeStringFromIso = (isoStr: string | null): string => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const combineDateAndTime = (dateStr: string, timeStr: string): string | null => {
    if (!dateStr || !timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;

    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;

    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  };

  const getRoleBadgeLabel = (roleStr?: string) => {
    switch (roleStr) {
      case 'admin': return 'Admin';
      case 'software_engineer': return 'Engineer';
      case 'ba': return 'BA';
      case 'project_manager': return 'PM';
      case 'designer': return 'Designer';
      case 'qa': return 'QA';
      case 'devops': return 'DevOps';
      case 'manager': return 'Manager';
      default: return 'Employee';
    }
  };

  // 2. Computed Resource Attendance Master Sheet (Includes all profiles when viewing by date)
  const masterResourceList = useMemo<ResourceAttendanceItem[]>(() => {
    const profilesMap = new Map(profiles.map(p => [p.id, p]));
    const targetDate = filterDate || (isAdmin ? new Date().toLocaleDateString("en-CA") : '');

    // Filter out System Admin users (only include employees)
    const employeeProfiles = profiles.filter(p => p.role !== 'admin');

    // If Admin viewing a specific date (or today's default view)
    if (isAdmin && targetDate) {
      const logsForDate = logs.filter(l => l.date === targetDate);
      const userLogsGroup = new Map<string, AttendanceRecord[]>();
      logsForDate.forEach(l => {
        const arr = userLogsGroup.get(l.user_id) || [];
        userLogsGroup.set(l.user_id, [...arr, l]);
      });

      return employeeProfiles.map(p => {
        const userLogs = userLogsGroup.get(p.id) || [];
        const primaryLog = userLogs[0] || null;

        let status: 'Present' | 'WFH' | 'Leave' | 'Absent' = 'Absent';
        let shiftDuration = 'N/A';
        let notes = 'Not Attended Yet';

        if (userLogs.length > 0) {
          const notesArr = userLogs.map(l => l.notes).filter(Boolean);
          notes = notesArr.length > 0 ? Array.from(new Set(notesArr)).join(' | ') : '';

          const hasWFH = userLogs.some(l => l.status === 'WFH');
          const hasLeave = userLogs.some(l => l.status === 'Leave');

          if (hasWFH) {
            status = 'WFH';
            if (!notes) notes = 'Work From Home';
          } else if (hasLeave) {
            status = 'Leave';
            if (!notes) notes = 'On Leave';
          } else {
            status = 'Present';
            let totalMins = 0;
            let hasActive = false;

            userLogs.forEach(l => {
              if (l.punch_in && l.punch_out) {
                const diff = new Date(l.punch_out).getTime() - new Date(l.punch_in).getTime();
                if (diff > 0) totalMins += Math.floor(diff / 60000);
              } else if (l.punch_in && !l.punch_out) {
                hasActive = true;
              }
            });

            const hrs = Math.floor(totalMins / 60);
            const mins = Math.round(totalMins % 60);
            shiftDuration = hasActive
              ? 'In Progress'
              : totalMins > 0
              ? `${hrs}h ${mins}m${userLogs.length > 1 ? ` (${userLogs.length} shifts)` : ''}`
              : 'Completed Shift';

            if (!notes) notes = hasActive ? 'Punched In' : 'Completed Shift';
          }
        }

        return {
          id: primaryLog?.id,
          userId: p.id,
          userName: p.name,
          userPin: p.pin,
          userRole: p.role || 'employee',
          date: targetDate,
          punchIn: primaryLog?.punch_in || null,
          punchOut: primaryLog?.punch_out || null,
          status,
          notes,
          shiftDuration,
          recordId: primaryLog?.id || null
        };
      });
    }

    // Otherwise (Historical or employee personal logs)
    return logs.map(log => {
      const p = profilesMap.get(log.user_id);
      let status: 'Present' | 'WFH' | 'Leave' | 'Absent' = 'Present';
      let shiftDuration = 'N/A';
      let notes = log.notes || '';

      if (log.status === 'WFH') {
        status = 'WFH';
      } else if (log.status === 'Leave') {
        status = 'Leave';
      } else if (log.punch_in || log.punch_out) {
        status = 'Present';
        shiftDuration = log.punch_out ? getShiftDuration(log.punch_in, log.punch_out) : 'In Progress';
      }

      return {
        id: log.id,
        userId: log.user_id,
        userName: p?.name || 'Unknown Employee',
        userPin: p?.pin || 'N/A',
        userRole: p?.role || 'employee',
        date: log.date,
        punchIn: log.punch_in,
        punchOut: log.punch_out,
        status,
        notes,
        shiftDuration,
        recordId: log.id || null
      };
    });
  }, [logs, profiles, filterDate, isAdmin]);

  // 3. Filtered Resource List
  const filteredResources = useMemo(() => {
    return masterResourceList.filter(item => {
      // Month Filter
      if (filterMonth && !item.date.startsWith(filterMonth)) return false;
      // Search Term Filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = item.userName.toLowerCase().includes(term);
        const matchesPin = item.userPin.toLowerCase().includes(term);
        if (!matchesName && !matchesPin) return false;
      }
      // Status Filter
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      return true;
    });
  }, [masterResourceList, filterMonth, searchTerm, statusFilter]);

  // 4. Summary KPI Metrics for Selected View
  const kpiMetrics = useMemo(() => {
    const total = masterResourceList.length;
    const present = masterResourceList.filter(r => r.status === 'Present').length;
    const wfh = masterResourceList.filter(r => r.status === 'WFH').length;
    const leave = masterResourceList.filter(r => r.status === 'Leave').length;
    const absent = masterResourceList.filter(r => r.status === 'Absent').length;
    const attendanceRate = total > 0 ? Math.round(((present + wfh) / total) * 100) : 0;

    return { total, present, wfh, leave, absent, attendanceRate };
  }, [masterResourceList]);

  // 5. Initialize edit state when selected item changes
  useEffect(() => {
    if (selectedItem) {
      setEditStatus(selectedItem.status);
      setEditDate(selectedItem.date);
      setEditPunchIn(getTimeStringFromIso(selectedItem.punchIn));
      setEditPunchOut(getTimeStringFromIso(selectedItem.punchOut));
      setEditNotes(selectedItem.notes === 'Not Attended Yet' ? '' : selectedItem.notes);
      setIsAdding(false);
    } else {
      setIsEditing(false);
    }
  }, [selectedItem]);

  // 6. Save or Update Status (Admin Override / Edit)
  const handleSaveStatus = async () => {
    if (!selectedItem) return;
    setEditLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User session not found.");

      let targetUserId = selectedItem.userId;
      if (!isAdmin) {
        targetUserId = user.id;
      }

      let punchInIso = editPunchIn ? combineDateAndTime(editDate, editPunchIn) : null;
      let punchOutIso = editPunchOut ? combineDateAndTime(editDate, editPunchOut) : null;

      if (punchInIso && punchOutIso && new Date(punchOutIso).getTime() <= new Date(punchInIso).getTime()) {
        throw new Error("Punch Out time must be later than Punch In time.");
      }

      if (editStatus === 'Present' && (!editPunchIn || !editPunchOut)) {
        // Default shift if present
        if (!editPunchIn) punchInIso = combineDateAndTime(editDate, '09:00');
        if (!editPunchOut) punchOutIso = combineDateAndTime(editDate, '17:00');
      }

      if (editStatus === 'In Progress' && !editPunchIn) {
        punchInIso = combineDateAndTime(editDate, '09:00');
        punchOutIso = null;
      }

      if (editStatus === 'WFH' || editStatus === 'Leave') {
        // Optional punch times for WFH / Leave
      }

      if (editStatus === 'Absent') {
        // If record exists in DB, delete it to mark user as absent
        if (selectedItem.recordId) {
          const { error: delErr } = await supabase
            .from('attendance')
            .delete()
            .eq('id', selectedItem.recordId);
          if (delErr) throw delErr;
        }
      } else {
        // Insert or Upsert Attendance Record
        const recordData: any = {
          user_id: targetUserId,
          date: editDate,
          punch_in: punchInIso,
          punch_out: editStatus === 'In Progress' ? null : punchOutIso,
          status: editStatus,
          notes: editNotes || (editStatus === 'WFH' ? 'Work From Home' : editStatus === 'Leave' ? 'On Leave' : '')
        };

        if (selectedItem.recordId) {
          let { error: updateErr } = await supabase
            .from('attendance')
            .update(recordData)
            .eq('id', selectedItem.recordId);

          if (updateErr && (updateErr.message.includes('notes') || updateErr.message.includes('status') || updateErr.message.includes('schema cache'))) {
            const fallbackData = {
              user_id: targetUserId,
              date: editDate,
              punch_in: punchInIso,
              punch_out: editStatus === 'In Progress' ? null : punchOutIso
            };
            const fallbackRes = await supabase
              .from('attendance')
              .update(fallbackData)
              .eq('id', selectedItem.recordId);
            updateErr = fallbackRes.error;
            setIsMissingColumns(true);
          }

          if (updateErr) throw updateErr;
        } else {
          let { error: insertErr } = await supabase
            .from('attendance')
            .insert(recordData);

          if (insertErr && (insertErr.message.includes('notes') || insertErr.message.includes('status') || insertErr.message.includes('schema cache'))) {
            const fallbackData = {
              user_id: targetUserId,
              date: editDate,
              punch_in: punchInIso,
              punch_out: editStatus === 'In Progress' ? null : punchOutIso
            };
            const fallbackRes = await supabase
              .from('attendance')
              .insert(fallbackData);
            insertErr = fallbackRes.error;
            setIsMissingColumns(true);
          }

          if (insertErr) throw insertErr;
        }
      }

      setIsEditing(false);
      setSelectedItem(null);
      await fetchData();
    } catch (err: any) {
      console.error('Error saving attendance status:', err);
      const msg = err?.message || err?.details || (typeof err === 'string' ? err : 'Failed to update attendance status.');
      if (msg.includes('notes') || msg.includes('status') || msg.includes('schema cache')) {
        setIsMissingColumns(true);
      }
      setError(msg);
    } finally {
      setEditLoading(false);
    }
  };

  // 7. Save New Record (Manual Add)
  const handleSaveAdd = async () => {
    setAddLoading(true);
    setError(null);
    try {
      if (!addDate) throw new Error('Date is required.');
      if (isAdmin && !addUserId) throw new Error('Please select an employee.');

      let targetUserId = addUserId;
      if (!isAdmin) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User session not found.');
        targetUserId = user.id;
      }

      let punchInIso = addPunchIn ? combineDateAndTime(addDate, addPunchIn) : null;
      let punchOutIso = addPunchOut ? combineDateAndTime(addDate, addPunchOut) : null;

      if (addStatus === 'In Progress') punchOutIso = null;

      if (punchInIso && punchOutIso && new Date(punchOutIso).getTime() <= new Date(punchInIso).getTime()) {
        throw new Error("Punch Out time must be later than Punch In time.");
      }

      const recordToInsert: any = {
        user_id: targetUserId,
        date: addDate,
        punch_in: punchInIso,
        punch_out: punchOutIso,
        status: addStatus,
        notes: addNotes
      };

      let { error: insertError } = await supabase
        .from('attendance')
        .insert(recordToInsert);

      if (insertError && (insertError.message.includes('notes') || insertError.message.includes('status') || insertError.message.includes('schema cache'))) {
        const fallbackRecord = {
          user_id: targetUserId,
          date: addDate,
          punch_in: punchInIso,
          punch_out: punchOutIso
        };
        const fallbackRes = await supabase
          .from('attendance')
          .insert(fallbackRecord);
        insertError = fallbackRes.error;
        setIsMissingColumns(true);
      }

      if (insertError) throw insertError;

      setIsAdding(false);
      await fetchData();
    } catch (err: any) {
      console.error('Error adding attendance:', err);
      const msg = err?.message || err?.details || (typeof err === 'string' ? err : 'Failed to add attendance record.');
      if (msg.includes('notes') || msg.includes('status') || msg.includes('schema cache')) {
        setIsMissingColumns(true);
      }
      setError(msg);
    } finally {
      setAddLoading(false);
    }
  };

  // 8. Enhanced Native CSV Export with Present-First Priority Sorting & UTF-8 BOM
  const downloadExcelSheet = () => {
    if (filteredResources.length === 0) return;

    let dateRangeStr = "All Recorded Dates";
    if (filterDate) {
      dateRangeStr = filterDate;
    } else if (filterMonth) {
      dateRangeStr = `Month ${filterMonth}`;
    } else if (filteredResources.length > 0) {
      const dates = filteredResources.map(r => r.date).filter(Boolean).sort();
      if (dates.length > 0) {
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];
        dateRangeStr = minDate === maxDate ? minDate : `${minDate} to ${maxDate}`;
      }
    }

    const generatedAt = new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    // Priority Status Order: Present -> WFH -> Leave -> Absent -> Alphabetical by name
    const statusPriority: Record<string, number> = {
      'Present': 1,
      'WFH': 2,
      'Leave': 3,
      'Absent': 4
    };

    const sortedResources = [...filteredResources]
      .filter(item => item.userRole !== 'admin')
      .sort((a, b) => {
        const pA = statusPriority[a.status] || 99;
        const pB = statusPriority[b.status] || 99;
        if (pA !== pB) return pA - pB;
        return a.userName.localeCompare(b.userName);
      });

    // Summary Section
    const summaryRows = [
      ['Attendance Sheet for BRAC IT Augmented Resources at BRAC'],
      [`FILTER DATE RANGE: ${dateRangeStr}`],
      [`GENERATED AT: ${generatedAt}`],
      [''],
      ['KPI SUMMARY'],
      ['Total Team Size', 'Present', 'Work From Home (WFH)', 'On Leave', 'Absent (Not Attended)', 'Attendance Rate'],
      [
        kpiMetrics.total,
        kpiMetrics.present,
        kpiMetrics.wfh,
        kpiMetrics.leave,
        kpiMetrics.absent,
        `${kpiMetrics.attendanceRate}%`
      ],
      [''],
      ['DETAILED EMPLOYEE ATTENDANCE ROSTER SHEET (SORTED BY PRESENT STATUS)']
    ];

    const tableHeaders = [
      'Employee Name',
      'PIN',
      'Date',
      'Day of Week',
      'Status',
      'Punch In Time',
      'Punch Out Time',
      'Total Worked Duration',
      'Notes / Remarks'
    ];

    const dataRows = sortedResources.map(item => [
      item.userName,
      item.userPin,
      item.date,
      getDayName(item.date),
      item.status,
      formatTime(item.punchIn),
      formatTime(item.punchOut),
      item.shiftDuration,
      item.notes || 'N/A'
    ]);

    // Combine lines with proper CSV quoting and BOM for Excel UTF-8 recognition
    const csvLines = [
      ...summaryRows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      tableHeaders.map(v => `"${v.replace(/"/g, '""')}"`).join(','),
      ...dataRows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Add BOM marker (\uFEFF) so Microsoft Excel opens it seamlessly without extension mismatch warnings
    const fileNameRange = dateRangeStr.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const blob = new Blob(['\uFEFF' + csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `BRAC_Attendance_Report_${fileNameRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📋</span> {isAdmin ? 'Workforce Attendance Explorer & Roster' : 'My Attendance Sheet'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin
              ? 'Complete roster view of all team members: track punch in/out, absentees, WFH, leave, and export Excel sheets'
              : 'Inspect your personal attendance history, shift durations, and status updates'}
          </p>
        </div>

        {/* Date Filter & Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Date:</span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setFilterMonth('');
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all shadow-sm"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase text-slate-400">Month:</span>
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => {
                  setFilterMonth(e.target.value);
                  setFilterDate('');
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all shadow-sm"
              />
            </div>
          )}

          {(filterDate || filterMonth) && (
            <button
              onClick={() => {
                setFilterDate('');
                setFilterMonth('');
              }}
              className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              Clear Filter
            </button>
          )}

          {/* Excel Download Button */}
          <button
            onClick={downloadExcelSheet}
            disabled={filteredResources.length === 0}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 shadow-md shadow-emerald-100 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
            title="Download complete Excel / CSV Attendance Sheet"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Excel Sheet
          </button>

          <button
            onClick={() => {
              setSelectedItem(null);
              setIsAdding(true);
              setError(null);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 shadow-md shadow-sky-100 cursor-pointer active:scale-95 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Attendance
          </button>
        </div>
      </div>

      {/* Admin Summary KPI Counters */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* KPI 1: Total Team */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Total Team</span>
            <span className="mt-1 block text-2xl font-black text-slate-800">{kpiMetrics.total}</span>
            <span className="text-[9px] font-semibold text-slate-400">Registered Members</span>
          </div>

          {/* KPI 2: Present */}
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm text-center">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Present</span>
            <span className="mt-1 block text-2xl font-black text-emerald-700">{kpiMetrics.present}</span>
            <span className="text-[9px] font-semibold text-emerald-600">Punched In</span>
          </div>

          {/* KPI 3: WFH */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4 shadow-sm text-center">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-amber-700">WFH</span>
            <span className="mt-1 block text-2xl font-black text-amber-700">{kpiMetrics.wfh}</span>
            <span className="text-[9px] font-semibold text-amber-600">Work From Home</span>
          </div>

          {/* KPI 4: Leave */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 shadow-sm text-center">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-violet-700">On Leave</span>
            <span className="mt-1 block text-2xl font-black text-violet-700">{kpiMetrics.leave}</span>
            <span className="text-[9px] font-semibold text-violet-600">Approved Leave</span>
          </div>

          {/* KPI 5: Absent */}
          <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4 shadow-sm text-center">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-rose-700">Absent</span>
            <span className="mt-1 block text-2xl font-black text-rose-700">{kpiMetrics.absent}</span>
            <span className="text-[9px] font-semibold text-rose-600">Not Attended Yet</span>
          </div>
        </div>
      )}

      {/* Database Schema Setup Banner if notes/status columns missing */}
      {isMissingColumns && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-6 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg shrink-0">
              ⚡
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Supabase Database Migration Required</h3>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                The <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">status</code> and <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">notes</code> columns have not been added to your <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">public.attendance</code> table in Supabase yet. Basic punch updates are active in fallback mode. Run the SQL script below in your <strong>Supabase SQL Editor</strong> to enable full attendance status tracking & notes.
              </p>
            </div>
          </div>

          <div className="relative rounded-2xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px] overflow-x-auto shadow-inner">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">SQL Migration Script</span>
              <button
                onClick={handleCopySql}
                className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                {copiedSql ? '✓ Copied to Clipboard!' : 'Copy SQL Script'}
              </button>
            </div>
            <pre className="text-slate-300 leading-relaxed whitespace-pre-wrap">{migrationSql}</pre>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => {
                setIsMissingColumns(false);
                fetchData();
              }}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-100 cursor-pointer active:scale-95 transition-all"
            >
              🔄 Refresh & Retry Connection
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-rose-50 border-l-4 border-rose-500 p-4 text-xs text-rose-700 font-bold">
          {error}
        </div>
      )}

      {/* Main Content Layout: Table List + Action Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Table List View (2 Cols) */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm overflow-hidden space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isAdmin ? 'Resource Attendance Sheet' : 'My Logs'} ({filteredResources.length})
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold">
                {filterDate ? `Showing attendance for ${formatDate(filterDate)}` : 'Filtered list'}
              </p>
            </div>

            {/* Controls: Search & Status Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search name/PIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all w-36 shadow-sm"
              />

              {/* Status Filter Buttons */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {(['all', 'Present', 'WFH', 'Leave', 'Absent'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold capitalize transition-all cursor-pointer ${
                      statusFilter === st
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
              <p className="text-xs font-semibold text-slate-400">Loading roster sheet...</p>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <p className="text-sm font-bold text-slate-500">No matching resources found</p>
              <p className="text-xs text-slate-400 mt-1">Adjust your date or status filters to view records.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="pb-3 font-semibold">Employee</th>
                    <th className="pb-3 font-semibold">Date</th>
                    <th className="pb-3 font-semibold">Punch In</th>
                    <th className="pb-3 font-semibold">Punch Out</th>
                    <th className="pb-3 font-semibold">Duration</th>
                    <th className="pb-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredResources.map((item, idx) => {
                    const isSelected = selectedItem?.userId === item.userId && selectedItem?.date === item.date;

                    // Badge Styling Helper
                    const getStatusBadge = (st: string) => {
                      switch (st) {
                        case 'Present':
                          return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Present</span>;
                        case 'WFH':
                          return <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">WFH</span>;
                        case 'Leave':
                          return <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700">On Leave</span>;
                        default:
                          return <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600">Absent</span>;
                      }
                    };

                    return (
                      <tr
                        key={item.userId + '_' + item.date + '_' + idx}
                        onClick={() => {
                          setSelectedItem(item);
                          setIsEditing(false);
                        }}
                        className={`hover:bg-slate-50/80 transition-all cursor-pointer ${
                          isSelected ? 'bg-sky-50/40' : ''
                        }`}
                      >
                        <td className="py-3.5 pr-2">
                          <div className="font-bold text-slate-800 truncate max-w-[140px]">{item.userName}</div>
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 mt-0.5">
                            <span>PIN: {item.userPin}</span>
                            <span className="rounded bg-slate-100 px-1 text-[8px] font-bold text-slate-600 uppercase">
                              {getRoleBadgeLabel(item.userRole)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">
                          {item.date}
                          <span className="block text-[10px] font-normal text-slate-400">{getDayName(item.date)}</span>
                        </td>
                        <td className="py-3.5 font-medium">{formatTime(item.punchIn)}</td>
                        <td className="py-3.5 font-medium">{formatTime(item.punchOut)}</td>
                        <td className="py-3.5 font-semibold text-slate-600">{item.shiftDuration}</td>
                        <td className="py-3.5 text-right">{getStatusBadge(item.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Details & Admin Override Panel (1 Col) */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAdding ? 'Log Manual Attendance' : isEditing ? 'Manage Resource Status' : 'Resource Details'}
          </h3>

          {isAdding ? (
            /* --- ADDING MODE PANEL --- */
            <div className="space-y-5">
              {isAdmin && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Select Employee</label>
                  <select
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  >
                    <option value="">Choose an employee...</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (PIN: {p.pin})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Status</label>
                <select
                  value={addStatus}
                  onChange={(e) => setAddStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                >
                  <option value="Present">Present (Completed)</option>
                  <option value="In Progress">Working Now (In Progress)</option>
                  <option value="WFH">Work From Home (WFH)</option>
                  <option value="Leave">On Leave</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Date</label>
                <input
                  type="date"
                  value={addDate}
                  max={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                />
              </div>

              {(addStatus === 'Present' || addStatus === 'In Progress') && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch In Time</label>
                    <input
                      type="time"
                      value={addPunchIn}
                      onChange={(e) => setAddPunchIn(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  {addStatus === 'Present' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch Out Time</label>
                      <input
                        type="time"
                        value={addPunchOut}
                        onChange={(e) => setAddPunchOut(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Notes / Reason</label>
                <input
                  type="text"
                  placeholder="Optional remarks..."
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={() => setIsAdding(false)}
                  disabled={addLoading}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAdd}
                  disabled={addLoading}
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-md shadow-sky-100 cursor-pointer disabled:opacity-50"
                >
                  {addLoading ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </div>
          ) : selectedItem ? (
            <div>
              {isEditing ? (
                /* --- EDITING MODE PANEL --- */
                <div className="space-y-5">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Employee Profile</span>
                    <span className="block font-bold text-slate-800 mt-0.5">{selectedItem.userName} (PIN: {selectedItem.userPin})</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Set Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                    >
                      <option value="Present">Present (Punched In)</option>
                      <option value="WFH">Work From Home (WFH)</option>
                      <option value="Leave">On Leave</option>
                      <option value="Absent">Absent (Not Attended)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Date</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  {(editStatus === 'Present' || editStatus === 'In Progress') && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch In Time</label>
                        <input
                          type="time"
                          value={editPunchIn}
                          onChange={(e) => setEditPunchIn(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                        />
                      </div>

                      {editStatus === 'Present' && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch Out Time</label>
                          <input
                            type="time"
                            value={editPunchOut}
                            onChange={(e) => setEditPunchOut(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                          />
                        </div>
                      )}
                    </>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Notes / Remarks</label>
                    <input
                      type="text"
                      placeholder="Reason or notes..."
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={editLoading}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveStatus}
                      disabled={editLoading}
                      className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-all shadow-md shadow-sky-100 cursor-pointer disabled:opacity-50"
                    >
                      {editLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              ) : (
                /* --- DETAILS VIEW PANEL --- */
                <div className="space-y-6">
                  {/* Summary Card */}
                  <div className="rounded-2xl bg-slate-50 p-5 border border-slate-100 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Selected Employee</p>
                    <h4 className="mt-1 text-base font-extrabold text-slate-800">{selectedItem.userName}</h4>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">PIN: {selectedItem.userPin} • {getRoleBadgeLabel(selectedItem.userRole)}</p>

                    <div className="mt-4">
                      {selectedItem.status === 'Present' && (
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Shift Duration</p>
                          <span className="mt-0.5 block text-2xl font-black text-emerald-600">{selectedItem.shiftDuration}</span>
                        </div>
                      )}
                      {selectedItem.status === 'Present' && (
                        <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                          Present
                        </div>
                      )}
                      {selectedItem.status === 'WFH' && (
                        <div className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                          Work From Home
                        </div>
                      )}
                      {selectedItem.status === 'Leave' && (
                        <div className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                          On Leave
                        </div>
                      )}
                      {selectedItem.status === 'Absent' && (
                        <div className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
                          Not Attended Yet
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Field Details */}
                  <div className="space-y-3 text-xs font-semibold text-slate-600">
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Date</span>
                      <span className="text-slate-800 font-bold">{formatDate(selectedItem.date)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Punch In</span>
                      <span className="text-slate-800 font-bold">{formatTime(selectedItem.punchIn)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Punch Out</span>
                      <span className="text-slate-800 font-bold">{formatTime(selectedItem.punchOut)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Notes / Remarks</span>
                      <span className="text-slate-700 font-semibold max-w-[150px] truncate text-right">{selectedItem.notes || 'None'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <svg className="h-3.5 w-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Change Status / Edit
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-slate-200 p-6 min-h-[300px]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 border border-slate-100">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h4 className="mt-4 text-xs font-bold text-slate-700">No Resource Selected</h4>
              <p className="mt-1.5 text-[11px] text-slate-400 max-w-[200px] leading-relaxed">
                Click on any employee row in the attendance sheet to view or update status (Present, WFH, Leave, Absent).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
