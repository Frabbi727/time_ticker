"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface PunchCardProps {
  userName: string;
  pin: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  punch_in: string;
  punch_out: string | null;
}

export default function PunchCard({ userName, pin }: PunchCardProps) {
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [pastUnclosedRecord, setPastUnclosedRecord] = useState<AttendanceRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  const dayName = today.toLocaleDateString("en-US", { weekday: 'long' });
  const displayDate = today.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' });

  // Find the active shift today (where punch_out is null)
  const activeRecord = todayRecords.find(r => !r.punch_out) || null;

  // Calculate total time worked today
  const totalMinsToday = todayRecords.reduce((total, r) => {
    if (r.punch_out) {
      const diff = new Date(r.punch_out).getTime() - new Date(r.punch_in).getTime();
      return total + Math.floor(diff / 60000);
    }
    return total;
  }, 0);
  const totalHoursToday = Math.floor(totalMinsToday / 60);
  const totalMinsRem = Math.round(totalMinsToday % 60);

  // 1. Fetch today's attendance records (there can be multiple)
  const fetchTodayAttendance = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .order('punch_in', { ascending: false });

      if (fetchError) throw fetchError;
      setTodayRecords(data || []);
    } catch (err: unknown) {
      console.error('Error fetching attendance:', err);
      setError('Failed to load today\'s attendance status.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Fetch recent attendance history (last 10 records)
  const fetchAttendanceHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(10);

      if (fetchError) throw fetchError;
      setHistory(data || []);
      const unclosedPast = (data || []).find(r => !r.punch_out && r.date < dateStr);
      setPastUnclosedRecord(unclosedPast || null);
    } catch (err: unknown) {
      console.error('Error fetching attendance history:', err);
    }
  };

  useEffect(() => {
    fetchTodayAttendance();
    fetchAttendanceHistory();
  }, [dateStr]);

  // 3. Punch In Action
  const handlePunchIn = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from('attendance')
        .insert({
          date: dateStr,
          punch_in: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;
      setTodayRecords(prev => [data, ...prev]);
      // Refresh history list
      fetchAttendanceHistory();
    } catch (err: unknown) {
      console.error('Error punching in:', err);
      setError('Failed to Punch In. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Punch Out Action
  const handlePunchOut = async () => {
    const active = todayRecords.find(r => !r.punch_out);
    if (!active) return;
    setActionLoading(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('attendance')
        .update({
          punch_out: new Date().toISOString()
        })
        .eq('id', active.id)
        .select()
        .single();

      if (updateError) throw updateError;
      setTodayRecords(prev => prev.map(r => r.id === data.id ? data : r));
      // Refresh history list
      fetchAttendanceHistory();
    } catch (err: unknown) {
      console.error('Error punching out:', err);
      setError('Failed to Punch Out. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Close Past Unclosed Shift Action
  const handleClosePastShift = async (recordToClose: AttendanceRecord) => {
    setActionLoading(true);
    setError(null);
    try {
      const closeTime = new Date(`${recordToClose.date}T17:00:00`).toISOString();
      const { error: updateErr } = await supabase
        .from('attendance')
        .update({ punch_out: closeTime })
        .eq('id', recordToClose.id);

      if (updateErr) throw updateErr;
      setPastUnclosedRecord(null);
      await fetchTodayAttendance();
      await fetchAttendanceHistory();
    } catch (err: unknown) {
      console.error('Error closing past shift:', err);
      setError('Failed to close past shift.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getShiftDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.round((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      {/* Upper Header Design */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-50 pb-5">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-700">
            PIN: {pin}
          </span>
          <h2 className="mt-1.5 text-lg font-black text-slate-900 tracking-tight">{userName}</h2>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{dayName}</p>
          <p className="text-sm font-bold text-slate-700">{displayDate}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex py-10 flex-col items-center justify-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"></div>
          <p className="text-xs font-medium text-slate-400">Loading attendance status...</p>
        </div>
      ) : (
        <div className="pt-6">
          {/* Warning Banner for Unclosed Past Shift */}
          {pastUnclosedRecord && (
            <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 text-amber-800 font-extrabold text-xs">
                    ⚠️ Open Shift Detected
                  </span>
                  <p className="text-[11px] font-semibold text-amber-700 mt-0.5">
                    Unclosed shift from {pastUnclosedRecord.date}
                  </p>
                </div>
                <button
                  onClick={() => handleClosePastShift(pastUnclosedRecord)}
                  disabled={actionLoading}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {actionLoading ? 'Closing...' : 'Close Shift (5:00 PM)'}
                </button>
              </div>
            </div>
          )}

          {/* Status Indicators */}
          {!activeRecord ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-50/50 py-8 text-center border border-dashed border-slate-200 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800">You are currently clocked out</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-[220px]">
                  {todayRecords.length > 0 
                    ? `You completed ${todayRecords.filter(r => r.punch_out).length} shift(s) today. Click below to start another shift.`
                    : "Record your attendance by punching in at the start of your shift."}
                </p>
                {todayRecords.length > 0 && (
                  <div className="mt-4 bg-sky-50 border border-sky-100 text-sky-700 px-4 py-2 rounded-xl text-xs font-bold text-center">
                    Total Time Today: {totalHoursToday}h {totalMinsRem}m
                  </div>
                )}
              </div>

              <button
                onClick={handlePunchIn}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all font-bold text-white text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-100"
              >
                {actionLoading ? 'Processing...' : 'Punch In'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center rounded-2xl bg-sky-50/20 py-8 text-center border border-sky-100">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wider text-sky-800">Shift Status</h3>
                <span className="mt-2 text-xl font-extrabold text-slate-800 tracking-tight">Active (In Progress)</span>
                <p className="mt-2 text-xs text-sky-700 font-medium">Punched In at: {formatTime(activeRecord.punch_in)}</p>
                {totalMinsToday > 0 && (
                  <div className="mt-3 text-xs font-bold text-slate-500">
                    Completed earlier today: {totalHoursToday}h {totalMinsRem}m
                  </div>
                )}
              </div>

              <button
                onClick={handlePunchOut}
                disabled={actionLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] transition-all font-bold text-white text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-100"
              >
                {actionLoading ? 'Processing...' : 'Punch Out'}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3 text-xs text-rose-700 font-semibold">
              {error}
            </div>
          )}

          {/* Attendance History Section */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-4">
              Attendance History
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No attendance history logged yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                {history.map((recordItem) => {
                  const recordDate = new Date(recordItem.date + 'T00:00:00');
                  const day = recordDate.toLocaleDateString("en-US", { weekday: 'short' });
                  const dateText = recordDate.toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
                  
                  return (
                    <div key={recordItem.id} className="flex items-center justify-between rounded-xl border border-slate-50 bg-slate-50/30 p-3 text-xs hover:bg-slate-50 transition-all">
                      <div>
                        <span className="font-bold text-slate-700">{day}, {dateText}</span>
                        <div className="mt-1 flex gap-2 text-[10px] text-slate-400">
                          <span>In: {formatTime(recordItem.punch_in)}</span>
                          {recordItem.punch_out && (
                            <>
                              <span>•</span>
                              <span>Out: {formatTime(recordItem.punch_out)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {recordItem.punch_out ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                            {getShiftDuration(recordItem.punch_in, recordItem.punch_out)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 font-bold text-sky-700 animate-pulse">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
