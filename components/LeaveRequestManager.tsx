"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export interface LeaveWfhRequest {
  id: string;
  user_id: string;
  request_type: 'leave' | 'wfh';
  leave_type?: 'casual' | 'sick' | 'annual' | 'general' | null;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  userName?: string;
  userPin?: string;
  userRole?: string;
}

interface Profile {
  id: string;
  name: string;
  pin: string;
  role?: string;
}

interface LeaveRequestManagerProps {
  isAdmin: boolean;
  currentUserId?: string;
  onRefresh?: () => void;
}

export default function LeaveRequestManager({ isAdmin, currentUserId, onRefresh }: LeaveRequestManagerProps) {
  const [requests, setRequests] = useState<LeaveWfhRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Missing table setup state
  const [isMissingTable, setIsMissingTable] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Application Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [requestType, setRequestType] = useState<'leave' | 'wfh'>('leave');
  const [leaveType, setLeaveType] = useState<'casual' | 'sick' | 'annual' | 'general'>('casual');
  const [startDate, setStartDate] = useState<string>(() => new Date().toLocaleDateString("en-CA"));
  const [endDate, setEndDate] = useState<string>(() => new Date().toLocaleDateString("en-CA"));
  const [reason, setReason] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Admin Review Modal State
  const [reviewingRequest, setReviewingRequest] = useState<LeaveWfhRequest | null>(null);
  const [adminNotesInput, setAdminNotesInput] = useState<string>('');
  const [reviewLoading, setReviewLoading] = useState<boolean>(false);

  const migrationSql = `-- Run this in your Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.leave_wfh_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('leave', 'wfh')),
  leave_type TEXT CHECK (leave_type IN ('casual', 'sick', 'annual', 'general')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leave_wfh_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own leave requests" ON public.leave_wfh_requests;
CREATE POLICY "Users can manage their own leave requests"
  ON public.leave_wfh_requests FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.check_is_admin())
  WITH CHECK (auth.uid() = user_id OR public.check_is_admin());`;

  // 1. Fetch Requests and Profiles
  const fetchRequestsData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch profiles mapping
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, pin, role');

      let profilesList = profilesData || [];
      if (!profilesData) {
        const { data: rpcProfiles } = await supabase.rpc('get_team_profiles');
        if (rpcProfiles) profilesList = rpcProfiles;
      }
      setProfiles(profilesList);
      const profilesMap = new Map(profilesList.map(p => [p.id, p]));

      // Fetch requests
      let query = supabase
        .from('leave_wfh_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isAdmin && currentUserId) {
        query = query.eq('user_id', currentUserId);
      }

      const { data: reqData, error: reqErr } = await query;

      if (reqErr) {
        const errCode = reqErr.code || '';
        const errMsg = reqErr.message || '';
        if (errCode === '42P01' || errCode === 'PGRST204' || errMsg.includes('leave_wfh_requests') || errMsg.includes('does not exist')) {
          setIsMissingTable(true);
          setError('Database table "leave_wfh_requests" is not initialized in Supabase yet.');
          setRequests([]);
          return;
        }
        throw reqErr;
      }

      setIsMissingTable(false);
      const joined: LeaveWfhRequest[] = (reqData || []).map(r => {
        const p = profilesMap.get(r.user_id);
        return {
          ...r,
          userName: p?.name || 'Unknown Employee',
          userPin: p?.pin || 'N/A',
          userRole: p?.role || 'employee'
        };
      });

      setRequests(joined);
    } catch (err: any) {
      const formattedErr = err?.message || err?.details || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error('Error fetching leave/wfh requests:', formattedErr);
      setError(err?.message || 'Failed to load leave and WFH applications.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequestsData();
  }, [isAdmin, currentUserId]);

  // Helper: Generate array of dates between start and end inclusive
  const getDateRangeArray = (startStr: string, endStr: string): string[] => {
    const dates: string[] = [];
    const curr = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');

    while (curr <= end) {
      dates.push(curr.toLocaleDateString("en-CA"));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  // Helper: Format Date Display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDayName = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString("en-US", { weekday: 'short' });
  };

  // Copy SQL Helper
  const handleCopySql = () => {
    navigator.clipboard.writeText(migrationSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // 2. Submit Application (Employee / Admin)
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (!startDate || !endDate) throw new Error('Start date and end date are required.');
      if (endDate < startDate) throw new Error('End date cannot be earlier than start date.');
      if (!reason.trim()) throw new Error('Please provide a reason for your application.');

      let applicantId = currentUserId;
      if (isAdmin && targetUserId) {
        applicantId = targetUserId;
      }

      if (!applicantId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User session not found.');
        applicantId = user.id;
      }

      const newRecord = {
        user_id: applicantId,
        request_type: requestType,
        leave_type: requestType === 'leave' ? leaveType : null,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
        status: 'Pending'
      };

      const { error: insertErr } = await supabase
        .from('leave_wfh_requests')
        .insert(newRecord);

      if (insertErr) throw insertErr;

      setSuccessMsg(`Application for ${requestType.toUpperCase()} submitted successfully!`);
      setIsModalOpen(false);
      setReason('');
      await fetchRequestsData();
    } catch (err: any) {
      console.error('Error submitting application:', err?.message || err);
      setError(err instanceof Error ? err.message : 'Failed to submit application. Make sure the leave_wfh_requests table is created.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Admin Approval Action (Approve & Auto-Sync Attendance)
  const handleApproveRequest = async (req: LeaveWfhRequest) => {
    setReviewLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Update request status to Approved
      const { error: updateErr } = await supabase
        .from('leave_wfh_requests')
        .update({
          status: 'Approved',
          admin_notes: adminNotesInput || 'Approved by Admin',
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', req.id);

      if (updateErr) throw updateErr;

      // 2. Auto-sync attendance records for every date in range
      const datesInRange = getDateRangeArray(req.start_date, req.end_date);
      const targetStatus = req.request_type === 'wfh' ? 'WFH' : 'Leave';
      const targetNotes = `${req.request_type.toUpperCase()} Approved: ${req.reason}`;

      for (const dStr of datesInRange) {
        const { data: existing } = await supabase
          .from('attendance')
          .select('id')
          .eq('user_id', req.user_id)
          .eq('date', dStr)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('attendance')
            .update({
              status: targetStatus,
              notes: targetNotes
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('attendance')
            .insert({
              user_id: req.user_id,
              date: dStr,
              punch_in: null,
              punch_out: null,
              status: targetStatus,
              notes: targetNotes
            });
        }
      }

      setSuccessMsg(`Approved ${req.userName}'s ${req.request_type.toUpperCase()} request for ${datesInRange.length} day(s). Attendance sheet updated.`);
      setReviewingRequest(null);
      setAdminNotesInput('');
      onRefresh?.();
      await fetchRequestsData();
    } catch (err: any) {
      console.error('Error approving request:', err?.message || err);
      setError(err instanceof Error ? err.message : 'Failed to approve application.');
    } finally {
      setReviewLoading(false);
    }
  };

  // 4. Admin Rejection Action
  const handleRejectRequest = async (req: LeaveWfhRequest) => {
    setReviewLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateErr } = await supabase
        .from('leave_wfh_requests')
        .update({
          status: 'Rejected',
          admin_notes: adminNotesInput || 'Rejected by Admin',
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', req.id);

      if (updateErr) throw updateErr;

      setSuccessMsg(`Rejected ${req.userName}'s ${req.request_type.toUpperCase()} request.`);
      setReviewingRequest(null);
      setAdminNotesInput('');
      await fetchRequestsData();
    } catch (err: any) {
      console.error('Error rejecting request:', err?.message || err);
      setError(err instanceof Error ? err.message : 'Failed to reject application.');
    } finally {
      setReviewLoading(false);
    }
  };

  // Filtered Requests List
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.request_type !== typeFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = (r.userName || '').toLowerCase().includes(term);
        const matchesPin = (r.userPin || '').toLowerCase().includes(term);
        const matchesReason = r.reason.toLowerCase().includes(term);
        if (!matchesName && !matchesPin && !matchesReason) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, searchTerm]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter(r => r.status === 'Pending').length;
    const approved = requests.filter(r => r.status === 'Approved').length;
    const rejected = requests.filter(r => r.status === 'Rejected').length;
    return { total, pending, approved, rejected };
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>✈️</span> {isAdmin ? 'Leave & WFH Applications Console' : 'My Leave & WFH Portal'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin
              ? 'Review pending applications, approve/reject requests, and auto-sync attendance rosters'
              : 'Apply for Leave or Work From Home (WFH) and track your approval status in real-time'}
          </p>
        </div>

        <button
          onClick={() => {
            setError(null);
            setSuccessMsg(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold text-xs px-5 py-3 shadow-md shadow-sky-100 cursor-pointer active:scale-95 transition-all shrink-0"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Apply for Leave / WFH
        </button>
      </div>

      {/* Database Setup Required Banner */}
      {isMissingTable && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-6 space-y-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg shrink-0">
              ⚡
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Database Table Initialization Required</h3>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                The <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">public.leave_wfh_requests</code> table has not been created in your Supabase database yet. Run the SQL script below in your <strong>Supabase SQL Editor</strong> to enable Leave & WFH applications.
              </p>
            </div>
          </div>

          <div className="relative rounded-2xl bg-slate-900 text-slate-100 p-4 font-mono text-[11px] overflow-x-auto shadow-inner">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">SQL DDL Setup Script</span>
              <button
                onClick={handleCopySql}
                className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                {copiedSql ? '✓ Copied to Clipboard!' : 'Copy SQL Script'}
              </button>
            </div>
            <pre className="text-slate-300 leading-relaxed whitespace-pre-wrap">{migrationSql}</pre>
          </div>

          <div className="flex justify-end">
            <button
              onClick={fetchRequestsData}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-100 cursor-pointer active:scale-95 transition-all"
            >
              🔄 Refresh & Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Standard Error Notification */}
      {error && !isMissingTable && (
        <div className="rounded-2xl bg-rose-50 border-l-4 border-rose-500 p-4 text-xs text-rose-700 font-bold flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800 font-black">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="rounded-2xl bg-emerald-50 border-l-4 border-emerald-500 p-4 text-xs text-emerald-800 font-bold flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 font-black">✕</button>
        </div>
      )}

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Total Applications</span>
          <span className="mt-1 block text-2xl font-black text-slate-800">{metrics.total}</span>
          <span className="text-[9px] font-semibold text-slate-400">Submitted requests</span>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5 shadow-sm">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-amber-700">Pending Review</span>
          <span className="mt-1 block text-2xl font-black text-amber-700">{metrics.pending}</span>
          <span className="text-[9px] font-semibold text-amber-600">Awaiting Admin action</span>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-sm">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-emerald-700">Approved</span>
          <span className="mt-1 block text-2xl font-black text-emerald-700">{metrics.approved}</span>
          <span className="text-[9px] font-semibold text-emerald-600">Synced to Attendance</span>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5 shadow-sm">
          <span className="block text-[9px] font-extrabold uppercase tracking-wider text-rose-700">Rejected</span>
          <span className="mt-1 block text-2xl font-black text-rose-700">{metrics.rejected}</span>
          <span className="text-[9px] font-semibold text-rose-600">Declined requests</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-50 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isAdmin ? 'Team Application Roster' : 'My Application History'} ({filteredRequests.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Filter by application status, request type, or employee search</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <input
                type="text"
                placeholder="Search name/PIN/reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all shadow-sm w-44"
              />
            )}

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 outline-none focus:border-sky-500 focus:bg-white transition-all cursor-pointer shadow-sm"
            >
              <option value="all">All Types</option>
              <option value="leave">Leave Only</option>
              <option value="wfh">WFH Only</option>
            </select>

            {/* Status Filter */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {(['all', 'Pending', 'Approved', 'Rejected'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-[9px] font-extrabold capitalize transition-all cursor-pointer ${
                    statusFilter === st
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Requests Table */}
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
            <p className="text-xs font-semibold text-slate-400">Loading applications...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <p className="text-sm font-bold text-slate-500">No applications found</p>
            <p className="text-xs text-slate-400 mt-1">
              {isMissingTable ? 'Create the table in Supabase to start submitting applications.' : 'There are no leave or WFH requests matching your criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  {isAdmin && <th className="pb-3 font-semibold">Applicant</th>}
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Dates & Days</th>
                  <th className="pb-3 font-semibold">Reason</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRequests.map((req) => {
                  const dateArray = getDateRangeArray(req.start_date, req.end_date);
                  const daysCount = dateArray.length;

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-all">
                      {isAdmin && (
                        <td className="py-4 pr-2">
                          <div className="font-bold text-slate-800 truncate max-w-[140px]">{req.userName}</div>
                          <div className="text-[10px] font-semibold text-slate-400">PIN: {req.userPin}</div>
                        </td>
                      )}
                      <td className="py-4 pr-2">
                        {req.request_type === 'wfh' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-extrabold text-amber-700 border border-amber-100">
                            🏠 WFH
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-xs font-extrabold text-violet-700 border border-violet-100 capitalize">
                            🌴 Leave ({req.leave_type || 'General'})
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-2">
                        <div className="font-bold text-slate-800">
                          {formatDate(req.start_date)}
                          {req.start_date !== req.end_date && ` - ${formatDate(req.end_date)}`}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                          {daysCount} day{daysCount > 1 ? 's' : ''} ({getDayName(req.start_date)} - {getDayName(req.end_date)})
                        </div>
                      </td>
                      <td className="py-4 pr-2 max-w-[220px]">
                        <p className="text-xs text-slate-700 font-medium line-clamp-2" title={req.reason}>
                          {req.reason}
                        </p>
                        {req.admin_notes && (
                          <span className="block text-[10px] text-slate-400 italic mt-0.5">
                            Admin Note: {req.admin_notes}
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-2">
                        {req.status === 'Approved' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">
                            ✓ Approved
                          </span>
                        )}
                        {req.status === 'Rejected' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-extrabold text-rose-700">
                            ✕ Rejected
                          </span>
                        )}
                        {req.status === 'Pending' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-700 animate-pulse">
                            ⏳ Pending
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-right">
                        {isAdmin && req.status === 'Pending' ? (
                          <button
                            onClick={() => {
                              setReviewingRequest(req);
                              setAdminNotesInput('');
                            }}
                            className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                          >
                            Review & Decide
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">
                            {req.reviewed_at ? `Reviewed ${formatDate(req.reviewed_at.split('T')[0])}` : 'Submitted'}
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

      {/* --- MODAL 1: APPLY FOR LEAVE / WFH --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Apply for Leave or WFH</h3>
                <p className="text-xs text-slate-400 mt-0.5">Fill in request details to submit for Admin review</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-black text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitApplication} className="space-y-4">
              {isAdmin && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Apply On Behalf Of Employee</label>
                  <select
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  >
                    <option value="">Myself ({currentUserId ? 'Current User' : 'Admin'})</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (PIN: {p.pin})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Request Type Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Request Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRequestType('leave')}
                    className={`py-3 rounded-2xl text-xs font-extrabold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      requestType === 'leave'
                        ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    🌴 Leave Application
                  </button>

                  <button
                    type="button"
                    onClick={() => setRequestType('wfh')}
                    className={`py-3 rounded-2xl text-xs font-extrabold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      requestType === 'wfh'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    🏠 Work From Home (WFH)
                  </button>
                </div>
              </div>

              {/* Leave Category (if Leave) */}
              {requestType === 'leave' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Leave Category</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  >
                    <option value="casual">Casual Leave</option>
                    <option value="sick">Sick Leave</option>
                    <option value="annual">Annual Vacation</option>
                    <option value="general">General Leave</option>
                  </select>
                </div>
              )}

              {/* Date Pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">End Date</label>
                  <input
                    type="date"
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Reason / Details</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe your reason for Leave or WFH..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold transition-all shadow-md shadow-sky-100 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ADMIN REVIEW MODAL --- */}
      {reviewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Review Application</h3>
                <p className="text-xs text-slate-400 mt-0.5">Approve to sync to attendance roster or reject</p>
              </div>
              <button
                onClick={() => setReviewingRequest(null)}
                className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-black text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Applicant</span>
                <span className="text-slate-800 font-bold">{reviewingRequest.userName} (PIN: {reviewingRequest.userPin})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Request Type</span>
                <span className="text-slate-800 font-bold capitalize">{reviewingRequest.request_type} ({reviewingRequest.leave_type || 'Standard'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Date Range</span>
                <span className="text-slate-800 font-bold">{formatDate(reviewingRequest.start_date)} - {formatDate(reviewingRequest.end_date)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200/60">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Reason</span>
                <p className="mt-1 text-slate-700 font-semibold leading-relaxed">{reviewingRequest.reason}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Admin Remarks / Notes</label>
              <input
                type="text"
                placeholder="Optional decision remarks..."
                value={adminNotesInput}
                onChange={(e) => setAdminNotesInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
              />
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                disabled={reviewLoading}
                onClick={() => handleRejectRequest(reviewingRequest)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md shadow-rose-100 cursor-pointer disabled:opacity-50"
              >
                {reviewLoading ? 'Processing...' : '✕ Reject Application'}
              </button>

              <button
                type="button"
                disabled={reviewLoading}
                onClick={() => handleApproveRequest(reviewingRequest)}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-md shadow-emerald-100 cursor-pointer disabled:opacity-50"
              >
                {reviewLoading ? 'Processing...' : '✓ Approve & Sync'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
