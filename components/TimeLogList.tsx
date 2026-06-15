"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface Project {
  id: string;
  name: string;
}

interface TimeLog {
  id: string;
  project_id: string;
  description: string;
  remarks: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  direct_duration: string | null;
  projects?: Project; // Join result
}

interface TimeLogListProps {
  onEdit?: (log: TimeLog) => void;
  refreshTrigger?: number;
}

export default function TimeLogList({ onEdit, refreshTrigger }: TimeLogListProps) {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [filterProject, setFilterProject] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const fetchInitialData = async () => {
    setIsLoading(true);
    const [logsRes, projectsRes] = await Promise.all([
      supabase.from('time_logs').select('*, projects(id, name)').order('date', { ascending: false }),
      supabase.from('projects').select('id, name').order('name', { ascending: true })
    ]);

    if (logsRes.data) setLogs(logsRes.data);
    if (projectsRes.data) setProjects(projectsRes.data);
    setIsLoading(false);
  };

  useEffect(() => {
    (async () => {
      await fetchInitialData();
    })();
  }, [refreshTrigger]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesProject = !filterProject || log.project_id === filterProject;
      const matchesStart = !filterStartDate || log.date >= filterStartDate;
      const matchesEnd = !filterEndDate || log.date <= filterEndDate;
      return matchesProject && matchesStart && matchesEnd;
    });
  }, [logs, filterProject, filterStartDate, filterEndDate]);

  // Total Hours Calculation
  const totalHours = useMemo(() => {
    let totalMinutes = 0;
    filteredLogs.forEach(log => {
      if (log.direct_duration) {
        // Format: "X hours Y mins"
        const hoursMatch = log.direct_duration.match(/(\d+)\s*hours/);
        const minsMatch = log.direct_duration.match(/(\d+)\s*mins/);
        if (hoursMatch) totalMinutes += parseInt(hoursMatch[1]) * 60;
        if (minsMatch) totalMinutes += parseInt(minsMatch[1]);
      } else if (log.start_time && log.end_time) {
        const start = new Date(`1970-01-01T${log.start_time}`);
        const end = new Date(`1970-01-01T${log.end_time}`);
        totalMinutes += (end.getTime() - start.getTime()) / 60000;
      }
    });
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${h}h ${m}m`;
  }, [filteredLogs]);

  // CSV Export
  function exportToCSV() {
    const headers = ['Date', 'Project', 'Description', 'Duration', 'Remarks'];
    const rows = filteredLogs.map(log => [
      log.date,
      log.projects?.name || 'Unknown',
      log.description,
      log.direct_duration || `${log.start_time} - ${log.end_time}`,
      log.remarks || ''
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `time-logs-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this log entry?')) return;
    const { error } = await supabase.from('time_logs').delete().eq('id', id);
    if (!error) setLogs(logs.filter(l => l.id !== id));
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 mt-12 bg-white rounded-2xl shadow-sm border border-gray-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>📅</span> Time Logs Explorer
          </h2>
          <p className="text-sm text-gray-500 mt-1">Review, filter, and export your daily activity</p>
        </div>
        
        <div className="flex items-center gap-4 bg-sky-50 px-4 py-2 rounded-xl">
          <div className="text-right">
            <p className="text-xs font-bold text-sky-600 uppercase tracking-wider">Total Time</p>
            <p className="text-xl font-black text-sky-900">{totalHours}</p>
          </div>
          <button
            onClick={exportToCSV}
            className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold py-2 px-4 rounded-lg shadow-sm transition-all active:scale-95"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Project</label>
          <select 
            value={filterProject} 
            onChange={(e) => setFilterProject(e.target.value)}
            className="w-full text-sm rounded-lg border border-gray-300 p-2 bg-white"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Start Date</label>
          <input 
            type="date" 
            value={filterStartDate} 
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="w-full text-sm rounded-lg border border-gray-300 p-2 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">End Date</label>
          <input 
            type="date" 
            value={filterEndDate} 
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="w-full text-sm rounded-lg border border-gray-300 p-2 bg-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-4 px-2 text-xs font-bold text-gray-400 uppercase">Date</th>
              <th className="py-4 px-2 text-xs font-bold text-gray-400 uppercase">Project</th>
              <th className="py-4 px-2 text-xs font-bold text-gray-400 uppercase">Description</th>
              <th className="py-4 px-2 text-xs font-bold text-gray-400 uppercase">Duration</th>
              <th className="py-4 px-2 text-xs font-bold text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredLogs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="py-4 px-2 text-sm font-medium text-gray-600">{log.date}</td>
                <td className="py-4 px-2 text-sm">
                  <span className="bg-sky-50 text-sky-700 px-2 py-1 rounded text-xs font-bold">
                    {log.projects?.name || 'N/A'}
                  </span>
                </td>
                <td className="py-4 px-2 text-sm text-gray-800">
                  <div className="font-semibold">{log.description}</div>
                  {log.remarks && <div className="text-xs text-gray-400 mt-0.5">{log.remarks}</div>}
                </td>
                <td className="py-4 px-2 text-sm font-mono text-gray-600">
                  {log.direct_duration || `${log.start_time?.slice(0,5)} - ${log.end_time?.slice(0,5)}`}
                </td>
                <td className="py-4 px-2 text-sm">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => onEdit && onEdit(log)}
                      className="text-gray-300 hover:text-sky-500 transition-colors"
                      title="Edit Log"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleDelete(log.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Delete Log"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredLogs.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-gray-400 italic">No logs found for the selected filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
