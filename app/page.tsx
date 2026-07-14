"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import TimeLogForm from "@/components/TimeLogForm";
import TimeLogList from "@/components/TimeLogList";
import ProjectManager from "@/components/ProjectManager";
import AuthScreen from "@/components/AuthScreen";
import PunchCard from "@/components/PunchCard";
import AttendanceExplorer from "@/components/AttendanceExplorer";
import AdminDashboard from "@/components/AdminDashboard";
import AdminConsole from "@/components/AdminConsole";
import SprintTracker from "@/components/SprintTracker";
import TeamManager from "@/components/TeamManager";

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
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<"tracker" | "explorer" | "projects" | "attendance" | "admin_dashboard" | "sprints" | "team">("tracker");
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [userName, setUserName] = useState<string>("");
  const [userPin, setUserPin] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("employee");
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<any[]>([]);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  // Fetch user profile name and role when session changes
  useEffect(() => {
    if (!session) {
      setUserName("");
      setUserPin("");
      setUserRole("employee");
      return;
    }

    async function fetchProfile() {
      if (!session?.user?.id) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("name, pin, role")
          .eq("id", session.user.id)
          .single();

        if (error) {
          console.warn("Could not fetch profile, using user metadata:", error);
          // Fallback to metadata or email prefix
          const metaName = session?.user?.user_metadata?.name;
          const metaPin = session?.user?.user_metadata?.pin || session?.user?.email?.split("@")[0] || "";
          const emailPrefix = session?.user?.email?.split("@")[0] || "User";
          const metaRole = session?.user?.user_metadata?.role || "employee";
          setUserName(metaName || emailPrefix);
          setUserPin(metaPin);
          setUserRole(metaRole);
          if (metaRole === "admin") {
            setActiveTab("admin_dashboard");
          } else {
            setActiveTab("tracker");
          }
        } else if (data) {
          setUserName(data.name);
          setUserPin(data.pin);
          setUserRole(data.role);
          if (data.role === "admin") {
            setActiveTab("admin_dashboard");
          } else {
            setActiveTab("tracker");
          }
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      }
    }

    fetchProfile();
  }, [session]);

  // 1. Subscribe to User Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Centralized data fetching (Only runs when session exists)
  useEffect(() => {
    if (!session) {
      Promise.resolve().then(() => {
        setLogs([]);
        setProjects([]);
        setIsLoading(false);
      });
      return;
    }

    async function fetchData() {
      setIsLoading(true);
      try {
        const todayStr = new Date().toLocaleDateString("en-CA");
        const [logsRes, projectsRes, profilesRes, attendanceRes] = await Promise.all([
          supabase.from("time_logs").select("*, projects(id, name)").order("date", { ascending: false }),
          supabase.from("projects").select("id, name").order("name", { ascending: true }),
          supabase.rpc("get_team_profiles"),
          supabase.from("attendance").select("*").eq("date", todayStr)
        ]);

        const profilesMap = new Map((profilesRes.data as any[])?.map((p: any) => [p.id, p]) || []);

        const joinedLogs = (logsRes.data || []).map(log => ({
          ...log,
          userName: profilesMap.get(log.user_id)?.name || 'Unknown User',
          userPin: profilesMap.get(log.user_id)?.pin || 'N/A'
        }));

        setLogs(joinedLogs);
        if (projectsRes.data) setProjects(projectsRes.data);
        if (profilesRes.data) setTeamUsers(profilesRes.data);
        if (attendanceRes.data) setTodayAttendance(attendanceRes.data);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [refreshTrigger, session]);

  // helper function to parse duration from a log entry into total minutes
  const parseLogMinutes = (log: TimeLog): number => {
    if (log.direct_duration) {
      const hoursMatch = log.direct_duration.match(/(\d+)\s*hours?/);
      const minsMatch = log.direct_duration.match(/(\d+)\s*mins?/);
      let mins = 0;
      if (hoursMatch) mins += parseInt(hoursMatch[1]) * 60;
      if (minsMatch) mins += parseInt(minsMatch[1]);
      return mins;
    } else if (log.start_time && log.end_time) {
      const start = new Date(`1970-01-01T${log.start_time}`);
      const end = new Date(`1970-01-01T${log.end_time}`);
      return (end.getTime() - start.getTime()) / 60000;
    }
    return 0;
  };

  // Helper to determine if a date falls in the current week (Monday to Sunday)
  const isWithinCurrentWeek = (dateStr: string): boolean => {
    const logDate = new Date(dateStr);
    const now = new Date();
    logDate.setHours(0, 0, 0, 0);

    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;

    const monday = new Date(now);
    monday.setDate(now.getDate() + distanceToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return logDate >= monday && logDate <= sunday;
  };

  // Stats Calculations
  const stats = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    let todayMins = 0;
    let weekMins = 0;
    const activeProjectsSet = new Set<string>();

    logs.forEach((log) => {
      const mins = parseLogMinutes(log);
      if (log.date === todayStr) {
        todayMins += mins;
      }
      if (isWithinCurrentWeek(log.date)) {
        weekMins += mins;
      }
      activeProjectsSet.add(log.project_id);
    });

    const formatMins = (totalMins: number) => {
      const hrs = Math.floor(totalMins / 60);
      const mins = Math.round(totalMins % 60);
      return `${hrs}h ${mins}m`;
    };

    return {
      today: formatMins(todayMins),
      week: formatMins(weekMins),
      totalTasks: logs.length,
      activeProjects: activeProjectsSet.size
    };
  }, [logs]);

  // Project breakdown memoized calculation to follow rules of hooks
  const projectBreakdown = useMemo(() => {
    const projectMinutes: Record<string, { name: string; minutes: number }> = {};
    projects.forEach((p) => {
      projectMinutes[p.id] = { name: p.name, minutes: 0 };
    });

    let grandTotalMins = 0;
    logs.forEach((log) => {
      const mins = parseLogMinutes(log);
      grandTotalMins += mins;
      if (projectMinutes[log.project_id]) {
        projectMinutes[log.project_id].minutes += mins;
      } else {
        projectMinutes[log.project_id] = { name: log.projects?.name || "Deleted Project", minutes: mins };
      }
    });

    return Object.values(projectMinutes)
      .filter((p) => p.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .map((item) => {
        const pct = grandTotalMins > 0 ? (item.minutes / grandTotalMins) * 100 : 0;
        const hrs = Math.floor(item.minutes / 60);
        const mins = Math.round(item.minutes % 60);
        return {
          name: item.name,
          timeStr: `${hrs}h ${mins}m`,
          pct,
          percentageStr: `${pct.toFixed(0)}%`
        };
      });
  }, [logs, projects]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // 3. Render Authentication Loading State
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
          <p className="text-sm font-semibold text-slate-500">Checking credentials...</p>
        </div>
      </div>
    );
  }

  // 4. Render Authentication Screen if Session is Null
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50/50">
        <AuthScreen />
      </div>
    );
  }

  const getFriendlyRoleName = (r: string) => {
    switch (r) {
      case 'admin': return 'System Admin';
      case 'software_engineer': return 'Software Engineer';
      case 'ba': return 'Business Analyst';
      case 'project_manager': return 'Project Manager';
      case 'designer': return 'UI/UX Designer';
      case 'qa': return 'QA Engineer';
      case 'devops': return 'DevOps';
      case 'manager': return 'Manager';
      default: return 'Regular Employee';
    }
  };

  if (userRole === "admin") {
    return (
      <AdminConsole
        userName={userName}
        userPin={userPin}
        session={session}
        handleSignOut={handleSignOut}
        logs={logs}
        teamUsers={teamUsers}
        todayAttendance={todayAttendance}
        projects={projects}
        triggerRefresh={triggerRefresh}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 antialiased">
      {/* Top Banner Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                BRAC Time Tracker
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">
                Employee Portal
              </p>
            </div>
          </div>

          {/* Navigation Tabs & Profile Actions */}
          <div className="flex items-center gap-4">
            <nav className="flex space-x-1 rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setActiveTab("tracker")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "tracker"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Time Tracker
              </button>
              <button
                onClick={() => setActiveTab("explorer")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "explorer"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                My Work Logs
              </button>
              <button
                onClick={() => setActiveTab("attendance")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "attendance"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                My Attendance
              </button>
              <button
                onClick={() => setActiveTab("sprints")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "sprints"
                    ? "bg-white text-sky-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Sprint Tracker
              </button>
              {userRole === "ba" && (
                <button
                  onClick={() => setActiveTab("team")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === "team"
                      ? "bg-white text-sky-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                  }`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Team Manager
                </button>
              )}
            </nav>

            {/* Profile Dropdown / Sign Out */}
            <div className="flex items-center gap-3 border-l border-slate-100 pl-4">
              <div className="hidden md:block text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.2 text-[8px] font-extrabold text-slate-500 border border-slate-200 uppercase tracking-wider">
                    {getFriendlyRoleName(userRole)}
                  </span>
                  <span className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Logged In</span>
                </div>
                <span className="block text-xs font-bold text-slate-700 max-w-[150px] truncate mt-0.5" title={userName || session.user.email || ""}>
                  {userName || session.user.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-500 hover:bg-rose-50 hover:border-rose-100 hover:text-rose-600 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Sign Out"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Stats Summary Section */}
      <section className="bg-slate-900 py-8 text-white shadow-inner">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {/* Stat Card 1 */}
            <div className="relative overflow-hidden rounded-2xl bg-white/5 p-5 backdrop-blur-sm border border-white/10 transition-all hover:bg-white/10">
              <p className="text-xs font-semibold text-slate-400">Logged Today</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{stats.today}</h3>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Direct hours tracked</p>
              <div className="absolute right-3 bottom-3 text-white/5">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* Stat Card 2 */}
            <div className="relative overflow-hidden rounded-2xl bg-white/5 p-5 backdrop-blur-sm border border-white/10 transition-all hover:bg-white/10">
              <p className="text-xs font-semibold text-slate-400">Logged This Week</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-sky-400">{stats.week}</h3>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Current work week total</p>
              <div className="absolute right-3 bottom-3 text-white/5">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            {/* Stat Card 3 */}
            <div className="relative overflow-hidden rounded-2xl bg-white/5 p-5 backdrop-blur-sm border border-white/10 transition-all hover:bg-white/10">
              <p className="text-xs font-semibold text-slate-400">Total Logs</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-emerald-400">{stats.totalTasks} logs</h3>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Logs saved for tasks</p>
              <div className="absolute right-3 bottom-3 text-white/5">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>

            {/* Stat Card 4 */}
            <div className="relative overflow-hidden rounded-2xl bg-white/5 p-5 backdrop-blur-sm border border-white/10 transition-all hover:bg-white/10">
              <p className="text-xs font-semibold text-slate-400">Active Projects</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-amber-400">{stats.activeProjects} projects</h3>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Active project classifications</p>
              <div className="absolute right-3 bottom-3 text-white/5">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
              <p className="text-sm font-semibold text-slate-500">Syncing with Supabase...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Tab 1: Tracker */}
            {activeTab === "tracker" && (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <TimeLogForm
                    key={editingLog?.id || "new"}
                    editingLog={editingLog}
                    projectsList={projects}
                    existingLogs={logs}
                    onSuccess={() => {
                      setEditingLog(null);
                      triggerRefresh();
                    }}
                    onCancel={() => setEditingLog(null)}
                  />
                </div>
                <div className="space-y-6">
                  {/* Attendance Punch Card */}
                  <PunchCard userName={userName} pin={userPin} />

                  {/* Visual Project Breakdown Card */}
                  <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900">Project Breakdown</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Time distribution per active project</p>
                    
                    <div className="mt-6 space-y-4">
                      {projectBreakdown.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6">No hours logged yet</p>
                      ) : (
                        projectBreakdown.map((item, idx) => {
                          const colors = ["bg-sky-500", "bg-indigo-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
                          const barColor = colors[idx % colors.length];

                          return (
                            <div key={idx} className="space-y-1.5">
                              <div className="flex justify-between text-xs font-semibold text-slate-700">
                                <span className="truncate max-w-[150px]">{item.name}</span>
                                <span>{item.timeStr} ({item.percentageStr})</span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${item.pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Help Info Card */}
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-6">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-800">Pro-Tip</h4>
                    <p className="mt-2 text-xs text-sky-700 leading-relaxed">
                      Use the **quick presets** (e.g. 30m, 1h) or **increment buttons** (+15m, +30m) to quickly log or adjust your duration in minutes with a single click!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Explorer */}
            {activeTab === "explorer" && (
              <TimeLogList
                logsList={logs}
                projectsList={projects}
                onEdit={(log) => {
                  setEditingLog(log);
                  setActiveTab("tracker");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onLogsChange={triggerRefresh}
                isAdmin={false}
              />
            )}

            {/* Tab 4: Attendance Explorer */}
            {activeTab === "attendance" && (
              <AttendanceExplorer isAdmin={false} />
            )}

            {/* Tab 5: Sprint Tracker */}
            {activeTab === "sprints" && (
              <SprintTracker
                role={userRole}
                projects={projects}
                teamUsers={teamUsers}
                currentUserId={session.user.id}
                onRefresh={triggerRefresh}
              />
            )}

            {/* Tab 6: Team Manager (For BAs) */}
            {activeTab === "team" && userRole === "ba" && (
              <TeamManager
                teamUsers={teamUsers}
                onProfilesChange={triggerRefresh}
                role={userRole}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
