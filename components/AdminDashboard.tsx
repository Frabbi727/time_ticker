"use client";

import React, { useState, useMemo } from 'react';

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

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  punch_in: string;
  punch_out: string | null;
  userName?: string;
  userPin?: string;
}

interface AdminDashboardProps {
  logs: TimeLog[];
  teamUsers: any[];
  todayAttendance: AttendanceRecord[];
  projects: Project[];
}

export default function AdminDashboard({ logs, teamUsers, todayAttendance, projects }: AdminDashboardProps) {
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'working' | 'completed' | 'offline'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('');

  const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  const activeUsersCount = new Set(todayAttendance.filter(a => !a.punch_out).map(a => a.user_id)).size;
  const completedShiftsCount = todayAttendance.filter(a => a.punch_out).length;

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getShiftDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.round((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  const parseLogMinutes = (log: TimeLog): number => {
    if (log.direct_duration) {
      const hoursMatch = log.direct_duration.match(/(\d+)\s*hours?/);
      const minsMatch = log.direct_duration.match(/(\d+)\s*mins?/);
      let mins = 0;
      if (hoursMatch) mins += parseInt(hoursMatch[1], 10) * 60;
      if (minsMatch) mins += parseInt(minsMatch[1], 10);
      return mins;
    } else if (log.start_time && log.end_time) {
      const start = new Date(`1970-01-01T${log.start_time}`);
      const end = new Date(`1970-01-01T${log.end_time}`);
      return (end.getTime() - start.getTime()) / 60000;
    }
    return 0;
  };

  // --- Chart 1 Dataset: Last 7 Days Activity (Daily counts or individual hours) ---
  const attendanceTrendData = useMemo(() => {
    const data = [];
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toLocaleDateString("en-CA");
      const label = weekdays[d.getDay()];

      const dayLogs = logs.filter(l => l.date === dateKey && (!selectedUserFilter || l.userPin === selectedUserFilter));
      
      let val = 0;
      if (selectedUserFilter) {
        let mins = 0;
        dayLogs.forEach(l => {
          mins += parseLogMinutes(l);
        });
        val = Math.round((mins / 60) * 10) / 10;
      } else {
        val = new Set(dayLogs.map(l => l.userPin)).size;
      }

      data.push({
        label,
        date: dateKey,
        val
      });
    }
    return data;
  }, [logs, selectedUserFilter]);

  // Max value for 7-day trend chart scaling
  const maxTrendVal = useMemo(() => {
    const maxVal = Math.max(...attendanceTrendData.map(d => d.val));
    return maxVal > 0 ? maxVal : 5;
  }, [attendanceTrendData]);

  // --- Chart 2 Dataset: Today's Project Time Allocation ---
  const projectAllocationData = useMemo(() => {
    const projMap: Record<string, { name: string; minutes: number }> = {};
    projects.forEach(p => {
      projMap[p.id] = { name: p.name, minutes: 0 };
    });

    let totalMinutes = 0;
    logs.forEach(log => {
      if (log.date === todayStr && (!selectedUserFilter || log.userPin === selectedUserFilter)) {
        const mins = parseLogMinutes(log);
        totalMinutes += mins;
        if (projMap[log.project_id]) {
          projMap[log.project_id].minutes += mins;
        }
      }
    });

    const colors = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    let colorIdx = 0;

    const dataset = Object.keys(projMap)
      .map(id => {
        const item = projMap[id];
        const percentage = totalMinutes > 0 ? Math.round((item.minutes / totalMinutes) * 100) : 0;
        return {
          id,
          name: item.name,
          minutes: item.minutes,
          percentage,
          color: colors[colorIdx++ % colors.length]
        };
      })
      .filter(item => item.minutes > 0);

    return {
      dataset,
      totalMinutes
    };
  }, [logs, projects, todayStr, selectedUserFilter]);

  // Calculate SVG Doughnut segments
  const doughnutSegments = useMemo(() => {
    const segments: any[] = [];
    let accumulatedPercent = 0;
    const radius = 50;
    const circumference = 2 * Math.PI * radius; // 314.159

    projectAllocationData.dataset.forEach(item => {
      const strokeOffset = circumference - (item.percentage / 100) * circumference;
      const rotation = (accumulatedPercent / 100) * 360;
      accumulatedPercent += item.percentage;

      segments.push({
        ...item,
        strokeOffset,
        rotation
      });
    });

    return segments;
  }, [projectAllocationData]);

  // Filter Today's logs and attendance based on selected user filter
  const filteredTodayLogs = useMemo(() => {
    return logs.filter(log => {
      const isToday = log.date === todayStr;
      const matchesUser = !selectedUserFilter || log.userPin === selectedUserFilter;
      const matchesProject = !selectedProjectFilter || log.project_id === selectedProjectFilter;
      return isToday && matchesUser && matchesProject;
    });
  }, [logs, selectedUserFilter, selectedProjectFilter, todayStr]);

  const filteredTodayAttendance = useMemo(() => {
    const profilesMap = new Map(teamUsers.map(u => [u.id, u]));
    const mapped = todayAttendance.map(a => ({
      ...a,
      userName: profilesMap.get(a.user_id)?.name || 'Unknown User',
      userPin: profilesMap.get(a.user_id)?.pin || 'N/A'
    }));

    return mapped.filter(a => {
      return !selectedUserFilter || a.userPin === selectedUserFilter;
    });
  }, [todayAttendance, teamUsers, selectedUserFilter]);

  // Attendance rate is calculated for the selected user (100% if checked in, 0% otherwise) or globally
  const attendanceRate = useMemo(() => {
    if (selectedUserFilter) {
      const hasCheckedIn = filteredTodayAttendance.length > 0;
      return hasCheckedIn ? 100 : 0;
    }
    const uniqueAttendees = new Set(todayAttendance.map(a => a.user_id)).size;
    return teamUsers.length > 0 ? Math.round((uniqueAttendees / teamUsers.length) * 100) : 0;
  }, [todayAttendance, teamUsers, selectedUserFilter, filteredTodayAttendance]);

  // workforceDetails lists all users with their combined attendance and work time log summaries
  const workforceDetails = useMemo(() => {
    return teamUsers.map(user => {
      const userRecords = todayAttendance.filter(a => a.user_id === user.id);
      const activeRecord = userRecords.find(a => !a.punch_out) || null;
      const lastCompletedRecord = userRecords
        .filter(a => a.punch_out)
        .sort((a, b) => new Date(b.punch_out!).getTime() - new Date(a.punch_out!).getTime())[0] || null;
      
      let status: 'working' | 'completed' | 'offline' = 'offline';
      if (activeRecord) {
        status = 'working';
      } else if (lastCompletedRecord) {
        status = 'completed';
      }

      let minutesToday = 0;
      let lastTaskDesc = '';
      let lastTaskProject = '';
      
      const userTodayLogs = logs.filter(l => l.userPin === user.pin && l.date === todayStr);
      
      // Calculate minutes for project filter if active, otherwise overall
      userTodayLogs.forEach(l => {
        if (!selectedProjectFilter || l.project_id === selectedProjectFilter) {
          minutesToday += parseLogMinutes(l);
        }
      });

      // Find the last task (optionally matching project filter)
      const lastLog = userTodayLogs.find(l => !selectedProjectFilter || l.project_id === selectedProjectFilter);
      if (lastLog) {
        lastTaskDesc = lastLog.description;
        lastTaskProject = lastLog.projects?.name || 'General';
      }

      return {
        id: user.id,
        name: user.name,
        pin: user.pin,
        role: user.role,
        status,
        punchIn: activeRecord ? activeRecord.punch_in : (lastCompletedRecord ? lastCompletedRecord.punch_in : null),
        punchOut: activeRecord ? null : (lastCompletedRecord ? lastCompletedRecord.punch_out : null),
        minutesToday,
        lastTaskDesc,
        lastTaskProject
      };
    });
  }, [teamUsers, todayAttendance, logs, todayStr, selectedProjectFilter]);

  const filteredWorkforce = useMemo(() => {
    return workforceDetails.filter(w => {
      const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.pin.includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
      const matchesGlobalFilter = !selectedUserFilter || w.pin === selectedUserFilter;
      const matchesRole = !roleFilter || w.role === roleFilter;
      
      // Filter out users who haven't logged any time on the selected project if project filter is active
      const matchesProject = !selectedProjectFilter || logs.some(l => l.userPin === w.pin && l.date === todayStr && l.project_id === selectedProjectFilter);
      
      return matchesSearch && matchesStatus && matchesGlobalFilter && matchesProject && matchesRole;
    });
  }, [workforceDetails, searchTerm, statusFilter, selectedUserFilter, selectedProjectFilter, roleFilter, logs, todayStr]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span>📊</span> Live Workforce Dashboard
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Overview metrics, active shifts, project allocations, and employee status tracking
          </p>
        </div>
        
        {/* Global Filters Clear Info */}
        {(selectedUserFilter || selectedProjectFilter || roleFilter) && (
          <div className="mt-3 md:mt-0 flex flex-wrap gap-2 items-center">
            {selectedUserFilter && (
              <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-lg">
                User PIN: {selectedUserFilter}
                <button onClick={() => setSelectedUserFilter('')} className="hover:text-indigo-900 text-xs font-black cursor-pointer ml-1">×</button>
              </span>
            )}
            {selectedProjectFilter && (
              <span className="inline-flex items-center gap-1 bg-sky-50 border border-sky-100 text-sky-700 text-[10px] font-bold px-2 py-1 rounded-lg">
                Project Filter Active
                <button onClick={() => setSelectedProjectFilter('')} className="hover:text-sky-900 text-xs font-black cursor-pointer ml-1">×</button>
              </span>
            )}
            {roleFilter && (
              <span className="inline-flex items-center gap-1 bg-violet-50 border border-violet-100 text-violet-700 text-[10px] font-bold px-2 py-1 rounded-lg">
                Role Filter Active
                <button onClick={() => setRoleFilter('')} className="hover:text-violet-900 text-xs font-black cursor-pointer ml-1">×</button>
              </span>
            )}
            <button 
              onClick={() => { setSelectedUserFilter(''); setSelectedProjectFilter(''); setRoleFilter(''); }}
              className="text-[10px] text-slate-500 hover:text-slate-700 font-extrabold uppercase tracking-wider ml-1 underline cursor-pointer"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Live Attendance Rate */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Attendance Rate</span>
            <span className="text-3xl font-black text-sky-600 block">{attendanceRate}%</span>
            <span className="text-[10px] font-semibold text-slate-400">Punched in / Team size</span>
          </div>
          <div className="h-12 w-12 rounded-full bg-sky-50 flex items-center justify-center text-sky-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Currently Active Staff */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Shifts</span>
            <span className="text-3xl font-black text-indigo-600 block">{activeUsersCount}</span>
            <span className="text-[10px] font-semibold text-slate-400">{completedShiftsCount} shifts completed today</span>
          </div>
          <div className="h-12 w-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        </div>

        {/* Log headcount today */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Team Hours Today</span>
            <span className="text-3xl font-black text-emerald-600 block">
              {Math.round(projectAllocationData.totalMinutes / 60)}h {Math.round(projectAllocationData.totalMinutes % 60)}m
            </span>
            <span className="text-[10px] font-semibold text-slate-400">{filteredTodayLogs.length} task entries saved</span>
          </div>
          <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        {/* Registered Workforce profiles */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Members</span>
            <span className="text-3xl font-black text-amber-500 block">{teamUsers.length}</span>
            <span className="text-[10px] font-semibold text-slate-400">Registered staff profiles</span>
          </div>
          <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* 3. Visual Charts Grid (Bar & Doughnut Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart A: 7-Day Team Active Members Trend (Bar Chart) */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">7-Day Team Activity</h3>
          <p className="text-xs text-slate-400 mt-0.5">Active team members logging hours daily</p>
          
          <div className="mt-8 flex h-48 items-end justify-between gap-4 px-2">
            {attendanceTrendData.map((data, idx) => {
              const heightPct = (data.val / maxTrendVal) * 100;
              return (
                <div key={idx} className="flex flex-col items-center flex-1 group gap-2">
                  <div className="relative w-full flex justify-center">
                    <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                      {selectedUserFilter ? `${data.val} hours` : `${data.val} active`}
                    </div>
                    <div 
                      style={{ height: `${heightPct > 5 ? heightPct : 5}%` }}
                      className="w-8 rounded-t-lg bg-sky-500 group-hover:bg-sky-600 transition-all duration-300 shadow-sm shadow-sky-100"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-700 transition-colors">
                    {data.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart B: Project Time Allocation Doughnut Chart */}
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Today's Project Allocation</h3>
              <p className="text-xs text-slate-400 mt-0.5">Distribution of logged minutes across projects</p>
            </div>
            {selectedProjectFilter && (
              <button
                onClick={() => setSelectedProjectFilter('')}
                className="text-[9px] font-extrabold text-sky-600 hover:text-sky-800 uppercase tracking-wider bg-sky-50 px-2 py-1 rounded-lg transition-all cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
          
          {projectAllocationData.dataset.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-xs font-bold text-slate-400">No time entries logged today.</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="relative h-36 w-36">
                <svg viewBox="0 0 120 120" className="h-full w-full animate-in zoom-in duration-300">
                  <circle cx="60" cy="60" r="50" fill="transparent" className="stroke-slate-100" strokeWidth="12" />
                  {doughnutSegments.map((segment, idx) => {
                    const isSelected = selectedProjectFilter === segment.id;
                    return (
                      <circle
                        key={idx}
                        cx="60"
                        cy="60"
                        r="50"
                        fill="transparent"
                        stroke={segment.color}
                        strokeWidth={isSelected ? 16 : 12}
                        strokeDasharray="314.159"
                        strokeDashoffset={segment.strokeOffset}
                        onClick={() => setSelectedProjectFilter(isSelected ? '' : segment.id)}
                        className="cursor-pointer transition-all hover:opacity-80"
                        style={{
                          transformOrigin: '60px 60px',
                          transform: `rotate(${segment.rotation - 90}deg)`
                        }}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Total</span>
                  <span className="text-base font-black text-slate-800">
                    {Math.round(projectAllocationData.totalMinutes / 60)}h
                  </span>
                </div>
              </div>

              <div className="space-y-2 max-w-[200px] w-full">
                {projectAllocationData.dataset.map((item, idx) => {
                  const isSelected = selectedProjectFilter === item.id;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedProjectFilter(isSelected ? '' : item.id)}
                      className={`flex items-center justify-between text-xs font-semibold w-full text-left p-1.5 rounded-xl transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-slate-100 ring-2 ring-sky-500/20 shadow-sm' 
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-slate-600 truncate">{item.name}</span>
                      </div>
                      <span className="text-slate-800 pl-2 font-bold shrink-0">{item.percentage}%</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Workforce Status Center */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Workforce Status Center</h3>
            <p className="text-xs text-slate-400 mt-0.5">Real-time mapping of attendance, shifts, and logged project details</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {selectedUserFilter && (
              <button
                onClick={() => setSelectedUserFilter('')}
                className="text-[9px] font-extrabold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider bg-indigo-50 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                Clear User Filter
              </button>
            )}
            
            {/* Search */}
            <input
              type="text"
              placeholder="Search member/PIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all w-full sm:w-48 shadow-sm"
            />
            {/* Designation Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-sky-500 focus:bg-white transition-all cursor-pointer shadow-sm w-full sm:w-auto"
            >
              <option value="">All Designations</option>
              <option value="software_engineer">Software Engineers</option>
              <option value="ba">Business Analysts</option>
              <option value="project_manager">Project Managers</option>
              <option value="designer">Designers</option>
              <option value="qa">QA Engineers</option>
              <option value="devops">DevOps Engineers</option>
              <option value="manager">Managers</option>
              <option value="employee">Regular Employees</option>
              <option value="admin">System Admins</option>
            </select>
            {/* Status Filter */}
            <div className="flex bg-slate-150 p-1 rounded-xl w-full sm:w-auto">
              {(['all', 'working', 'completed', 'offline'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-extrabold capitalize transition-all cursor-pointer ${
                    statusFilter === filter
                      ? "bg-white text-sky-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {filter === 'working' ? 'working now' : filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredWorkforce.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-center">
            <p className="text-xs font-bold text-slate-400">No workforce members found matching criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWorkforce.map((w) => {
              const progressPct = Math.min((w.minutesToday / 480) * 100, 100);
              const hrs = Math.floor(w.minutesToday / 60);
              const mins = Math.round(w.minutesToday % 60);
              const isSelected = selectedUserFilter === w.pin;

              return (
                <div 
                  key={w.id} 
                  onClick={() => setSelectedUserFilter(isSelected ? '' : w.pin)}
                  className={`rounded-2xl border p-5 hover:bg-white hover:shadow-md transition-all duration-300 flex flex-col justify-between gap-4 cursor-pointer ${
                    isSelected 
                      ? 'border-indigo-500 bg-white ring-2 ring-indigo-500/20 shadow-md scale-[1.01]' 
                      : 'border-slate-100 bg-slate-50/30'
                  }`}
                >
                  {/* Card Header: Profile Info & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-200/60 flex items-center justify-center font-black text-slate-700 text-xs shrink-0">
                        {w.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <h4 className="text-xs font-bold text-slate-800 truncate" title={w.name}>{w.name}</h4>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-bold text-slate-400">PIN: {w.pin}</span>
                          {(() => {
                            const badge = (r: string) => {
                              switch (r) {
                                case 'admin':
                                  return { label: 'Admin', style: 'bg-indigo-50 border-indigo-100 text-indigo-700' };
                                case 'software_engineer':
                                  return { label: 'Engineer', style: 'bg-sky-50 border-sky-100 text-sky-700' };
                                case 'ba':
                                  return { label: 'BA', style: 'bg-amber-50 border-amber-100 text-amber-700' };
                                case 'project_manager':
                                  return { label: 'PM', style: 'bg-rose-50 border-rose-100 text-rose-700' };
                                case 'designer':
                                  return { label: 'Designer', style: 'bg-purple-50 border-purple-100 text-purple-700' };
                                case 'qa':
                                  return { label: 'QA', style: 'bg-emerald-50 border-emerald-100 text-emerald-700' };
                                case 'devops':
                                  return { label: 'DevOps', style: 'bg-violet-50 border-violet-100 text-violet-700' };
                                case 'manager':
                                  return { label: 'Manager', style: 'bg-cyan-50 border-cyan-100 text-cyan-700' };
                                default:
                                  return { label: 'Employee', style: 'bg-slate-100 border-slate-200 text-slate-600' };
                              }
                            };
                            const b = badge(w.role || 'employee');
                            return (
                              <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[8px] font-extrabold border uppercase tracking-wider ${b.style}`}>
                                {b.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {w.status === 'working' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-extrabold text-sky-700 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-sky-500"></span>
                        Working Now
                      </span>
                    )}
                    {w.status === 'completed' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        Completed
                      </span>
                    )}
                    {w.status === 'offline' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                        Offline
                      </span>
                    )}
                  </div>

                  {/* Punch Schedule Indicator */}
                  <div className="grid grid-cols-2 gap-2 bg-white rounded-xl p-2.5 border border-slate-100 text-[10px] font-bold text-slate-500">
                    <div>
                      <span className="block text-[8px] font-semibold uppercase tracking-wider text-slate-400">PUNCH IN</span>
                      <span className="text-slate-700">{w.punchIn ? formatTime(w.punchIn) : '--:--'}</span>
                    </div>
                    <div>
                      <span className="block text-[8px] font-semibold uppercase tracking-wider text-slate-400">PUNCH OUT</span>
                      <span className="text-slate-700">{w.punchOut ? formatTime(w.punchOut) : '--:--'}</span>
                    </div>
                  </div>

                  {/* Hours Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-700">
                      <span>Logged Today</span>
                      <span className="font-mono text-emerald-600">{hrs}h {mins}m</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{ width: `${progressPct}%` }}
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>

                  {/* Last Active Task description */}
                  <div className="border-t border-slate-100 pt-3">
                    <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">LAST ACTIVE TASK</span>
                    {w.lastTaskDesc ? (
                      <p className="text-[10px] text-slate-600 font-semibold mt-0.5 line-clamp-1">
                        <span className="bg-sky-50 text-sky-700 px-1 py-0.2 rounded text-[8px] font-extrabold mr-1">
                          {w.lastTaskProject}
                        </span>
                        {w.lastTaskDesc}
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">No tasks logged today</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
