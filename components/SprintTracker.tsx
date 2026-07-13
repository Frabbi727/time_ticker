"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

// --- Interfaces ---
interface TeamMember {
  id: string;
  name: string;
  pin: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
}

interface JiraTicket {
  title: string;
  url: string;
}

interface TeamAllocation {
  allocated: number;
  completed: number;
}

interface TeamAllocations {
  backend: TeamAllocation;
  web_frontend: TeamAllocation;
  mobile_frontend: TeamAllocation;
  qa: TeamAllocation;
  devops: TeamAllocation;
}

interface Sprint {
  id: string;
  name: string;
  project_id: string;
  projects?: { name: string } | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  progress: number;
  status: 'planning' | 'active' | 'completed' | 'paused';
  jira_tickets?: JiraTicket[] | null;
  team_allocations?: TeamAllocations | null;
  description?: string | null;
  created_by: string | null;
  created_at?: string;
  sprint_assignments?: { user_id: string }[];
}

interface SprintTrackerProps {
  role: string;
  projects: Project[];
  teamUsers: TeamMember[];
  currentUserId: string;
  onRefresh?: () => void;
}

const DEFAULT_ALLOCATIONS: TeamAllocations = {
  backend: { allocated: 0, completed: 0 },
  web_frontend: { allocated: 0, completed: 0 },
  mobile_frontend: { allocated: 0, completed: 0 },
  qa: { allocated: 0, completed: 0 },
  devops: { allocated: 0, completed: 0 },
};

const getFriendlyRoleName = (r: string) => {
  switch (r) {
    case 'admin': return 'System Admin';
    case 'software_engineer': return 'Software Engineer';
    case 'ba': return 'Business Analyst';
    case 'project_manager': return 'Project Manager';
    case 'designer': return 'UI/UX Designer';
    case 'qa': return 'QA Engineer';
    case 'devops': return 'DevOps';
    default: return 'Regular Employee';
  }
};

export default function SprintTracker({
  role,
  projects,
  teamUsers,
  currentUserId,
  onRefresh
}: SprintTrackerProps) {
  // 1. Authorization States
  const isEditor = role === 'admin' || role === 'ba';

  // 2. Component States
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter States
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'mine'>('all');

  // Modal States (Create/Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Deletion Modal States
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Form Fields
  const [sprintName, setSprintName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'planning' | 'active' | 'completed' | 'paused'>('planning');
  const [description, setDescription] = useState('');
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  
  // Jira Tickets List State
  const [jiraTickets, setJiraTickets] = useState<JiraTicket[]>([]);
  const [tempTicketTitle, setTempTicketTitle] = useState('');
  const [tempTicketUrl, setTempTicketUrl] = useState('');

  // Sub-team allocations State
  const [allocations, setAllocations] = useState<TeamAllocations>({ ...DEFAULT_ALLOCATIONS });
  const [autoCalculateProgress, setAutoCalculateProgress] = useState(true);

  // 3. Exclude Admins from Assignable Resources List
  const assignableUsers = useMemo(() => {
    return teamUsers.filter(user => user.role !== 'admin');
  }, [teamUsers]);

  // 4. Fetch Sprints
  const fetchSprints = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('sprints')
        .select(`
          *,
          projects (
            id,
            name
          ),
          sprint_assignments (
            user_id
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setSprints(data || []);
    } catch (err: any) {
      console.error('Error fetching sprints:', err);
      setError('Failed to fetch sprints from the database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSprints();
  }, [currentUserId]);

  // 5. Auto-calculate overall progress from sub-team man-days
  useEffect(() => {
    if (!autoCalculateProgress) return;
    
    const sumAllocated = 
      allocations.backend.allocated +
      allocations.web_frontend.allocated +
      allocations.mobile_frontend.allocated +
      allocations.qa.allocated +
      allocations.devops.allocated;

    const sumCompleted = 
      allocations.backend.completed +
      allocations.web_frontend.completed +
      allocations.mobile_frontend.completed +
      allocations.qa.completed +
      allocations.devops.completed;

    if (sumAllocated > 0) {
      const computed = Math.round((sumCompleted / sumAllocated) * 100);
      setProgress(Math.min(computed, 100));
    } else {
      setProgress(0);
    }
  }, [allocations, autoCalculateProgress]);

  // 6. Calculate Sprint Duration dynamically
  const calculatedDuration = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }, [startDate, endDate]);

  // 7. Filter Sprints based on user role and filters
  const filteredSprints = useMemo(() => {
    return sprints.filter(sprint => {
      // Regular employees can only see sprints they are assigned to
      if (role !== 'admin' && role !== 'ba') {
        const isAssigned = sprint.sprint_assignments?.some(a => a.user_id === currentUserId);
        if (!isAssigned) return false;
      }

      // Filter by Status
      if (statusFilter !== 'all' && sprint.status !== statusFilter) return false;

      // Filter by Project
      if (projectFilter !== 'all' && sprint.project_id !== projectFilter) return false;

      // Filter by Creator
      if (isEditor && viewFilter === 'mine' && sprint.created_by !== currentUserId) return false;

      return true;
    });
  }, [sprints, role, currentUserId, statusFilter, projectFilter, viewFilter, isEditor]);

  // 8. Action Handlers
  const handleOpenCreateModal = () => {
    setEditingId(null);
    setSprintName('');
    setSelectedProjectId(projects[0]?.id || '');
    setStartDate(new Date().toISOString().split('T')[0]);
    
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() + 13);
    setEndDate(defaultEnd.toISOString().split('T')[0]);
    
    setProgress(0);
    setStatus('planning');
    setJiraTickets([]);
    setTempTicketTitle('');
    setTempTicketUrl('');
    setAllocations({
      backend: { allocated: 0, completed: 0 },
      web_frontend: { allocated: 0, completed: 0 },
      mobile_frontend: { allocated: 0, completed: 0 },
      qa: { allocated: 0, completed: 0 },
      devops: { allocated: 0, completed: 0 }
    });
    setAutoCalculateProgress(true);
    setAssignedUserIds([]);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sprint: Sprint) => {
    setEditingId(sprint.id);
    setSprintName(sprint.name);
    setSelectedProjectId(sprint.project_id);
    setStartDate(sprint.start_date);
    setEndDate(sprint.end_date);
    setProgress(sprint.progress);
    setStatus(sprint.status);
    setJiraTickets(sprint.jira_tickets || []);
    setTempTicketTitle('');
    setTempTicketUrl('');
    
    // Safety merge allocations
    const sAlloc = sprint.team_allocations || DEFAULT_ALLOCATIONS;
    setAllocations({
      backend: { allocated: sAlloc.backend?.allocated ?? 0, completed: sAlloc.backend?.completed ?? 0 },
      web_frontend: { allocated: sAlloc.web_frontend?.allocated ?? 0, completed: sAlloc.web_frontend?.completed ?? 0 },
      mobile_frontend: { allocated: sAlloc.mobile_frontend?.allocated ?? 0, completed: sAlloc.mobile_frontend?.completed ?? 0 },
      qa: { allocated: sAlloc.qa?.allocated ?? 0, completed: sAlloc.qa?.completed ?? 0 },
      devops: { allocated: sAlloc.devops?.allocated ?? 0, completed: sAlloc.devops?.completed ?? 0 }
    });
    
    // Disable auto-calculate if progress doesn't match allocations calculation (meaning it was customized manually)
    const sumAllocated = 
      (sAlloc.backend?.allocated ?? 0) +
      (sAlloc.web_frontend?.allocated ?? 0) +
      (sAlloc.mobile_frontend?.allocated ?? 0) +
      (sAlloc.qa?.allocated ?? 0) +
      (sAlloc.devops?.allocated ?? 0);

    const sumCompleted = 
      (sAlloc.backend?.completed ?? 0) +
      (sAlloc.web_frontend?.completed ?? 0) +
      (sAlloc.mobile_frontend?.completed ?? 0) +
      (sAlloc.qa?.completed ?? 0) +
      (sAlloc.devops?.completed ?? 0);

    const expectedProgress = sumAllocated > 0 ? Math.round((sumCompleted / sumAllocated) * 100) : 0;
    setAutoCalculateProgress(expectedProgress === sprint.progress);

    const assigned = sprint.sprint_assignments?.map(a => a.user_id) || [];
    setAssignedUserIds(assigned);
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleAddTicket = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!tempTicketTitle.trim()) return;
    
    // Add default protocol to URL if missing
    let url = tempTicketUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    setJiraTickets(prev => [...prev, { title: tempTicketTitle.trim(), url: url || '#' }]);
    setTempTicketTitle('');
    setTempTicketUrl('');
  };

  const handleRemoveTicket = (indexToRemove: number) => {
    setJiraTickets(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAllocationChange = (team: keyof TeamAllocations, field: 'allocated' | 'completed', val: number) => {
    const numericVal = Math.max(0, val);
    setAllocations(prev => ({
      ...prev,
      [team]: {
        ...prev[team],
        [field]: numericVal
      }
    }));
  };

  const handleToggleAssignee = (userId: string) => {
    setAssignedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!sprintName.trim()) {
      setError('Please enter a sprint name.');
      return;
    }
    if (!selectedProjectId) {
      setError('Please select a project.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Please specify start and end dates.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    try {
      let sprintId = editingId;

      if (editingId) {
        // Update sprint
        const { error: updateError } = await supabase
          .from('sprints')
          .update({
            project_id: selectedProjectId,
            name: sprintName.trim(),
            start_date: startDate,
            end_date: endDate,
            duration_days: calculatedDuration,
            progress: progress,
            status: status,
            jira_tickets: jiraTickets,
            team_allocations: allocations
          })
          .eq('id', editingId);

        if (updateError) throw updateError;
        setSuccess('Sprint updated successfully!');
      } else {
        // Insert new sprint
        const { data: newSprint, error: insertError } = await supabase
          .from('sprints')
          .insert([{
            project_id: selectedProjectId,
            name: sprintName.trim(),
            start_date: startDate,
            end_date: endDate,
            duration_days: calculatedDuration,
            progress: progress,
            status: status,
            jira_tickets: jiraTickets,
            team_allocations: allocations,
            created_by: currentUserId
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        sprintId = newSprint.id;
        setSuccess('Sprint created successfully!');
      }

      // Sync Assignments
      if (sprintId) {
        const { error: deleteAssignError } = await supabase
          .from('sprint_assignments')
          .delete()
          .eq('sprint_id', sprintId);

        if (deleteAssignError) throw deleteAssignError;

        if (assignedUserIds.length > 0) {
          const assignmentsToInsert = assignedUserIds.map(uid => ({
            sprint_id: sprintId,
            user_id: uid
          }));

          const { error: insertAssignError } = await supabase
            .from('sprint_assignments')
            .insert(assignmentsToInsert);

          if (insertAssignError) throw insertAssignError;
        }
      }

      await fetchSprints();
      if (onRefresh) onRefresh();

      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess(null);
      }, 1000);

    } catch (err: any) {
      console.error('Error saving sprint:', err);
      setError(err.message || 'An error occurred while saving the sprint.');
    }
  };

  // Quick Finish handler
  const handleQuickFinish = async (sprint: Sprint) => {
    setError(null);
    try {
      // Create complete allocations: set all completed days equal to allocated days
      const sAlloc = sprint.team_allocations || DEFAULT_ALLOCATIONS;
      const completedAllocations: TeamAllocations = {
        backend: { allocated: sAlloc.backend?.allocated ?? 0, completed: sAlloc.backend?.allocated ?? 0 },
        web_frontend: { allocated: sAlloc.web_frontend?.allocated ?? 0, completed: sAlloc.web_frontend?.allocated ?? 0 },
        mobile_frontend: { allocated: sAlloc.mobile_frontend?.allocated ?? 0, completed: sAlloc.mobile_frontend?.allocated ?? 0 },
        qa: { allocated: sAlloc.qa?.allocated ?? 0, completed: sAlloc.qa?.allocated ?? 0 },
        devops: { allocated: sAlloc.devops?.allocated ?? 0, completed: sAlloc.devops?.allocated ?? 0 }
      };

      const { error: updateError } = await supabase
        .from('sprints')
        .update({
          status: 'completed',
          progress: 100,
          team_allocations: completedAllocations
        })
        .eq('id', sprint.id);

      if (updateError) throw updateError;
      
      await fetchSprints();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Error finishing sprint:', err);
      setError('Failed to complete the sprint.');
    }
  };

  const handleRequestDelete = (sprintId: string, name: string) => {
    setDeleteTargetId(sprintId);
    setDeleteTargetName(name);
    setError(null);
  };

  const executeDeleteSprint = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('sprints')
        .delete()
        .eq('id', deleteTargetId);

      if (deleteError) throw deleteError;
      
      setDeleteTargetId(null);
      setDeleteTargetName('');
      await fetchSprints();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Error deleting sprint:', err);
      setError(err.message || 'Failed to delete the sprint.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Assignee mapping helper
  const getAssigneeUsers = (assignments?: { user_id: string }[]) => {
    if (!assignments) return [];
    return assignments
      .map(a => teamUsers.find(u => u.id === a.user_id))
      .filter((u): u is TeamMember => !!u);
  };

  const getStatusBadge = (s: Sprint['status']) => {
    switch (s) {
      case 'planning':
        return { label: 'Planning', style: 'bg-amber-50 border border-amber-100 text-amber-700 font-extrabold' };
      case 'active':
        return { label: 'Active Execution', style: 'bg-sky-50 border border-sky-100 text-sky-700 font-extrabold' };
      case 'completed':
        return { label: 'Finished', style: 'bg-emerald-50 border border-emerald-100 text-emerald-700 font-extrabold' };
      case 'paused':
        return { label: 'Paused / Blocked', style: 'bg-slate-100 border border-slate-200 text-slate-600 font-extrabold' };
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Area */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="text-left">
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>🚀</span> Work Sprint Tracker
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isEditor
              ? 'Plan work sprints, track ticket statuses, allocate sub-team man-days, and monitor overall workflow.'
              : 'View status and timeline updates for the sprints you are currently assigned to.'}
          </p>
        </div>
        {isEditor && (
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-3 shadow-md hover:shadow-sky-100 active:scale-[0.98] transition-all cursor-pointer shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Work Sprint
          </button>
        )}
      </div>

      {/* Error Feedback */}
      {error && (
        <div className="rounded-xl bg-rose-50 border-l-4 border-rose-500 p-4 text-xs text-rose-700 font-semibold text-left animate-in fade-in duration-200">
          {error}
        </div>
      )}

      {/* 2. Filters / Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-left">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-bold text-slate-600 outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Finished</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          <div className="text-left">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Project</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-bold text-slate-600 outline-none cursor-pointer max-w-[200px]"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {isEditor && (
            <div className="text-left">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Scope</label>
              <div className="flex rounded-xl bg-slate-100 p-0.5">
                <button
                  onClick={() => setViewFilter('all')}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                    viewFilter === 'all'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All Sprints
                </button>
                <button
                  onClick={() => setViewFilter('mine')}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                    viewFilter === 'mine'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  My Created
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-xs font-bold text-slate-400">
          Showing {filteredSprints.length} Sprints
        </div>
      </div>

      {/* 3. Sprints List */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center bg-white rounded-3xl border border-slate-100 p-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent"></div>
            <p className="text-xs font-semibold text-slate-400">Loading sprint details...</p>
          </div>
        </div>
      ) : filteredSprints.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-dashed border-slate-200 px-6">
          <span className="text-3xl mb-2">📋</span>
          <p className="text-xs font-bold text-slate-400">No work sprints found matching current filters.</p>
          {!isEditor && (
            <p className="text-[10px] text-slate-400 mt-1">You will see sprints here when an Admin or BA assigns you to one.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-6">
          {filteredSprints.map((sprint) => {
            const badge = getStatusBadge(sprint.status);
            const assignees = getAssigneeUsers(sprint.sprint_assignments);
            
            // Allocation mapping defaults
            const sAlloc = sprint.team_allocations || DEFAULT_ALLOCATIONS;
            const subTeams = [
              { key: 'backend', label: 'Backend', data: sAlloc.backend ?? { allocated: 0, completed: 0 } },
              { key: 'web_frontend', label: 'Web FE', data: sAlloc.web_frontend ?? { allocated: 0, completed: 0 } },
              { key: 'mobile_frontend', label: 'Mobile FE', data: sAlloc.mobile_frontend ?? { allocated: 0, completed: 0 } },
              { key: 'qa', label: 'QA / Test', data: sAlloc.qa ?? { allocated: 0, completed: 0 } },
              { key: 'devops', label: 'DevOps', data: sAlloc.devops ?? { allocated: 0, completed: 0 } },
            ];

            return (
              <div
                key={sprint.id}
                className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 text-left flex flex-col gap-4 relative overflow-hidden"
              >
                {/* Visual Status Indicator Top Bar */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                  sprint.status === 'planning' ? 'bg-amber-400' :
                  sprint.status === 'active' ? 'bg-sky-500' :
                  sprint.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-400'
                }`}></div>

                {/* Card Title & Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-600">
                      {sprint.projects?.name || 'Unassigned Project'}
                    </span>
                    <h3 className="text-base font-black text-slate-900 tracking-tight mt-0.5">
                      {sprint.name}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    <span className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-[9px] uppercase tracking-wider ${badge.style}`}>
                      {badge.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-55 px-2 py-0.5 rounded-lg border border-slate-150">
                      📅 {sprint.duration_days} Days
                    </span>
                  </div>
                </div>

                {/* Description Text */}
                {sprint.description && (
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line font-medium bg-slate-50/40 p-3.5 rounded-2xl border border-slate-100">
                    {sprint.description}
                  </p>
                )}

                {/* Jira Tickets List (Render multi-ticket tags) */}
                {sprint.jira_tickets && sprint.jira_tickets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Jira Tickets:</span>
                    {sprint.jira_tickets.map((t, idx) => (
                      <a
                        key={idx}
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 bg-sky-50/50 hover:bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100/50 transition-colors"
                      >
                        <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {t.title}
                      </a>
                    ))}
                  </div>
                )}

                {/* Sub-Teams Days Allocation Dashboard */}
                <div className="border-t border-b border-slate-50 py-4 my-1">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Sub-Team Resource Allocation (Man-Days)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {subTeams.map((t) => {
                      const isComplete = t.data.allocated > 0 && t.data.completed >= t.data.allocated;
                      const pct = t.data.allocated > 0 ? Math.min(Math.round((t.data.completed / t.data.allocated) * 100), 100) : 0;
                      
                      return (
                        <div
                          key={t.key}
                          className={`rounded-2xl border p-3 flex flex-col gap-1.5 transition-all ${
                            isComplete 
                              ? 'bg-emerald-50/45 border-emerald-100 shadow-sm shadow-emerald-500/5'
                              : t.data.allocated > 0 
                                ? 'bg-slate-50/45 border-slate-200/50' 
                                : 'bg-slate-50/20 border-slate-100 opacity-60'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-800">{t.label}</span>
                            {isComplete && <span className="text-[10px] text-emerald-600">✓</span>}
                          </div>
                          
                          <div className="flex justify-between items-baseline font-mono">
                            <span className="text-xs font-black text-slate-700">
                              {t.data.completed}/{t.data.allocated}
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold">days</span>
                          </div>

                          {/* Mini Progress Bar */}
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/20 mt-0.5">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isComplete ? 'bg-emerald-500' : 'bg-sky-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Progress Bar & Assigned Staff */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5 text-left">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Overall Sprint Completion</span>
                      <span>{sprint.progress}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-150/20">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          sprint.status === 'planning' ? 'bg-amber-400' :
                          sprint.status === 'active' ? 'bg-sky-500' :
                          sprint.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                        style={{ width: `${sprint.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 md:items-end text-left md:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Team</span>
                    <div className="flex flex-wrap gap-1.5 md:justify-end mt-1">
                      {assignees.length === 0 ? (
                        <span className="text-[10px] text-slate-400 font-semibold italic">No members assigned</span>
                      ) : (
                        assignees.map((user) => (
                          <span
                            key={user.id}
                            className="inline-flex items-center gap-1 bg-slate-100 border border-slate-205 rounded-lg px-2 py-0.5 text-[10px] font-bold text-slate-600"
                            title={`${user.name} (${user.role})`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                            {user.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeline Range & Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-50 mt-1">
                  <div className="text-[11px] font-semibold text-slate-400">
                    ⏱️ Timeline: <span className="font-bold text-slate-600">{sprint.start_date}</span> to <span className="font-bold text-slate-600">{sprint.end_date}</span>
                  </div>

                  {isEditor && (
                    <div className="flex flex-wrap gap-2 self-end sm:self-center">
                      {sprint.status !== 'completed' && (
                        <button
                          onClick={() => handleQuickFinish(sprint)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow hover:shadow-emerald-100 transition-all cursor-pointer"
                        >
                          Mark Finished
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEditModal(sprint)}
                        className="text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded-xl text-xs font-extrabold border border-sky-100/30 hover:border-sky-100 transition-all cursor-pointer"
                      >
                        Edit Details
                      </button>
                      <button
                        onClick={() => handleRequestDelete(sprint.id, sprint.name)}
                        className="text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-xl text-xs font-extrabold border border-rose-100/30 hover:border-rose-100 transition-all cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Create/Edit Sprint Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 text-left">
                  {editingId ? 'Modify Work Sprint' : 'Create New Work Sprint'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 text-left">
                  Define project phase details, dates, Jira tickets, and sub-team allocations.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* In-Modal Feedback Alerts */}
            {error && (
              <div className="rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3 text-xs text-rose-700 font-semibold text-left">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-emerald-50 border-l-4 border-emerald-500 p-3 text-xs text-emerald-700 font-semibold text-left">
                {success}
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Row 1: Name and Project */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-black">
                    Sprint Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sprint 1 - Foundation Setup"
                    value={sprintName}
                    onChange={(e) => setSprintName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all font-bold"
                  />
                </div>

                <div className="text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-black">
                    Target Project
                  </label>
                  <select
                    required
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-600 outline-none focus:border-sky-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="" disabled>Select project...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Date Selectors & Duration Display */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-black">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all font-bold"
                  />
                </div>

                <div className="text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-black">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all font-bold"
                  />
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-center shadow-inner">
                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Calculated Duration</span>
                  <span className="text-sm font-black text-slate-700 mt-0.5 block">
                    {calculatedDuration} Days
                  </span>
                </div>
              </div>

              {/* Row 3: Jira Tickets Builder */}
              <div className="text-left border-t border-slate-100 pt-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-black">
                  Jira Tickets Manager
                </label>
                
                {/* Tickets Added list */}
                {jiraTickets.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                    {jiraTickets.map((t, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm"
                      >
                        <span className="truncate max-w-[120px]">{t.title}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTicket(idx)}
                          className="text-rose-500 hover:text-rose-700 font-extrabold cursor-pointer h-4 w-4 rounded-full hover:bg-rose-50 flex items-center justify-center shrink-0"
                          title="Remove ticket"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Input builders */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    placeholder="Ticket Key/Title (e.g. PROJ-101)"
                    value={tempTicketTitle}
                    onChange={(e) => setTempTicketTitle(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:bg-white focus:border-sky-500"
                  />
                  <input
                    type="text"
                    placeholder="Jira Ticket URL (Optional)"
                    value={tempTicketUrl}
                    onChange={(e) => setTempTicketUrl(e.target.value)}
                    className="flex-1.5 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:bg-white focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTicket}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                  >
                    Add Ticket
                  </button>
                </div>
              </div>

              {/* Row 4: Sub-Team Man-Days Allocations */}
              <div className="text-left border-t border-slate-100 pt-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 font-black">
                  Sub-Team Man-Days Allocation
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50/40 p-4 rounded-3xl border border-slate-100">
                  {([
                    { key: 'backend', label: 'Backend' },
                    { key: 'web_frontend', label: 'Web FE' },
                    { key: 'mobile_frontend', label: 'Mobile FE' },
                    { key: 'qa', label: 'QA / Test' },
                    { key: 'devops', label: 'DevOps' },
                  ] as const).map(team => (
                    <div key={team.key} className="bg-white rounded-2xl p-3 border border-slate-200/60 shadow-sm flex flex-col gap-2">
                      <span className="block text-[10px] font-black text-slate-800 border-b border-slate-100 pb-1">{team.label}</span>
                      
                      <div className="space-y-1 text-left">
                        <label className="block text-[8px] font-bold text-slate-400 uppercase">Allocated</label>
                        <input
                          type="number"
                          min={0}
                          value={allocations[team.key].allocated}
                          onChange={(e) => handleAllocationChange(team.key, 'allocated', parseInt(e.target.value) || 0)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs text-slate-700 font-bold focus:bg-white focus:border-sky-500 outline-none"
                        />
                      </div>

                      <div className="space-y-1 text-left">
                        <label className="block text-[8px] font-bold text-slate-400 uppercase">Completed</label>
                        <input
                          type="number"
                          min={0}
                          value={allocations[team.key].completed}
                          onChange={(e) => handleAllocationChange(team.key, 'completed', parseInt(e.target.value) || 0)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1 text-xs text-slate-700 font-bold focus:bg-white focus:border-sky-500 outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 5: Description textarea */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-black">
                  Sprint Description & Goals (Optional)
                </label>
                <textarea
                  placeholder="Describe sprint goals, key tasks, and deliverables..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Row 6: Status selection & Progress slider */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                <div className="text-left">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-black">
                    Sprint Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-600 outline-none focus:border-sky-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="planning">Planning Phase</option>
                    <option value="active">Active Execution</option>
                    <option value="completed">Finished Phase</option>
                    <option value="paused">Paused / Blocked</option>
                  </select>
                </div>

                <div className="text-left flex flex-col justify-end">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="autoCalc"
                        checked={autoCalculateProgress}
                        onChange={(e) => setAutoCalculateProgress(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-350 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <label htmlFor="autoCalc" className="text-[10px] font-black text-slate-500 uppercase cursor-pointer">
                        Auto-Calc Progress
                      </label>
                    </div>
                    <span className="text-xs font-black text-sky-600">{progress}%</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      disabled={autoCalculateProgress}
                      value={progress}
                      onChange={(e) => setProgress(parseInt(e.target.value))}
                      className={`w-full h-1.5 bg-slate-100 rounded-lg cursor-pointer accent-sky-600 ${
                        autoCalculateProgress ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Row 7: Assigned Resources (Grid checklist - Excludes Admins) */}
              <div className="text-left border-t border-slate-100 pt-3">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-black">
                  Assign Team Resources
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[140px] overflow-y-auto p-1.5 bg-slate-50/55 rounded-2xl border border-slate-100">
                  {assignableUsers.map(user => {
                    const isChecked = assignedUserIds.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        onClick={() => handleToggleAssignee(user.id)}
                        className={`flex items-center gap-2.5 rounded-xl border p-2 cursor-pointer select-none transition-all ${
                          isChecked
                            ? 'border-sky-500 bg-sky-50/50 shadow-sm'
                            : 'border-slate-200/60 bg-white hover:border-slate-350'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} 
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer pointer-events-none"
                        />
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800 truncate" title={user.name}>
                            {user.name}
                          </span>
                          <span className="block text-[9px] font-semibold text-slate-400 uppercase">
                            {getFriendlyRoleName(user.role)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {assignableUsers.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs font-bold text-slate-400 italic">
                      No assignable team profiles found.
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs px-4 py-2.5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 shadow hover:shadow-sky-100 transition-all cursor-pointer"
                >
                  {editingId ? 'Update Sprint' : 'Save Sprint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Custom Deletion Warning Confirmation Modal Overlay */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 text-left flex flex-col gap-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center font-black text-rose-600 text-lg animate-bounce">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Confirm Deletion</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">This action is irreversible</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
              Are you sure you want to permanently delete the sprint <strong className="text-slate-800">"{deleteTargetName}"</strong>? This will remove all associated resource assignments from the system.
            </p>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
              <button
                onClick={() => { setDeleteTargetId(null); setDeleteTargetName(''); }}
                className="rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs px-4 py-2.5 transition-colors cursor-pointer"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={executeDeleteSprint}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2.5 shadow hover:shadow-rose-100 transition-all cursor-pointer flex items-center gap-1.5"
                disabled={isDeleting}
              >
                {isDeleting && (
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
