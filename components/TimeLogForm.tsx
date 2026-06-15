"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---

interface Project {
  id: string;
  name: string;
}

type TimeEntryMode = 'range' | 'duration';

interface TimeLogFormProps {
  editingLog?: {
    id: string;
    date: string;
    project_id: string;
    description: string;
    remarks?: string;
    direct_duration?: string;
    start_time?: string;
    end_time?: string;
  } | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

// --- Component ---

export default function TimeLogForm({ editingLog, onSuccess, onCancel }: TimeLogFormProps) {
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
  
  // UI & Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Effect to populate form when editingLog changes
  useEffect(() => {
    const loadEditingData = () => {
      if (editingLog) {
        setDate(editingLog.date);
        setProjectId(editingLog.project_id);
        setDescription(editingLog.description);
        setRemarks(editingLog.remarks || '');
        
        if (editingLog.direct_duration) {
          setTimeEntryMode('duration');
          const hoursMatch = editingLog.direct_duration.match(/(\d+)\s*hours/);
          const minsMatch = editingLog.direct_duration.match(/(\d+)\s*mins/);
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
    };
    loadEditingData();
  }, [editingLog]);

  // 2. Fetch Projects on Mount
  useEffect(() => {
    async function fetchProjects() {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });

      if (fetchError) {
        console.error('Error fetching projects:', fetchError);
        setError('Failed to load projects. Please check your Supabase connection.');
      } else {
        setProjects(data || []);
      }
    }
    fetchProjects();
  }, []);

  // 3. Helpers & Validation
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
    // Basic string comparison works for HH:MM format
    return start < end;
  };

  const handleReset = () => {
    setDescription('');
    setRemarks('');
    setStartTime('');
    setEndTime('');
    setDirectDuration('');
    // Date is NOT cleared per requirements
  };

  // 4. Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Basic Validation
    if (!projectId) return setError('Please select a project.');
    if (!description.trim()) return setError('Task description is required.');

    // Mode-specific validation
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
      if (!directDuration) return setError('Please enter a duration (e.g., 4:30).');
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
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 border-b border-gray-200 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <span>📋</span> {editingLog ? 'Edit Time Log' : 'Project Time Log Dashboard'}
          </h1>
          <p className="mt-2 text-sm text-gray-500 font-medium">
            Date Context: <span className="text-sky-600 bg-sky-50 px-2 py-1 rounded">{date}</span>
          </p>
        </div>
        {editingLog && (
          <button 
            type="button"
            onClick={onCancel}
            className="text-sm font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-4 py-2 rounded-lg transition-colors"
          >
            Cancel Editing
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        {/* Sticky Date Context Picker */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="date" className="block text-sm font-semibold text-gray-700 mb-2">
              Logging Date
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-sky-600 focus:border-sky-600 outline-none transition-all"
              required
            />
          </div>

          {/* Relational Dropdown */}
          <div>
            <label htmlFor="project" className="block text-sm font-semibold text-gray-700 mb-2">
              Project
            </label>
            <select
              id="project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-sky-600 focus:border-sky-600 outline-none transition-all bg-white"
              required
            >
              <option value="">Select an active project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Task Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
            Task Description
          </label>
          <input
            type="text"
            id="description"
            placeholder="What did you work on?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-sky-600 focus:border-sky-600 outline-none transition-all"
            required
          />
        </div>

        {/* Polymorphic Time Entry Controller */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Time Entry Mode
          </label>
          <div className="flex p-1 bg-gray-100 rounded-lg w-full max-w-sm mb-4">
            <button
              type="button"
              onClick={() => setTimeEntryMode('range')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                timeEntryMode === 'range' 
                  ? 'bg-white text-sky-700 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Use Time Range
            </button>
            <button
              type="button"
              onClick={() => setTimeEntryMode('duration')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                timeEntryMode === 'duration' 
                  ? 'bg-white text-sky-700 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Enter Direct Duration
            </button>
          </div>

          {timeEntryMode === 'range' ? (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-sky-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-sky-600 outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Duration (HH:MM)</label>
              <input
                type="text"
                placeholder="e.g. 4:30"
                value={directDuration}
                onChange={(e) => setDirectDuration(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:ring-2 focus:ring-sky-600 outline-none"
              />
            </div>
          )}
        </div>

        {/* Remarks */}
        <div>
          <label htmlFor="remarks" className="block text-sm font-semibold text-gray-700 mb-2">
            Remarks / Blockers
          </label>
          <textarea
            id="remarks"
            rows={3}
            placeholder="Extra context, ticket references, or blockers..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-sky-600 focus:border-sky-600 outline-none transition-all resize-none"
          />
        </div>

        {/* Notifications */}
        {error && (
          <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm animate-in fade-in duration-200">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 text-sm animate-in fade-in duration-200">
            <p className="font-bold">Success</p>
            <p>{success}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 px-6 rounded-lg font-bold text-white transition-all shadow-md active:scale-[0.98] ${
            isSubmitting 
              ? 'bg-gray-400 cursor-not-allowed' 
              : editingLog 
                ? 'bg-amber-500 hover:bg-amber-600 focus:ring-4 focus:ring-amber-200'
                : 'bg-sky-600 hover:bg-sky-700 focus:ring-4 focus:ring-sky-200'
          }`}
        >
          {isSubmitting ? 'Processing...' : editingLog ? 'Update Log Entry' : 'Submit Log Entry'}
        </button>
      </form>
    </div>
  );
}
