"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export interface Project {
  id: string;
  name: string;
}

export interface BillingRecord {
  id: string;
  jira_ticket: string; // Stored as comma-separated or single string e.g. "BRAC-101, BRAC-102"
  unique_billing_code: string;
  project_id: string | null;
  start_date: string;
  end_date: string;
  man_days: number;
  rate_per_man_day: number;
  total_amount: number;
  status: 'Pending' | 'Billed' | 'Paid' | 'Cancelled';
  notes: string | null;
  created_at?: string;
  projects?: Project;
}

interface BillingManagerProps {
  projectsList?: Project[];
}

export default function BillingManager({ projectsList }: BillingManagerProps) {
  // --- States ---
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [projects, setProjects] = useState<Project[]>(projectsList || []);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMissingTable, setIsMissingTable] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Form Modal States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<BillingRecord | null>(null);

  // Form Fields
  const [jiraTicket, setJiraTicket] = useState<string>(''); // Can contain multiple e.g. "BRAC-101, BRAC-102"
  const [projectId, setProjectId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [manDays, setManDays] = useState<string>('');
  const [ratePerManDay, setRatePerManDay] = useState<string>('');
  const [status, setStatus] = useState<'Pending' | 'Billed' | 'Paid' | 'Cancelled'>('Pending');
  const [notes, setNotes] = useState<string>('');

  // Duplicate Warning State
  const [duplicateMatches, setDuplicateMatches] = useState<{ ticket: string; record: BillingRecord }[]>([]);
  const [forceUniqueCode, setForceUniqueCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const migrationSql = `-- Run this in your Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.billing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jira_ticket TEXT NOT NULL,
  unique_billing_code TEXT UNIQUE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  man_days NUMERIC(10,2) NOT NULL DEFAULT 0,
  rate_per_man_day NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated access on billing_records"
  ON public.billing_records FOR ALL TO authenticated USING (true) WITH CHECK (true);`;

  // --- Helper: Parse Multiple Tickets ---
  const parseTickets = (input: string): string[] => {
    if (!input) return [];
    return input
      .split(/[,;\s]+/)
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
  };

  // --- Fetch Data ---
  useEffect(() => {
    fetchBillingRecords();
    if (!projectsList || projectsList.length === 0) {
      fetchProjects();
    }
  }, [projectsList]);

  async function fetchProjects() {
    try {
      const { data, error: err } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });
      if (!err && data) {
        setProjects(data);
      }
    } catch (e) {
      console.error("Error fetching projects:", e);
    }
  }

  async function fetchBillingRecords() {
    setIsLoading(true);
    setError(null);
    setIsMissingTable(false);
    try {
      const { data, error: err } = await supabase
        .from('billing_records')
        .select('*, projects(id, name)')
        .order('created_at', { ascending: false });

      if (err) {
        console.warn("Supabase table issue:", err.message);
        if (err.message.includes('schema cache') || err.message.includes('billing_records')) {
          setIsMissingTable(true);
          setError("Table 'public.billing_records' does not exist in Supabase database yet.");
          // Load fallback local storage records if available
          const localSaved = localStorage.getItem('local_billing_records');
          if (localSaved) {
            try {
              setBillingRecords(JSON.parse(localSaved));
            } catch (e) {}
          }
        } else {
          setError(err.message);
        }
      } else {
        setBillingRecords(data || []);
      }
    } catch (e: any) {
      console.error("Error loading billing records:", e);
      setError("Failed to load billing records.");
    } finally {
      setIsLoading(false);
    }
  }

  // --- Working Days Auto-Calculator ---
  const calculateWorkingDays = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) { // Exclude Sunday (0) and Saturday (6)
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count > 0 ? count : 1;
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setDuplicateMatches([]);
    setForceUniqueCode(null);
    if (val && endDate) {
      const days = calculateWorkingDays(val, endDate);
      if (days > 0) setManDays(days.toString());
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setDuplicateMatches([]);
    setForceUniqueCode(null);
    if (startDate && val) {
      const days = calculateWorkingDays(startDate, val);
      if (days > 0) setManDays(days.toString());
    }
  };

  // Calculate live total amount
  const liveTotalAmount = useMemo(() => {
    const md = parseFloat(manDays) || 0;
    const rate = parseFloat(ratePerManDay) || 0;
    return md * rate;
  }, [manDays, ratePerManDay]);

  // Unique Code Generator Helper
  const generateUniqueCode = (ticketInput: string): string => {
    const tickets = parseTickets(ticketInput);
    const primaryTicket = tickets[0] || 'BILLING';
    const existing = new Set(billingRecords.map(r => r.unique_billing_code.toUpperCase()));
    if (!existing.has(primaryTicket)) return primaryTicket;

    let count = 1;
    while (existing.has(`${primaryTicket}-DUP${count}`)) {
      count++;
    }
    return `${primaryTicket}-DUP${count}`;
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setJiraTicket('');
    setProjectId(projects.length > 0 ? projects[0].id : '');
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    setManDays('1');
    setRatePerManDay('');
    setStatus('Pending');
    setNotes('');
    setDuplicateMatches([]);
    setForceUniqueCode(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (rec: BillingRecord) => {
    setEditingRecord(rec);
    setJiraTicket(rec.jira_ticket);
    setProjectId(rec.project_id || '');
    setStartDate(rec.start_date);
    setEndDate(rec.end_date);
    setManDays(rec.man_days.toString());
    setRatePerManDay(rec.rate_per_man_day.toString());
    setStatus(rec.status);
    setNotes(rec.notes || '');
    setDuplicateMatches([]);
    setForceUniqueCode(null);
    setIsModalOpen(true);
  };

  // Check Multiple Tickets for Duplicates
  const checkDuplicatesForMultiple = (): { ticket: string; record: BillingRecord }[] => {
    const inputTickets = parseTickets(jiraTicket);
    if (inputTickets.length === 0) return [];

    const matches: { ticket: string; record: BillingRecord }[] = [];

    billingRecords.forEach(record => {
      if (record.id === editingRecord?.id) return;
      const existingTickets = parseTickets(record.jira_ticket);
      
      inputTickets.forEach(inputT => {
        if (existingTickets.includes(inputT) || record.jira_ticket.toUpperCase().includes(inputT)) {
          matches.push({ ticket: inputT, record });
        }
      });
    });

    return matches;
  };

  // Save Record
  const handleSaveBilling = async (byPassDuplicate = false) => {
    const tickets = parseTickets(jiraTicket);
    if (tickets.length === 0) {
      setError("Please enter at least one Jira Ticket ID.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start date and End date are required.");
      return;
    }

    // Duplicate Check
    if (!byPassDuplicate && !forceUniqueCode) {
      const matches = checkDuplicatesForMultiple();
      if (matches.length > 0) {
        setDuplicateMatches(matches);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    const formattedJiraString = tickets.join(', ');
    let uniqueCode = formattedJiraString;

    if (forceUniqueCode) {
      uniqueCode = forceUniqueCode;
    } else {
      uniqueCode = generateUniqueCode(formattedJiraString);
    }

    const payload = {
      jira_ticket: formattedJiraString,
      unique_billing_code: uniqueCode,
      project_id: projectId || null,
      start_date: startDate,
      end_date: endDate,
      man_days: parseFloat(manDays) || 0,
      rate_per_man_day: parseFloat(ratePerManDay) || 0,
      total_amount: liveTotalAmount,
      status: status,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      if (!isMissingTable) {
        if (editingRecord) {
          const { error: updateErr } = await supabase
            .from('billing_records')
            .update(payload)
            .eq('id', editingRecord.id);

          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('billing_records')
            .insert([payload]);

          if (insertErr) throw insertErr;
        }
        setSuccessMsg(`Billing record saved successfully (${uniqueCode}).`);
        fetchBillingRecords();
      } else {
        // Fallback local storage mode
        const projObj = projects.find(p => p.id === projectId);
        const newRecord: BillingRecord = {
          id: editingRecord ? editingRecord.id : 'local-' + Date.now(),
          ...payload,
          projects: projObj
        };
        let updatedList: BillingRecord[] = [];
        if (editingRecord) {
          updatedList = billingRecords.map(r => r.id === editingRecord.id ? newRecord : r);
        } else {
          updatedList = [newRecord, ...billingRecords];
        }
        setBillingRecords(updatedList);
        localStorage.setItem('local_billing_records', JSON.stringify(updatedList));
        setSuccessMsg(`Billing saved in local session mode (${uniqueCode}). Run Supabase SQL to persist permanently.`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error("Error saving billing record:", err);
      setError(err.message || "Failed to save billing record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Record
  const handleDeleteRecord = async (id: string) => {
    setIsLoading(true);
    try {
      if (!isMissingTable && !id.startsWith('local-')) {
        const { error: delErr } = await supabase
          .from('billing_records')
          .delete()
          .eq('id', id);

        if (delErr) throw delErr;
      }
      
      const updated = billingRecords.filter(r => r.id !== id);
      setBillingRecords(updated);
      localStorage.setItem('local_billing_records', JSON.stringify(updated));
      setSuccessMsg("Billing record deleted.");
      setDeletingId(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error("Error deleting record:", err);
      setError(err.message || "Failed to delete record.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Proceed with Unique Code
  const handleProceedWithUnique = () => {
    const newCode = generateUniqueCode(jiraTicket);
    setForceUniqueCode(newCode);
    setDuplicateMatches([]);
    handleSaveBilling(true);
  };

  // Copy SQL to Clipboard
  const handleCopySql = () => {
    navigator.clipboard.writeText(migrationSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // --- Statistics ---
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalManDaysCount = 0;
    let pendingCount = 0;
    let paidRevenue = 0;

    billingRecords.forEach(r => {
      const amt = Number(r.total_amount) || 0;
      const md = Number(r.man_days) || 0;
      totalRevenue += amt;
      totalManDaysCount += md;
      if (r.status === 'Pending') pendingCount++;
      if (r.status === 'Paid') paidRevenue += amt;
    });

    return {
      totalRevenue,
      totalManDaysCount,
      pendingCount,
      paidRevenue,
      recordCount: billingRecords.length
    };
  }, [billingRecords]);

  // --- Filtered Billing List ---
  const filteredRecords = useMemo(() => {
    return billingRecords.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const ticketMatch = r.jira_ticket.toLowerCase().includes(q);
        const codeMatch = r.unique_billing_code.toLowerCase().includes(q);
        const projectMatch = r.projects?.name?.toLowerCase().includes(q) || false;
        const notesMatch = r.notes?.toLowerCase().includes(q) || false;
        return ticketMatch || codeMatch || projectMatch || notesMatch;
      }
      return true;
    });
  }, [billingRecords, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Admin Billing Manager</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage single & multiple Jira tickets billing, man-day auto-calculations, and unique code tracking.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-600/20 hover:from-sky-500 hover:to-indigo-500 active:scale-[0.98] transition-all cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Billing Entry
        </button>
      </div>

      {/* 2. MISSING TABLE MIGRATION SETUP NOTICE */}
      {isMissingTable && (
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-5 space-y-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shrink-0">
              ⚡
            </div>
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-black text-amber-900 tracking-tight">
                Database Migration Setup Required (`billing_records`)
              </h3>
              <p className="text-xs text-amber-800">
                The table <code className="bg-amber-200/80 px-1 py-0.5 rounded font-mono text-[11px]">public.billing_records</code> is not yet created in your Supabase project database.
              </p>
            </div>

            <button
              onClick={handleCopySql}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow transition-all cursor-pointer shrink-0"
            >
              {copiedSql ? '✓ Copied SQL!' : '📋 Copy Migration SQL'}
            </button>
          </div>

          <div className="bg-white/80 rounded-xl p-3 border border-amber-200 text-xs text-amber-900 space-y-1 font-mono text-[11px] overflow-x-auto">
            <p className="font-sans font-bold text-amber-950 mb-1">To enable permanent storage in Supabase:</p>
            <ol className="list-decimal list-inside font-sans space-y-0.5 text-amber-800">
              <li>Copy the migration SQL using the button above.</li>
              <li>Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-bold text-sky-700">Supabase Dashboard SQL Editor</a>.</li>
              <li>Paste and click <strong>Run</strong>.</li>
            </ol>
          </div>
        </div>
      )}

      {/* 3. Notifications */}
      {successMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fadeIn">
          <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {error && !isMissingTable && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs font-bold text-rose-800 flex items-center gap-2">
          <svg className="h-4 w-4 text-rose-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* 4. Stat Cards Banner (Tk. Currency) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Billing */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-md border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Billed Revenue</span>
            <div className="h-8 w-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
              Tk.
            </div>
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight">
            Tk. {stats.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{stats.recordCount} total billing entries</p>
        </div>

        {/* Man Days */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Man Days</span>
            <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
            {stats.totalManDaysCount.toFixed(1)} <span className="text-xs font-semibold text-slate-500">Days</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Calculated across all billing cycles</p>
        </div>

        {/* Pending Billings */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pending Billing</span>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
            {stats.pendingCount} <span className="text-xs font-semibold text-amber-600">Pending</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Awaiting invoicing or payment</p>
        </div>

        {/* Paid Revenue */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Collected Revenue</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
              Tk.
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-600 tracking-tight">
            Tk. {stats.paidRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Status marked as Paid</p>
        </div>
      </div>

      {/* 5. Controls, Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Tab Pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
          {['all', 'Pending', 'Billed', 'Paid', 'Cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer capitalize whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            placeholder="Search Jira Tickets, Code or Project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
          />
          <svg className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 6. Billing Records Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
            <p className="mt-3 text-xs font-semibold text-slate-500">Loading billing records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Billing Records Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery ? "No entries match your search query." : "Click 'Add Billing Entry' above to create your first billing record."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Jira Ticket(s) & Unique Code</th>
                  <th className="px-6 py-4">Project</th>
                  <th className="px-6 py-4">Date Range</th>
                  <th className="px-6 py-4 text-center">Man Days</th>
                  <th className="px-6 py-4 text-right">Rate / Day</th>
                  <th className="px-6 py-4 text-right">Total Amount (Tk.)</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredRecords.map((r) => {
                  const ticketsList = parseTickets(r.jira_ticket);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Jira Tickets Badges & Unique Code */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ticketsList.map((t, idx) => (
                            <span key={idx} className="inline-block px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100 text-[11px] font-mono font-bold">
                              {t}
                            </span>
                          ))}
                          {r.unique_billing_code !== r.jira_ticket && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              Code: {r.unique_billing_code}
                            </span>
                          )}
                        </div>
                        {r.notes && (
                          <p className="text-[10px] text-slate-400 truncate max-w-xs mt-1" title={r.notes}>
                            {r.notes}
                          </p>
                        )}
                      </td>

                      {/* Project */}
                      <td className="px-6 py-4 font-semibold text-slate-800">
                        {r.projects?.name || 'Unassigned'}
                      </td>

                      {/* Date Range */}
                      <td className="px-6 py-4 text-slate-500 font-mono text-[11px]">
                        {r.start_date} → {r.end_date}
                      </td>

                      {/* Man Days */}
                      <td className="px-6 py-4 text-center font-bold text-indigo-600">
                        {r.man_days} days
                      </td>

                      {/* Rate per Man Day (Tk.) */}
                      <td className="px-6 py-4 text-right font-mono text-slate-600">
                        Tk. {r.rate_per_man_day.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      {/* Total Amount (Tk.) */}
                      <td className="px-6 py-4 text-right font-black text-slate-900 text-sm">
                        Tk. {r.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${
                            r.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : r.status === 'Billed'
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : r.status === 'Cancelled'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(r)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-sky-600 hover:text-white text-[11px] font-bold transition-all cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingId(r.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white text-[11px] font-bold transition-all cursor-pointer"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Add/Edit Billing Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {editingRecord ? 'Edit Billing Entry' : 'New Billing Entry'}
                </h3>
                <p className="text-xs text-slate-500">Add single or multiple Jira tickets & calculate billing in Tk.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* DUPLICATE MULTIPLE TICKETS WARNING ALERT BANNER */}
            {duplicateMatches.length > 0 && (
              <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-4 space-y-3 animate-shake">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 font-bold">
                    ⚠️
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                      Duplicate Jira Ticket(s) Detected!
                    </h4>
                    <div className="text-xs text-amber-800 mt-1 space-y-1">
                      <p>The following ticket(s) already exist in saved billing records:</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {duplicateMatches.map((m, i) => (
                          <span key={i} className="font-mono font-bold bg-amber-200/80 px-1.5 py-0.5 rounded text-[11px] text-amber-950 border border-amber-300">
                            {m.ticket}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/80 rounded-xl p-3 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">Would you like to proceed anyway?</p>
                  <p className="text-[11px] text-amber-700">
                    If you proceed, the system will auto-assign a unique billing code (<span className="font-mono font-bold text-sky-700">{generateUniqueCode(jiraTicket)}</span>) to keep accounting entries clean.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDuplicateMatches([])}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Modify Tickets
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedWithUnique}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold shadow hover:bg-amber-700 cursor-pointer"
                  >
                    Proceed with Unique Code
                  </button>
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4 text-xs">
              {/* Jira Ticket Input (Multiple Allowed) */}
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">
                  Jira Ticket ID(s) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. BRAC-101, BRAC-102, BRAC-103"
                  value={jiraTicket}
                  onChange={(e) => {
                    setJiraTicket(e.target.value);
                    setDuplicateMatches([]);
                    setForceUniqueCode(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  You can enter single or multiple tickets separated by commas or spaces.
                </p>
              </div>

              {/* Project Select */}
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">
                  Associated Project
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                >
                  <option value="">-- Select Project --</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Date Range: Start Date & End Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Man Days & Rate per Man Day in Tk. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">
                    Man Days (Auto-Calculated)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="e.g. 5"
                    value={manDays}
                    onChange={(e) => setManDays(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-indigo-50/50 border border-indigo-200 text-indigo-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Weekdays between dates</p>
                </div>

                <div>
                  <label className="block font-extrabold text-slate-700 mb-1">
                    Rate per Man Day (Tk.)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 5000"
                    value={ratePerManDay}
                    onChange={(e) => setRatePerManDay(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* LIVE TOTAL AMOUNT DISPLAY IN Tk. */}
              <div className="bg-gradient-to-r from-sky-900 to-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-inner">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-300">Total Calculated Billing</span>
                  <p className="text-[10px] text-slate-400">{manDays || 0} man days × Tk. {ratePerManDay || 0}/day</p>
                </div>
                <div className="text-2xl font-black tracking-tight text-sky-400">
                  Tk. {liveTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">
                  Billing Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all"
                >
                  <option value="Pending">Pending</option>
                  <option value="Billed">Billed</option>
                  <option value="Paid">Paid</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional details or billing reference..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                ></textarea>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSaveBilling(false)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-bold shadow-md shadow-sky-600/20 hover:from-sky-500 hover:to-indigo-500 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingRecord ? 'Update Billing' : 'Save Billing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-lg">
              🗑️
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Delete Billing Record?</h3>
              <p className="text-xs text-slate-500 mt-1">This action cannot be undone.</p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRecord(deletingId)}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold shadow-md shadow-rose-600/20 hover:bg-rose-700 transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
