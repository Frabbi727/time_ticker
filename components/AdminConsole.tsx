"use client";

import React, { useState } from 'react';
import AdminDashboard from './AdminDashboard';
import AttendanceExplorer from './AttendanceExplorer';
import TimeLogList from './TimeLogList';
import ProjectManager from './ProjectManager';
import TeamManager from './TeamManager';
import SprintTracker from './SprintTracker';

interface AdminConsoleProps {
  userName: string;
  userPin: string;
  session: any;
  handleSignOut: () => void;
  logs: any[];
  teamUsers: any[];
  todayAttendance: any[];
  projects: any[];
  triggerRefresh: () => void;
}

type AdminTab = "dashboard" | "attendance" | "explorer" | "projects" | "team" | "sprints";

export default function AdminConsole({
  userName,
  userPin,
  session,
  handleSignOut,
  logs,
  teamUsers,
  todayAttendance,
  projects,
  triggerRefresh
}: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const activeStaff = todayAttendance.filter(a => !a.punch_out).length;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50/50 text-slate-800 antialiased">
      {/* 1. Sleek Vertical Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col h-full shrink-0 border-r border-slate-800">
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800 bg-slate-950/20">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow shadow-sky-500/20">
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight text-white uppercase">BRAC Tracker</h2>
            <span className="text-[10px] font-bold text-sky-500 tracking-wider">ADMIN CONTROL</span>
          </div>
        </div>

        {/* Profile Card Section */}
        <div className="p-4 mx-4 my-6 rounded-2xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center font-black text-white text-sm">
              {userName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white truncate" title={userName}>{userName}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">PIN: {userPin}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Sidebar Tabs */}
        <nav className="flex-1 px-4 space-y-1.5">
          {/* Tab 1: Dashboard Overview */}
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-sky-600 text-white shadow-sm shadow-sky-600/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Overview Dashboard
          </button>

          {/* Tab 2: Attendance Tracker */}
          <button
            onClick={() => setActiveTab("attendance")}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "attendance"
                ? "bg-sky-600 text-white shadow-sm shadow-sky-600/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Attendance Explorer
          </button>

          {/* Tab 3: Work Logs Explorer */}
          <button
            onClick={() => setActiveTab("explorer")}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "explorer"
                ? "bg-sky-600 text-white shadow-sm shadow-sky-600/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Work Logs Explorer
          </button>

          {/* Tab 4: Project Settings */}
          <button
            onClick={() => setActiveTab("projects")}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "projects"
                ? "bg-sky-600 text-white shadow-sm shadow-sky-600/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Project Manager
          </button>

          {/* Tab 5: Team Management */}
          <button
            onClick={() => setActiveTab("team")}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "team"
                ? "bg-sky-600 text-white shadow-sm shadow-sky-600/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Team Manager
          </button>

          {/* Tab 6: Sprint Tracker */}
          <button
            onClick={() => setActiveTab("sprints")}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "sprints"
                ? "bg-sky-600 text-white shadow-sm shadow-sky-600/10"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Sprint Tracker
          </button>
        </nav>

        {/* Sidebar Footer - Sign Out */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-rose-950/40 hover:text-rose-400 py-3 text-xs font-bold border border-slate-700/50 hover:border-rose-900/30 transition-all cursor-pointer shadow-inner active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out Suite
          </button>
        </div>
      </aside>

      {/* 2. Main Page Container */}
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-slate-100 shrink-0 flex items-center justify-between px-8 shadow-sm z-10">
          <div className="space-y-0.5">
            <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">{todayStr}</span>
            <h1 className="text-sm font-bold text-slate-800">
              {activeTab === "dashboard" && "Overview Dashboard"}
              {activeTab === "attendance" && "Attendance Logs"}
              {activeTab === "explorer" && "Work Logs"}
              {activeTab === "projects" && "Project Settings"}
              {activeTab === "team" && "Team Management"}
              {activeTab === "sprints" && "Sprint Tracker"}
            </h1>
          </div>

          {/* Quick Stats Header Summary */}
          <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-150 rounded-xl px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{activeStaff} staff online today</span>
            </div>
            <div className="flex items-center gap-2 border-l border-slate-100 pl-4 h-8">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.2 text-[8px] font-extrabold text-indigo-700 border border-indigo-100 uppercase tracking-wider">
                System Admin
              </span>
              <span className="text-xs text-slate-700 max-w-[120px] truncate" title={userName || ""}>
                {userName || "Admin"}
              </span>
            </div>
          </div>
        </header>

        {/* 3. Primary Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          <div className="mx-auto max-w-7xl">
            {activeTab === "dashboard" && (
              <AdminDashboard
                logs={logs}
                teamUsers={teamUsers}
                todayAttendance={todayAttendance}
                projects={projects}
              />
            )}

            {activeTab === "attendance" && (
              <AttendanceExplorer isAdmin={true} />
            )}

            {activeTab === "explorer" && (
              <TimeLogList
                logsList={logs}
                projectsList={projects}
                onEdit={() => {}}
                onLogsChange={triggerRefresh}
                isAdmin={true}
              />
            )}

            {activeTab === "projects" && (
              <ProjectManager
                projectsList={projects}
                onProjectsChange={triggerRefresh}
              />
            )}

            {activeTab === "team" && (
              <TeamManager
                teamUsers={teamUsers}
                onProfilesChange={triggerRefresh}
              />
            )}

            {activeTab === "sprints" && (
              <SprintTracker
                role="admin"
                projects={projects}
                teamUsers={teamUsers}
                currentUserId={session?.user?.id}
                onRefresh={triggerRefresh}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
