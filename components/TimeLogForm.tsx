"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---
interface Project {
  id: string;
  name: string;
}

type TimeEntryMode = 'range' | 'duration' | 'timer';

interface TimeLogFormProps {
  projectsList?: Project[];
  editingLog?: {
    id: string;
    date: string;
    project_id: string;
    description: string;
    remarks?: string | null;
    direct_duration?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  } | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TimeLogForm({ projectsList, editingLog, onSuccess, onCancel }: TimeLogFormProps) {
  // 1. Form State
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [timeEntryMode, setTimeEntryMode] = useState<TimeEntryMode>('range');
  
  // Time Range Fields
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  
  // Direct Duration Fields
  const [directDuration, setDirectDuration] = useState<string>('');
  
  // Live Stopwatch States
  const [timerIsRunning, setTimerIsRunning] = useState<boolean>(false);
  const [timerElapsed, setTimerElapsed] = useState<number>(0);
  const [timerStartTimestamp, setTimerStartTimestamp] = useState<number | null>(null);
  
  // UI & Data State
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const projects = projectsList || localProjects;

  // 2. Fetch Projects on Mount (as fallback if projectsList is not passed)
  useEffect(() => {
    if (!projectsList) {
      async function fetchProjects() {
        const { data, error: fetchError } = await supabase
          .from('projects')
          .select('id, name')
          .order('name', { ascending: true });

        if (fetchError) {
          console.error('Error fetching projects:', fetchError);
          setError('Failed to load projects. Please check your Supabase connection.');
        } else {
          setLocalProjects(data || []);
        }
      }
      fetchProjects();
    }
  }, [projectsList]);

  // Effect to populate form when editingLog changes
  useEffect(() => {
    if (editingLog) {
      setDate(editingLog.date);
      setProjectId(editingLog.project_id);
      setDescription(editingLog.description);
      setRemarks(editingLog.remarks || '');
      
      if (editingLog.direct_duration) {
        setTimeEntryMode('duration');
        const hoursMatch = editingLog.direct_duration.match(/(\d+)\s*hours?/);
        const minsMatch = editingLog.direct_duration.match(/(\d+)\s*mins?/);
        const h = hoursMatch ? hoursMatch[1].padStart(1, '0') : '0';
        const m = minsMatch ? minsMatch[1].padStart(2, '0') : '00';
        setDirectDuration(`${h}:${m}`);
      } else {
        setTimeEntryMode('range');
        setStartTime(editingLog.start_time ? editingLog.start_time.slice(0, 5) : '');
        setEndTime(editingLog.end_time ? editingLog.end_time.slice(0, 5) : '');
      }
      setError(null);
      setSuccess(null);
    }
  }, [editingLog]);

  // 3. Live Stopwatch Logic
  // Restore active timer from localStorage on mount
  useEffect(() => {
    const savedStart = localStorage.getItem('tracker_timer_start');
    const savedProjectId = localStorage.getItem('tracker_timer_project_id');
    const savedElapsed = localStorage.getItem('tracker_timer_accumulated_elapsed');

    if (savedStart) {
      const startMs = parseInt(savedStart);
      const accumulated = savedElapsed ? parseInt(savedElapsed) : 0;
      setTimerStartTimestamp(startMs);
      setTimerIsRunning(true);
      setTimerElapsed(Math.floor((Date.now() - startMs) / 1000) + accumulated);
      if (savedProjectId) setProjectId(savedProjectId);
      setTimeEntryMode('timer');
    } else if (savedElapsed) {
      setTimerElapsed(parseInt(savedElapsed));
    }
  }, []);

  // Timer Tick implementation
  useEffect(() => {
    if (timerIsRunning && timerStartTimestamp !== null) {
      const accumulated = parseInt(localStorage.getItem('tracker_timer_accumulated_elapsed') || '0');
      
      timerRef.current = setInterval(() => {
        const elapsedSecs = Math.floor((Date.now() - timerStartTimestamp) / 1000) + accumulated;
        setTimerElapsed(elapsedSecs);
        
        // Update document title dynamically
        document.title = `⏱️ ${formatSecondsToHMS(elapsedSecs)} | Tracker`;
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      document.title = 'Tracker';
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerIsRunning, timerStartTimestamp]);

  // Page reload warning if timer is running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (timerIsRunning) {
        e.preventDefault();
        e.returnValue = 'You have a running stopwatch. Are you sure you want to leave? Your timer will resume, but unsaved description changes might be lost.';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [timerIsRunning]);

  // Save selected project to localStorage for timer restore
  useEffect(() => {
    if (timerIsRunning && projectId) {
      localStorage.setItem('tracker_timer_project_id', projectId);
    }
  }, [projectId, timerIsRunning]);

  // Helper formatting functions
  const formatSecondsToHMS = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatSecondsToHM = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const displayMins = m === 0 && h === 0 && totalSecs > 0 ? 1 : m;
    return `${h.toString().padStart(1, '0')}:${displayMins.toString().padStart(2, '0')}`;
  };

  const handleStartTimer = () => {
    if (!projectId) {
      setError('Please select a project before starting the timer.');
      return;
    }
    setError(null);
    const startMs = Date.now();
    setTimerStartTimestamp(startMs);
    setTimerIsRunning(true);
    localStorage.setItem('tracker_timer_start', startMs.toString());
    localStorage.setItem('tracker_timer_project_id', projectId);
  };

  const handlePauseTimer = () => {
    if (timerStartTimestamp !== null) {
      const currentSessionSecs = Math.floor((Date.now() - timerStartTimestamp) / 1000);
      const priorAccumulated = parseInt(localStorage.getItem('tracker_timer_accumulated_elapsed') || '0');
      const totalElapsed = priorAccumulated + currentSessionSecs;
      
      setTimerIsRunning(false);
      setTimerStartTimestamp(null);
      setTimerElapsed(totalElapsed);
      
      localStorage.setItem('tracker_timer_accumulated_elapsed', totalElapsed.toString());
      localStorage.removeItem('tracker_timer_start');
    }
  };

  const handleResumeTimer = () => {
    setError(null);
    const startMs = Date.now();
    setTimerStartTimestamp(startMs);
    setTimerIsRunning(true);
    localStorage.setItem('tracker_timer_start', startMs.toString());
  };

  const handleStopAndFillTimer = () => {
    let finalElapsed = timerElapsed;
    if (timerIsRunning && timerStartTimestamp !== null) {
      const currentSessionSecs = Math.floor((Date.now() - timerStartTimestamp) / 1000);
      const priorAccumulated = parseInt(localStorage.getItem('tracker_timer_accumulated_elapsed') || '0');
      finalElapsed = priorAccumulated + currentSessionSecs;
    }
    
    // Stop the timer
    setTimerIsRunning(false);
    setTimerStartTimestamp(null);
    setTimerElapsed(0);
    
    // Fill form
    const formattedDuration = formatSecondsToHM(finalElapsed);
    setDirectDuration(formattedDuration);
    setTimeEntryMode('duration');
    
    // Cleanup local storage
    localStorage.removeItem('tracker_timer_start');
    localStorage.removeItem('tracker_timer_project_id');
    localStorage.removeItem('tracker_timer_accumulated_elapsed');
    
    setSuccess(`Stopwatch recorded ${formatSecondsToHMS(finalElapsed)}. Time automatically filled!`);
  };

  const handleResetTimer = () => {
    if (confirm('Are you sure you want to discard the active stopwatch duration?')) {
      setTimerIsRunning(false);
      setTimerStartTimestamp(null);
      setTimerElapsed(0);
      localStorage.removeItem('tracker_timer_start');
      localStorage.removeItem('tracker_timer_project_id');
      localStorage.removeItem('tracker_timer_accumulated_elapsed');
      setError(null);
    }
  };

  // 4. Form Actions & Submission
  const validateDuration = (val: string) => {
    const regex = /^([0-9]{1,2}):([0-5][0-9])$/;
    return regex.test(val);
  };

  const formatDurationToInterval = (val: string) => {
    const [hours, minutes] = val.split(':');
    return `${parseInt(hours)} hours ${parseInt(minutes)} mins`;
  };

  const validateTimeRange = (start: string, end: string) => {
    if (!start || !end) return false;
    return start < end;
  };

  const handleReset = () => {
    setDescription('');
    setRemarks('');
    setStartTime('');
    setEndTime('');
    setDirectDuration('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (timerIsRunning) {
      return setError('Please stop the running stopwatch before submitting.');
    }

    if (!projectId) return setError('Please select a project.');
    if (!description.trim()) return setError('Task description is required.');

    interface TimeLogPayload {
      project_id: string;
      description: string;
      remarks: string;
      date: string;
      start_time: string | null;
      end_time: string | null;
      direct_duration: string | null;
    }

    const payload: TimeLogPayload = {
      project_id: projectId,
      description,
      remarks,
      date,
      start_time: null,
      end_time: null,
      direct_duration: null,
    };

    if (timeEntryMode === 'range') {
      if (!startTime || !endTime) return setError('Please enter both Start and End times.');
      if (!validateTimeRange(startTime, endTime)) {
        return setError('End Time must be chronologically after Start Time.');
      }
      payload.start_time = `${startTime}:00`;
      payload.end_time = `${endTime}:00`;
    } else {
      if (!directDuration) return setError('Please enter a duration (e.g., 4:30) or use the Live Stopwatch.');
      if (!validateDuration(directDuration)) {
        return setError('Duration must be in HH:MM format (e.g., 4:30 or 0:45).');
      }
      payload.direct_duration = formatDurationToInterval(directDuration);
    }

    setIsSubmitting(true);

    try {
      if (editingLog) {
        // Update existing log
        const { error: updateError } = await supabase
          .from('time_logs')
          .update(payload)
          .eq('id', editingLog.id);

        if (updateError) throw updateError;
        setSuccess('Task updated successfully!');
      } else {
        // Insert new log
        const { error: insertError } = await supabase
          .from('time_logs')
          .insert([payload]);

        if (insertError) throw insertError;
        setSuccess('Task logged successfully!');
      }

      handleReset();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      console.error('Submission error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred while logging the task.';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>{editingLog ? '✍️' : '⏱️'}</span> {editingLog ? 'Edit Time Log' : 'Log Time Entry'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {editingLog ? 'Update your selected task entry' : 'Log project hours or start a new stopwatch'}
          </p>
        </div>
        {editingLog && (
          <button 
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all cursor-pointer"
          >
            Cancel Edit
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Date & Project Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Logging Date
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all"
              required
            />
          </div>

          <div>
            <label htmlFor="project" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Project
            </label>
            <select
              id="project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all cursor-pointer"
              required
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Task Description */}
        <div>
          <label htmlFor="description" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Task Description
          </label>
          <input
            type="text"
            id="description"
            placeholder="Describe what you worked on..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all"
            required
          />
        </div>

        {/* Time Entry Switcher */}
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Tracking Mode
          </label>
          <div className="flex rounded-xl bg-slate-100 p-1 w-full max-w-md">
            <button
              type="button"
              onClick={() => setTimeEntryMode('range')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                timeEntryMode === 'range' 
                  ? 'bg-white text-sky-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🕒 Time Range
            </button>
            <button
              type="button"
              onClick={() => setTimeEntryMode('duration')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                timeEntryMode === 'duration' 
                  ? 'bg-white text-sky-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ✍️ Manual
            </button>
            <button
              type="button"
              onClick={() => setTimeEntryMode('timer')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                timeEntryMode === 'timer' 
                  ? 'bg-white text-sky-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ⏱️ Stopwatch
            </button>
          </div>

          <div className="mt-4 min-h-[90px] rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
            {timeEntryMode === 'range' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-100 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-100 outline-none"
                  />
                </div>
              </div>
            )}

            {timeEntryMode === 'duration' && (
              <div className="animate-in fade-in duration-200">
                <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1">Duration (HH:MM)</label>
                <input
                  type="text"
                  placeholder="e.g. 4:30 or 0:45"
                  value={directDuration}
                  onChange={(e) => setDirectDuration(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-100 outline-none placeholder-slate-300"
                />
              </div>
            )}

            {timeEntryMode === 'timer' && (
              <div className="flex flex-col items-center justify-center py-2 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  {timerIsRunning && (
                    <span className="flex h-3.5 w-3.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
                    </span>
                  )}
                  <span className="font-mono text-3xl font-black tracking-wider text-slate-900 tabular-nums">
                    {formatSecondsToHMS(timerElapsed)}
                  </span>
                </div>

                <div className="flex gap-2.5 mt-4">
                  {!timerIsRunning ? (
                    timerElapsed === 0 ? (
                      <button
                        type="button"
                        onClick={handleStartTimer}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        Start Timer
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleResumeTimer}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={handleStopAndFillTimer}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
                        >
                          Stop & Log
                        </button>
                        <button
                          type="button"
                          onClick={handleResetTimer}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-extrabold px-4 py-2 rounded-xl active:scale-95 transition-all cursor-pointer"
                        >
                          Reset
                        </button>
                      </>
                    )
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handlePauseTimer}
                        className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        Pause
                      </button>
                      <button
                        type="button"
                        onClick={handleStopAndFillTimer}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        Stop & Log
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Remarks / Blockers */}
        <div>
          <label htmlFor="remarks" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Remarks / Blockers (Optional)
          </label>
          <textarea
            id="remarks"
            rows={2}
            placeholder="Any extra details, ticket numbers, or project blockers..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all resize-none"
          />
        </div>

        {/* Messaging Panels */}
        {error && (
          <div className="rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3.5 text-xs text-rose-700 font-semibold animate-in fade-in duration-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl bg-emerald-50 border-l-4 border-emerald-500 p-3.5 text-xs text-emerald-700 font-semibold animate-in fade-in duration-200">
            {success}
          </div>
        )}

        {/* Submit Log Button */}
        <button
          type="submit"
          disabled={isSubmitting || timerIsRunning}
          className={`w-full py-3 px-6 rounded-xl font-bold text-sm text-white transition-all shadow-md cursor-pointer ${
            isSubmitting || timerIsRunning
              ? 'bg-slate-300 cursor-not-allowed shadow-none' 
              : editingLog 
                ? 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98]'
                : 'bg-sky-600 hover:bg-sky-700 active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? 'Logging...' : editingLog ? 'Update Time Log' : 'Submit Time Log'}
        </button>
      </form>
    </div>
  );
}
