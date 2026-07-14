"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  punch_in: string;
  punch_out: string | null;
  created_at: string;
}

interface JoinedAttendanceRecord extends AttendanceRecord {
  userName: string;
  userPin: string;
}

interface AttendanceExplorerProps {
  isAdmin: boolean;
}

export default function AttendanceExplorer({ isAdmin }: AttendanceExplorerProps) {
  const [logs, setLogs] = useState<JoinedAttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<JoinedAttendanceRecord | null>(null);
  
  // Filtering state
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  });
  
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editDate, setEditDate] = useState<string>('');
  const [editPunchIn, setEditPunchIn] = useState<string>('');
  const [editPunchOut, setEditPunchOut] = useState<string>('');
  const [editLoading, setEditLoading] = useState<boolean>(false);

  // Adding state
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [addDate, setAddDate] = useState<string>(() => {
    const d = new Date();
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  });
  const [addPunchIn, setAddPunchIn] = useState<string>('09:00');
  const [addPunchOut, setAddPunchOut] = useState<string>('17:00');
  const [addUserId, setAddUserId] = useState<string>('');
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [profiles, setProfiles] = useState<{ id: string; name: string; pin: string }[]>([]);

  const startAdding = () => {
    setSelectedLog(null);
    setIsAdding(true);
    setError(null);
  };

  // 1. Fetch all attendance logs and join with profile information in Javascript
  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch attendance logs
      const { data: logsData, error: fetchError } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch profiles to map names and PINs
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, pin');

      if (profilesError) throw profilesError;

      setProfiles(profilesData || []);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      const joined: JoinedAttendanceRecord[] = (logsData || []).map(log => ({
        ...log,
        userName: profilesMap.get(log.user_id)?.name || 'Unknown User',
        userPin: profilesMap.get(log.user_id)?.pin || 'N/A'
      }));

      setLogs(joined);
    } catch (err: unknown) {
      console.error('Error fetching attendance logs:', err);
      setError('Failed to fetch attendance history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // 2. Initializing edit states when selected log changes
  useEffect(() => {
    if (selectedLog) {
      setEditDate(selectedLog.date);
      setEditPunchIn(getTimeStringFromIso(selectedLog.punch_in));
      setEditPunchOut(getTimeStringFromIso(selectedLog.punch_out));
      setIsAdding(false);
    } else {
      setIsEditing(false);
    }
  }, [selectedLog]);

  // 3. Formatting & Parsing Helpers
  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString("en-US", {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString("en-US", { weekday: 'long' });
  };

  const getShiftDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
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

  const combineDateAndTime = (dateStr: string, timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':');
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(parseInt(hours, 10));
    d.setMinutes(parseInt(minutes, 10));
    return d.toISOString();
  };

  // 4. Save Edited Record
  const handleSaveEdit = async () => {
    if (!selectedLog) return;
    setEditLoading(true);
    setError(null);
    try {
      if (!editDate || !editPunchIn) {
        throw new Error('Date and Punch In time are required.');
      }

      const todayStr = new Date().toLocaleDateString("en-CA");
      if (editDate > todayStr) {
        throw new Error('Cannot log attendance for a future date.');
      }

      const punchInIso = combineDateAndTime(editDate, editPunchIn);
      const punchOutIso = editPunchOut ? combineDateAndTime(editDate, editPunchOut) : null;

      if (punchOutIso && new Date(punchOutIso) <= new Date(punchInIso)) {
        throw new Error('Punch Out time must be after Punch In time.');
      }

      const { data, error: updateError } = await supabase
        .from('attendance')
        .update({
          date: editDate,
          punch_in: punchInIso,
          punch_out: punchOutIso
        })
        .eq('id', selectedLog.id)
        .select()
        .single();

      if (updateError) throw updateError;
      
      const updatedLog: JoinedAttendanceRecord = {
        ...data,
        userName: selectedLog.userName,
        userPin: selectedLog.userPin
      };

      setSelectedLog(updatedLog);
      setIsEditing(false);
      
      await fetchLogs();
    } catch (err: unknown) {
      console.error('Error updating attendance record:', err);
      setError(err instanceof Error ? err.message : 'Failed to save attendance updates.');
    } finally {
      setEditLoading(false);
    }
  };

  // 5. Save New Record (Backdated Attendance)
  const handleSaveAdd = async () => {
    setAddLoading(true);
    setError(null);
    try {
      if (!addDate || !addPunchIn) {
        throw new Error('Date and Punch In time are required.');
      }

      const todayStr = new Date().toLocaleDateString("en-CA");
      if (addDate > todayStr) {
        throw new Error('Cannot log attendance for a future date.');
      }

      if (isAdmin && !addUserId) {
        throw new Error('Please select an employee.');
      }

      const punchInIso = combineDateAndTime(addDate, addPunchIn);
      const punchOutIso = addPunchOut ? combineDateAndTime(addDate, addPunchOut) : null;

      if (punchOutIso && new Date(punchOutIso) <= new Date(punchInIso)) {
        throw new Error('Punch Out time must be after Punch In time.');
      }

      let targetUserId = addUserId;
      if (!isAdmin) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User session not found.');
        targetUserId = user.id;
      }

      const recordToInsert: any = {
        date: addDate,
        punch_in: punchInIso,
        punch_out: punchOutIso,
      };

      if (targetUserId) {
        recordToInsert.user_id = targetUserId;
      }

      const { data, error: insertError } = await supabase
        .from('attendance')
        .insert(recordToInsert)
        .select()
        .single();

      if (insertError) throw insertError;

      setIsAdding(false);
      
      // Reset inputs
      setAddDate(new Date().toLocaleDateString("en-CA"));
      setAddPunchIn('09:00');
      setAddPunchOut('17:00');
      setAddUserId('');
      
      await fetchLogs();
    } catch (err: unknown) {
      console.error('Error adding attendance record:', err);
      setError(err instanceof Error ? err.message : 'Failed to add attendance record.');
    } finally {
      setAddLoading(false);
    }
  };

  // 5. Filtered Logs calculation
  const filteredLogs = logs.filter(log => {
    if (!filterMonth) return true;
    return log.date.startsWith(filterMonth);
  });

  // 6. CSV Download Trigger
  const downloadCSV = () => {
    if (filteredLogs.length === 0) return;

    // Define CSV headers (include User/PIN if Admin)
    const headers = isAdmin
      ? ['User Name', 'PIN', 'Date', 'Day', 'Punch In', 'Punch Out', 'Duration', 'Status']
      : ['Date', 'Day', 'Punch In', 'Punch Out', 'Duration', 'Status'];
    
    // Format rows
    const rows = filteredLogs.map(log => {
      const durationStr = log.punch_out ? getShiftDuration(log.punch_in, log.punch_out) : 'N/A';
      const status = log.punch_out ? 'Completed' : 'Active';
      
      if (isAdmin) {
        return [
          log.userName,
          log.userPin,
          log.date,
          getDayName(log.date),
          formatTime(log.punch_in),
          log.punch_out ? formatTime(log.punch_out) : 'N/A',
          durationStr,
          status
        ];
      } else {
        return [
          log.date,
          getDayName(log.date),
          formatTime(log.punch_in),
          log.punch_out ? formatTime(log.punch_out) : 'N/A',
          durationStr,
          status
        ];
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_report_${filterMonth || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {isAdmin ? 'System Attendance Explorer (Admin)' : 'Attendance Explorer'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin 
              ? 'View, filter, edit, and export attendance logs for all registered users'
              : 'View, inspect, and export your historical attendance logs'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
          />
          {filterMonth && (
            <button
              onClick={() => setFilterMonth('')}
              className="text-xs font-semibold text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            onClick={downloadCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-sky-700 border border-slate-200 hover:border-sky-100 font-bold text-xs px-4 py-2.5 shadow-sm cursor-pointer active:scale-95 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CSV
          </button>
          <button
            onClick={startAdding}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 shadow-md shadow-emerald-100 cursor-pointer active:scale-95 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Record
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl bg-rose-50 border-l-4 border-rose-500 p-4 text-xs text-rose-700 font-bold">
          {error}
        </div>
      )}

      {/* Main Grid: List Table & Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Table List View (2 Cols) */}
        <div className="lg:col-span-2 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm overflow-hidden">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAdmin ? 'All User Logs' : 'My Historical Logs'} ({filteredLogs.length})
          </h3>
          
          {isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
              <p className="text-xs font-semibold text-slate-400">Fetching records...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <p className="text-sm font-bold text-slate-500">No logs found</p>
              <p className="text-xs text-slate-400 mt-1">There are no attendance records matching your criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    {isAdmin && <th className="pb-3 font-semibold">User</th>}
                    <th className="pb-3 font-semibold">Date</th>
                    <th className="pb-3 font-semibold">Day</th>
                    <th className="pb-3 font-semibold">In</th>
                    <th className="pb-3 font-semibold">Out</th>
                    <th className="pb-3 font-semibold">Duration</th>
                    <th className="pb-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLogs.map((log) => {
                    const isSelected = selectedLog?.id === log.id;
                    return (
                      <tr
                        key={log.id}
                        onClick={() => {
                          setSelectedLog(log);
                          setIsEditing(false);
                        }}
                        className={`hover:bg-slate-50/80 transition-all cursor-pointer ${
                          isSelected ? 'bg-sky-50/30' : ''
                        }`}
                      >
                        {isAdmin && (
                          <td className="py-3.5 pr-2">
                            <div className="font-bold text-slate-800 truncate max-w-[120px]">{log.userName}</div>
                            <div className="text-[10px] font-semibold text-slate-400">PIN: {log.userPin}</div>
                          </td>
                        )}
                        <td className="py-3.5 font-bold text-slate-800">{log.date}</td>
                        <td className="py-3.5 text-slate-500">{getDayName(log.date)}</td>
                        <td className="py-3.5 font-medium">{formatTime(log.punch_in)}</td>
                        <td className="py-3.5 font-medium">{log.punch_out ? formatTime(log.punch_out) : '--:--:--'}</td>
                        <td className="py-3.5 font-semibold text-slate-600">
                          {log.punch_out ? getShiftDuration(log.punch_in, log.punch_out) : 'N/A'}
                        </td>
                        <td className="py-3.5 text-right">
                          {log.punch_out ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                              Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700 animate-pulse">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Details & Edit Panel View (1 Col) */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4">
            {isAdding ? 'Add Attendance Record' : isEditing ? 'Edit Shift Record' : 'Shift Details'}
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
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
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Shift Date</label>
                <input
                  type="date"
                  value={addDate}
                  max={new Date().toLocaleDateString("en-CA")}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch In Time</label>
                <input
                  type="time"
                  value={addPunchIn}
                  onChange={(e) => setAddPunchIn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch Out Time (Optional)</label>
                <input
                  type="time"
                  value={addPunchOut}
                  onChange={(e) => setAddPunchOut(e.target.value)}
                  placeholder="Shift in progress"
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
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-100 cursor-pointer disabled:opacity-50"
                >
                  {addLoading ? 'Saving...' : 'Add Record'}
                </button>
              </div>
            </div>
          ) : selectedLog ? (
            <div>
              {isEditing ? (
                /* --- EDITING MODE PANEL --- */
                <div className="space-y-5">
                  {isAdmin && (
                    <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 text-xs">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">User Profile</span>
                      <span className="block font-bold text-slate-800 mt-0.5">{selectedLog.userName} (PIN: {selectedLog.userPin})</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Shift Date</label>
                    <input
                      type="date"
                      value={editDate}
                      max={new Date().toLocaleDateString("en-CA")}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch In Time</label>
                    <input
                      type="time"
                      value={editPunchIn}
                      onChange={(e) => setEditPunchIn(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch Out Time (Optional)</label>
                    <input
                      type="time"
                      value={editPunchOut}
                      onChange={(e) => setEditPunchOut(e.target.value)}
                      placeholder="Shift not ended yet"
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
                      onClick={handleSaveEdit}
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
                  {/* Detail Card Summary */}
                  <div className="rounded-2xl bg-slate-50 p-5 border border-slate-100 text-center">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Shift Date</p>
                    <h4 className="mt-1 text-base font-extrabold text-slate-800">{formatDate(selectedLog.date)}</h4>
                    
                    {selectedLog.punch_out ? (
                      <>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mt-4">Total Worked Time</p>
                        <span className="mt-1 block text-3xl font-black text-slate-800 tracking-tight">
                          {getShiftDuration(selectedLog.punch_in, selectedLog.punch_out)}
                        </span>
                      </>
                    ) : (
                      <div className="mt-4 inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 animate-pulse">
                        Shift In Progress
                      </div>
                    )}
                  </div>

                  {/* Specific timestamps */}
                  <div className="space-y-4 text-xs font-semibold text-slate-600">
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Logged By</span>
                      <span className="text-slate-800 font-bold">{selectedLog.userName} (PIN: {selectedLog.userPin})</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Punch In Time</span>
                      <span className="text-slate-800 font-bold">{formatTime(selectedLog.punch_in)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Punch Out Time</span>
                      <span className="text-slate-800 font-bold">
                        {selectedLog.punch_out ? formatTime(selectedLog.punch_out) : '--:--:--'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Record ID</span>
                      <span className="text-slate-500 font-mono truncate max-w-[120px]" title={selectedLog.id}>{selectedLog.id}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Logged At</span>
                      <span className="text-slate-500 font-bold">
                        {new Date(selectedLog.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Shift Log
                    </button>
                  </div>

                  <div className="rounded-2xl bg-sky-50/30 border border-sky-100 p-4">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800">Shift Notes</h4>
                    <p className="mt-1 text-xs text-sky-700 leading-relaxed font-semibold">
                      This shift was logged securely via registered user authentication.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-slate-200 p-6 min-h-[300px]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400 border border-slate-100">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="mt-4 text-xs font-bold text-slate-700">No Shift Selected</h4>
              <p className="mt-1.5 text-[11px] text-slate-400 max-w-[200px] leading-relaxed">Click on any shift row in the table to view details, or log a new backdated record below.</p>
              <button
                onClick={startAdding}
                className="mt-5 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-100 cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Log Attendance Manually
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
