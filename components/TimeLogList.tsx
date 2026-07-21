"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---
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
  category?: string;
  projects?: Project;
  userName?: string;
  userPin?: string;
}

interface TimeLogListProps {
  logsList?: TimeLog[];
  projectsList?: Project[];
  onEdit?: (log: TimeLog) => void;
  onLogsChange?: () => void;
  isAdmin?: boolean;
}

export default function TimeLogList({ logsList, projectsList, onEdit, onLogsChange, isAdmin = false }: TimeLogListProps) {
  // 1. Local states (fallbacks if parent props are missing)
  const [localLogs, setLocalLogs] = useState<TimeLog[]>([]);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  // Client-side computed date strings to avoid SSR hydration mismatches
  const [dateStrings, setDateStrings] = useState<{
    today: string;
    yesterday: string;
    thisWeekStart: string;
  } | null>(null);

  const logs = logsList || localLogs;
  const projects = projectsList || localProjects;

  // Helper to format date as YYYY-MM-DD
  const formatLocalDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Initialize client-side dates and set today's logs as default
  useEffect(() => {
    const t = new Date();
    const today = formatLocalDate(t);

    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = formatLocalDate(y);

    const w = new Date();
    const day = w.getDay();
    const diff = w.getDate() - day + (day === 0 ? -6 : 1); // standard work week starting Monday
    const thisWeekStart = formatLocalDate(new Date(w.setDate(diff)));

    Promise.resolve().then(() => {
      setDateStrings({ today, yesterday, thisWeekStart });
      setFilterStartDate(today);
      setFilterEndDate(today);
    });
  }, []);

  // 2. Fetch fallbacks if not supplied by parent
  useEffect(() => {
    if (!logsList || !projectsList) {
      const fetchInitialData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const [logsRes, projectsRes, profilesRes] = await Promise.all([
            supabase.from('time_logs').select('*, projects(id, name)').order('date', { ascending: false }),
            supabase.from('projects').select('id, name').order('name', { ascending: true }),
            supabase.from('profiles').select('id, name, pin')
          ]);

          if (logsRes.error) throw logsRes.error;
          if (projectsRes.error) throw projectsRes.error;

          const profilesMap = new Map(profilesRes.data?.map(p => [p.id, p]) || []);
          const joinedLogs = (logsRes.data || []).map(log => ({
            ...log,
            userName: profilesMap.get(log.user_id)?.name || 'Unknown User',
            userPin: profilesMap.get(log.user_id)?.pin || 'N/A'
          }));

          setLocalLogs(joinedLogs);
          if (projectsRes.data) setLocalProjects(projectsRes.data);
        } catch (err: unknown) {
          console.error("Error fetching data locally:", err);
          setError("Failed to load time logs. Check database connection.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchInitialData();
    }
  }, [logsList, projectsList]);

  // 3. Filtered Logs Calculation
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesProject = !filterProject || log.project_id === filterProject;
      const matchesCategory = !filterCategory || (log.category || 'Development') === filterCategory;
      const matchesStart = !filterStartDate || log.date >= filterStartDate;
      const matchesEnd = !filterEndDate || log.date <= filterEndDate;
      
      const searchLower = searchText.toLowerCase();
      const matchesSearch = !searchText || 
        log.description.toLowerCase().includes(searchLower) ||
        (log.remarks && log.remarks.toLowerCase().includes(searchLower)) ||
        (log.projects?.name && log.projects.name.toLowerCase().includes(searchLower)) ||
        (log.userName && log.userName.toLowerCase().includes(searchLower)) ||
        (log.userPin && log.userPin.toLowerCase().includes(searchLower)) ||
        (log.category && log.category.toLowerCase().includes(searchLower));

      return matchesProject && matchesCategory && matchesStart && matchesEnd && matchesSearch;
    });
  }, [logs, filterProject, filterCategory, filterStartDate, filterEndDate, searchText]);

  // 4. Calculate total hours for filtered logs
  const totalHours = useMemo(() => {
    let totalMinutes = 0;
    filteredLogs.forEach(log => {
      if (log.direct_duration) {
        const hoursMatch = log.direct_duration.match(/(\d+)\s*hours?/);
        const minsMatch = log.direct_duration.match(/(\d+)\s*mins?/);
        if (hoursMatch) totalMinutes += parseInt(hoursMatch[1], 10) * 60;
        if (minsMatch) totalMinutes += parseInt(minsMatch[1], 10);
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

  // 5. Actions
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log entry? This action is permanent.')) return;
    setError(null);
    try {
      const { error: deleteError } = await supabase.from('time_logs').delete().eq('id', id);
      if (deleteError) throw deleteError;

      // Notify parent
      if (onLogsChange) onLogsChange();
    } catch (err: unknown) {
      console.error("Delete error:", err);
      setError("Failed to delete log entry. Please try again.");
    }
  };

  const exportToCSV = () => {
    if (filteredLogs.length === 0) {
      alert("No data available to export with the current filters.");
      return;
    }
    
    const headers = isAdmin
      ? ['User Name', 'PIN', 'Date', 'Project', 'Category', 'Description', 'Duration', 'Remarks']
      : ['Date', 'Project', 'Category', 'Description', 'Duration', 'Remarks'];

    const rows = filteredLogs.map(log => {
      const baseFields = [
        `"${log.date}"`,
        `"${log.projects?.name || 'Unknown Project'}"`,
        `"${log.category || 'Development'}"`,
        `"${log.description.replace(/"/g, '""')}"`,
        `"${log.direct_duration || `${log.start_time?.slice(0, 5)} - ${log.end_time?.slice(0, 5)}`}"`,
        `"${(log.remarks || '').replace(/"/g, '""')}"`
      ];
      
      if (isAdmin) {
        return [
          `"${log.userName || 'Unknown User'}"`,
          `"${log.userPin || 'N/A'}"`,
          ...baseFields
        ];
      }
      return baseFields;
    });

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `timelog-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearFilters = () => {
    setFilterProject('');
    setFilterCategory('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearchText('');
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
          <p className="text-sm text-slate-500">Loading history explorer...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      {/* Header and Summary stats */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-6 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>📅</span> {isAdmin ? 'Team Time Logs Explorer' : 'Time Logs Explorer'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAdmin ? 'Filter, search, inspect, and export time logs for all team members' : 'Filter, search, and export your daily tracked hours'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-100 px-4 py-3 rounded-2xl">
          <div className="text-slate-600 border-r border-slate-200 pr-3 mr-1">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Total Filtered</span>
            <span className="text-sm font-bold text-slate-700">{filteredLogs.length} logs</span>
          </div>
          <div className="text-slate-600 border-r border-slate-200 pr-4">
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Accumulated Time</span>
            <span className="text-sm font-black text-sky-700">{totalHours}</span>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3.5 text-xs text-rose-700 font-semibold mb-5">
          {error}
        </div>
      )}

      {/* Quick Date Presets */}
      {dateStrings && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Date Presets:</span>
          <button
            type="button"
            onClick={() => {
              setFilterStartDate(dateStrings.today);
              setFilterEndDate(dateStrings.today);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
              filterStartDate === dateStrings.today && filterEndDate === dateStrings.today
                ? 'bg-sky-600 border-sky-600 text-white shadow-sm scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStartDate(dateStrings.yesterday);
              setFilterEndDate(dateStrings.yesterday);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
              filterStartDate === dateStrings.yesterday && filterEndDate === dateStrings.yesterday
                ? 'bg-sky-600 border-sky-600 text-white shadow-sm scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStartDate(dateStrings.thisWeekStart);
              setFilterEndDate(dateStrings.today);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
              filterStartDate === dateStrings.thisWeekStart && filterEndDate === dateStrings.today
                ? 'bg-sky-600 border-sky-600 text-white shadow-sm scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterStartDate('');
              setFilterEndDate('');
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
              !filterStartDate && !filterEndDate
                ? 'bg-sky-600 border-sky-600 text-white shadow-sm scale-105'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Time
          </button>
        </div>
      )}

      {/* Advanced Filter Toolbar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 bg-slate-50/50 rounded-2xl border border-slate-100 p-4 mb-6">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Search Tasks</label>
          <div className="relative">
            <input
              type="text"
              placeholder={isAdmin ? "Search description..." : "Search description/remarks..."}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-2 text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-100 outline-none transition-all placeholder-slate-300"
            />
            <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Project</label>
          <select 
            value={filterProject} 
            onChange={(e) => setFilterProject(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 outline-none cursor-pointer"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Category</label>
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 outline-none cursor-pointer"
          >
            <option value="">All Categories</option>
            <option value="Development">Development</option>
            <option value="Design">Design</option>
            <option value="Meeting">Meeting</option>
            <option value="Code Review">Code Review</option>
            <option value="QA">QA / Testing</option>
            <option value="Support">Support / Ops</option>
            <option value="Analysis">Analysis</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">From Date</label>
          <input 
            type="date" 
            value={filterStartDate} 
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">To Date</label>
          <input 
            type="date" 
            value={filterEndDate} 
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 outline-none"
          />
        </div>
      </div>

      {/* Clear Filter Indicator */}
      {(filterProject || filterCategory || filterStartDate || filterEndDate || searchText) && (
        <div className="flex justify-between items-center bg-sky-50/50 border border-sky-100 rounded-xl px-4 py-2 mb-6">
          <p className="text-xs text-sky-800 font-semibold">
            Active filters are reducing the records shown below.
          </p>
          <button
            onClick={handleClearFilters}
            className="text-[10px] font-extrabold uppercase tracking-wider text-sky-600 hover:text-sky-800 transition-all cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* Empty State */}
      {filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-bold text-slate-700">No time logs matched</p>
          <p className="mt-1 text-xs text-slate-400 text-center max-w-[280px]">
            Try adjusting your search query, clearing filters, or logging a new task.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Card Grid View */}
          <div className="grid grid-cols-1 gap-4 sm:hidden">
            {filteredLogs.map(log => (
              <div key={log.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">{log.date}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-sky-50 border border-sky-100 text-sky-700 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                      {log.projects?.name || 'N/A'}
                    </span>
                    <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg text-[10px] font-extrabold">
                      {log.category || 'Development'}
                    </span>
                  </div>
                </div>
                
                {isAdmin && (
                  <div className="text-xs font-bold text-slate-800 bg-slate-50 rounded-lg p-2 border border-slate-100 flex items-center justify-between">
                    <span>👤 {log.userName}</span>
                    <span className="text-slate-400 font-semibold text-[10px]">PIN: {log.userPin}</span>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold text-slate-800 leading-tight">{log.description}</h4>
                  {log.remarks && <p className="text-xs text-slate-400 mt-1">{log.remarks}</p>}
                </div>

                <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                  <span className="font-mono text-xs font-extrabold text-slate-600">
                    ⏱️ {log.direct_duration || `${log.start_time?.slice(0, 5)} - ${log.end_time?.slice(0, 5)}`}
                  </span>
                  
                  <div className="flex gap-2">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(log)}
                        className="text-sky-600 hover:bg-sky-50 px-2 py-1 rounded-md text-[11px] font-extrabold transition-all cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-md text-[11px] font-extrabold transition-all cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  <th className="py-3.5 px-2">Date</th>
                  {isAdmin && <th className="py-3.5 px-2">Team Member</th>}
                  <th className="py-3.5 px-2">Project</th>
                  <th className="py-3.5 px-2">Category</th>
                  <th className="py-3.5 px-2">Description</th>
                  <th className="py-3.5 px-2 text-center">Duration</th>
                  <th className="py-3.5 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/40 transition-colors group">
                    <td className="py-4 px-2 text-xs font-semibold text-slate-600 whitespace-nowrap">{log.date}</td>
                    {isAdmin && (
                      <td className="py-4 px-2 whitespace-nowrap">
                        <div className="font-bold text-slate-800 text-xs truncate max-w-[120px]">{log.userName}</div>
                        <div className="text-[10px] font-semibold text-slate-400">PIN: {log.userPin}</div>
                      </td>
                    )}
                    <td className="py-4 px-2">
                      <span className="inline-block bg-sky-50 border border-sky-100 text-sky-700 px-2 py-1 rounded-lg text-[10px] font-bold max-w-[120px] truncate">
                        {log.projects?.name || 'N/A'}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <span className="inline-block bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold whitespace-nowrap">
                        {log.category || 'Development'}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-xs text-slate-800">
                      <div className="font-bold text-slate-800 leading-normal">{log.description}</div>
                      {log.remarks && <div className="text-[10px] text-slate-400 mt-0.5">{log.remarks}</div>}
                    </td>
                    <td className="py-4 px-2 text-xs font-mono font-bold text-slate-600 text-center whitespace-nowrap">
                      {log.direct_duration || `${log.start_time?.slice(0, 5)} - ${log.end_time?.slice(0, 5)}`}
                    </td>
                    <td className="py-4 px-2 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(log)}
                            className="text-sky-600 hover:bg-sky-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
