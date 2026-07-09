"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---
interface Project {
  id: string;
  name: string;
}

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

// Helper function to convert interval string (e.g. "2 hours 10 mins") back to total minutes
const parseDurationToMinutes = (durationStr: string): number => {
  const hoursMatch = durationStr.match(/(\d+)\s*hours?/);
  const minsMatch = durationStr.match(/(\d+)\s*mins?/);
  let totalMins = 0;
  if (hoursMatch) totalMins += parseInt(hoursMatch[1], 10) * 60;
  if (minsMatch) totalMins += parseInt(minsMatch[1], 10);
  return totalMins;
};

export default function TimeLogForm({ projectsList, editingLog, onSuccess, onCancel }: TimeLogFormProps) {
  // 1. Form State
  const [date, setDate] = useState<string>(() => editingLog?.date || new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState<string>(() => editingLog?.project_id || '');
  const [description, setDescription] = useState<string>(() => editingLog?.description || '');
  const [remarks, setRemarks] = useState<string>(() => editingLog?.remarks || '');
  
  // Logged Duration State (in minutes)
  const [directDuration, setDirectDuration] = useState<string>(() => {
    if (!editingLog) return '';
    if (editingLog.direct_duration) {
      const parsedMins = parseDurationToMinutes(editingLog.direct_duration);
      return parsedMins > 0 ? parsedMins.toString() : '';
    } else if (editingLog.start_time && editingLog.end_time) {
      // Fallback for older time-range logs
      const start = new Date(`1970-01-01T${editingLog.start_time}`);
      const end = new Date(`1970-01-01T${editingLog.end_time}`);
      const totalMins = Math.round((end.getTime() - start.getTime()) / 60000);
      return totalMins > 0 ? totalMins.toString() : '';
    }
    return '';
  });
  
  // UI & Data State
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  // 3. Form Actions & Submission
  const formatDurationToInterval = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours} hours ${mins} mins`;
  };

  const handleReset = () => {
    setDescription('');
    setRemarks('');
    setDirectDuration('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!projectId) return setError('Please select a project.');
    if (!description.trim()) return setError('Task description is required.');

    const durationMinutes = parseInt(directDuration, 10);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      return setError('Please enter a valid duration in minutes.');
    }

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
      direct_duration: formatDurationToInterval(durationMinutes),
    };

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

  // Helper for dynamic duration preview in hours/mins
  const getDurationPreview = (val: string) => {
    const mins = parseInt(val, 10);
    if (isNaN(mins) || mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) {
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${m}m`;
  };

  const durationPreview = getDurationPreview(directDuration);

  const handlePresetClick = (mins: number) => {
    setDirectDuration(mins.toString());
    setError(null);
  };

  const handleIncrementClick = (minsToAdd: number) => {
    const current = parseInt(directDuration, 10) || 0;
    const nextVal = Math.max(0, current + minsToAdd);
    setDirectDuration(nextVal > 0 ? nextVal.toString() : '');
    setError(null);
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
            {editingLog ? 'Update your selected task entry' : 'Log project hours in minutes'}
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

        {/* Time Entry - Minutes Only */}
        <div>
          <label htmlFor="duration" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Logged Duration (in minutes)
            {durationPreview && (
              <span className="text-sky-600 font-extrabold ml-1.5 normal-case">
                ({durationPreview})
              </span>
            )}
          </label>
          <div className="flex flex-col gap-2">
            <input
              type="number"
              id="duration"
              min="1"
              step="1"
              placeholder="e.g. 30, 60, 120, 130"
              value={directDuration}
              onChange={(e) => setDirectDuration(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all placeholder-slate-300"
              required
            />
            
            {/* Quick Presets & Increment Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => handlePresetClick(30)}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                30m
              </button>
              <button
                type="button"
                onClick={() => handlePresetClick(60)}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                1h
              </button>
              <button
                type="button"
                onClick={() => handlePresetClick(90)}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                1.5h
              </button>
              <button
                type="button"
                onClick={() => handlePresetClick(120)}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                2h
              </button>
              <button
                type="button"
                onClick={() => handlePresetClick(180)}
                className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                3h
              </button>
              <div className="h-4 w-px bg-slate-200 mx-1"></div>
              <button
                type="button"
                onClick={() => handleIncrementClick(15)}
                className="rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                +15m
              </button>
              <button
                type="button"
                onClick={() => handleIncrementClick(30)}
                className="rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              >
                +30m
              </button>
            </div>
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
          disabled={isSubmitting}
          className={`w-full py-3 px-6 rounded-xl font-bold text-sm text-white transition-all shadow-md cursor-pointer ${
            isSubmitting
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
