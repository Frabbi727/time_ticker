"use client";

import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

interface TeamMember {
  id: string;
  name: string;
  pin: string;
  role: string;
  created_at?: string;
}

interface TeamManagerProps {
  teamUsers: TeamMember[];
  onProfilesChange: () => void;
  role?: string;
}

export default function TeamManager({ teamUsers, onProfilesChange, role: viewerRole = 'admin' }: TeamManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<string>('employee');
  const [password, setPassword] = useState('');
  const [usePinAsPassword, setUsePinAsPassword] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editing state
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editPin, setEditPin] = useState<string>('');
  const [editRole, setEditRole] = useState<string>('');
  const [editPassword, setEditPassword] = useState<string>('');
  const [changePassword, setChangePassword] = useState<boolean>(false);

  const handleStartEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditPin(member.pin);
    setEditRole(member.role);
    setEditPassword('');
    setChangePassword(false);
    setError(null);
    setSuccess(null);
  };

  // Filter team members based on search query
  const filteredMembers = useMemo(() => {
    return teamUsers.filter(member => {
      if (viewerRole !== 'admin' && member.role === 'admin') return false;
      const query = searchTerm.toLowerCase();
      return member.name.toLowerCase().includes(query) || member.pin.includes(query);
    });
  }, [teamUsers, searchTerm, viewerRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    // Validations
    if (!name.trim()) {
      setError('Please enter a valid full name.');
      setIsLoading(false);
      return;
    }

    const sanitizedPin = pin.trim();
    if (!/^\d{4}$/.test(sanitizedPin)) {
      setError('PIN code must be exactly 4 numeric digits.');
      setIsLoading(false);
      return;
    }

    const finalPassword = usePinAsPassword ? sanitizedPin : password.trim();
    if (!finalPassword || finalPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      setIsLoading(false);
      return;
    }

    try {
      // Call the RPC helper to securely register the new user in auth.users & identities
      const { error: rpcError } = await supabase.rpc('create_new_employee', {
        input_pin: sanitizedPin,
        input_name: name.trim(),
        input_password: finalPassword,
        input_role: role
      });

      if (rpcError) {
        throw rpcError;
      }

      setSuccess(`Successfully registered ${name.trim()} (PIN: ${sanitizedPin})!`);
      setName('');
      setPin('');
      setPassword('');
      setUsePinAsPassword(true);
      setRole('employee');
      
      // Refresh profiles list in parent state
      onProfilesChange();
      
      // Close modal after 1.5 seconds
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess(null);
      }, 1500);
      
    } catch (err: unknown) {
      console.error('Error registering employee:', err);
      setError(err instanceof Error ? err.message : 'Failed to register the new employee.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    if (!editName.trim()) {
      setError('Please provide a full name.');
      return;
    }

    if (editPin.length !== 4) {
      setError('PIN code must be exactly 4 digits.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const params: any = {
        target_user_id: editingMember.id,
        input_name: editName.trim(),
        input_pin: editPin,
        input_role: editRole
      };

      if (changePassword && editPassword) {
        params.input_password = editPassword;
      }

      const { error: rpcError } = await supabase.rpc('edit_user_by_admin', params);

      if (rpcError) throw rpcError;

      setSuccess('Profile updated successfully!');
      
      onProfilesChange();

      setTimeout(() => {
        setEditingMember(null);
        setSuccess(null);
      }, 1000);
    } catch (err: unknown) {
      console.error('Error editing employee:', err);
      setError(err instanceof Error ? err.message : 'Failed to update employee profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (member: TeamMember) => {
    if (member.role === 'admin') {
      const adminCount = teamUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        alert('Cannot delete the only remaining admin in the system.');
        return;
      }
    }

    if (!window.confirm(`Are you absolutely sure you want to delete ${member.name} (PIN: ${member.pin})?\nThis will permanently delete all their work logs, sprint assignments, and attendance records.`)) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: member.id
      });

      if (rpcError) throw rpcError;

      onProfilesChange();
    } catch (err: unknown) {
      console.error('Error deleting employee:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete employee profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight text-left">Team Management Center</h2>
          <p className="text-xs text-slate-400 mt-1 text-left">Create, view, and manage employee profiles and system credentials</p>
        </div>
        {viewerRole === 'admin' && (
          <div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-3 shadow-md hover:shadow-sky-100 active:scale-[0.98] transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Register New Member
            </button>
          </div>
        )}
      </div>

      {/* Main Members Grid/Table */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
        {/* Search Filter */}
        <div className="flex items-center gap-3 max-w-md">
          <input
            type="text"
            placeholder="Search member by name or PIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all shadow-inner"
          />
        </div>

        {/* Members List */}
        {filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-xs font-bold text-slate-400">No team members found matching your search query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-4">Team Member</th>
                  <th className="pb-3 pr-4">PIN Credentials</th>
                  <th className="pb-3 pr-4">Authentication Email</th>
                  <th className="pb-3 pr-4">System Access Role</th>
                  <th className="pb-3 text-right">Status</th>
                  {viewerRole === 'admin' && <th className="pb-3 text-right pr-2">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/40">
                    {/* Name & Initials */}
                    <td className="py-3.5 pr-4 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-slate-200/60 flex items-center justify-center font-black text-slate-600 text-xs shrink-0">
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-bold text-slate-800">{member.name}</span>
                    </td>
                    {/* PIN */}
                    <td className="py-3.5 pr-4 font-mono font-bold text-slate-700">
                      {member.pin}
                    </td>
                    {/* Email */}
                    <td className="py-3.5 pr-4 font-semibold text-slate-500">
                      {member.pin}@tracker.local
                    </td>
                    {/* Role */}
                    <td className="py-3.5 pr-4">
                      {(() => {
                        const badge = (r: string) => {
                          switch (r) {
                            case 'admin':
                              return { label: 'System Admin', style: 'bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold' };
                            case 'software_engineer':
                              return { label: 'Software Engineer', style: 'bg-sky-50 border border-sky-100 text-sky-700 font-extrabold' };
                            case 'ba':
                              return { label: 'Business Analyst', style: 'bg-amber-50 border border-amber-100 text-amber-700 font-extrabold' };
                            case 'project_manager':
                              return { label: 'Project Manager', style: 'bg-rose-50 border border-rose-100 text-rose-700 font-extrabold' };
                            case 'designer':
                              return { label: 'UI/UX Designer', style: 'bg-purple-50 border border-purple-100 text-purple-700 font-extrabold' };
                            case 'qa':
                              return { label: 'QA Engineer', style: 'bg-emerald-50 border border-emerald-100 text-emerald-700 font-extrabold' };
                            case 'devops':
                              return { label: 'DevOps Engineer', style: 'bg-violet-50 border border-violet-100 text-violet-700 font-extrabold' };
                            case 'manager':
                              return { label: 'Manager', style: 'bg-cyan-50 border border-cyan-100 text-cyan-700 font-extrabold' };
                            default:
                              return { label: 'Regular Employee', style: 'bg-slate-100 border border-slate-200 text-slate-600 font-extrabold' };
                          }
                        };
                        const b = badge(member.role);
                        return (
                          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] uppercase tracking-wide ${b.style}`}>
                            {b.label}
                          </span>
                        );
                      })()}
                    </td>
                    {/* Status badge */}
                    <td className="py-3.5 text-right">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        Active Profile
                      </span>
                    </td>
                    {viewerRole === 'admin' && (
                      <td className="py-3.5 text-right space-x-1.5 pr-2">
                        <button
                          onClick={() => handleStartEdit(member)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 hover:border-sky-100 bg-white hover:bg-sky-50 text-slate-500 hover:text-sky-700 px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-all shadow-sm active:scale-95"
                          title="Edit Profile"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(member)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 hover:border-rose-100 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-all shadow-sm active:scale-95"
                          title="Delete Profile"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Member Modal Dialog Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 text-left">Register New Team Member</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 text-left">Create a secure profile and access credentials</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                disabled={isLoading}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error/Success Feedbacks */}
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

            {/* Register Member Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mila Jovovich"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* PIN Code */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  PIN Code (4 Digits)
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="e.g. 2045"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-mono font-bold tracking-widest text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* Role Select */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  System Role / Designation
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 outline-none focus:border-sky-500 focus:bg-white transition-all cursor-pointer"
                  disabled={isLoading}
                >
                  <option value="employee">Regular Employee</option>
                  <option value="software_engineer">Software Engineer</option>
                  <option value="ba">Business Analyst</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="designer">UI/UX Designer</option>
                  <option value="qa">QA Engineer</option>
                  <option value="devops">DevOps Engineer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">System Admin</option>
                </select>
              </div>

              {/* Password Controls */}
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="usePin"
                    checked={usePinAsPassword}
                    onChange={(e) => setUsePinAsPassword(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-slate-200 bg-slate-50 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    disabled={isLoading}
                  />
                  <label htmlFor="usePin" className="text-xs font-semibold text-slate-600 cursor-pointer">
                    Use PIN code as login password
                  </label>
                </div>

                {!usePinAsPassword && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Custom Password
                    </label>
                    <input
                      type="password"
                      required={!usePinAsPassword}
                      placeholder="Enter employee password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                      disabled={isLoading}
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs px-4 py-2.5 transition-colors cursor-pointer"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 shadow hover:shadow-sky-100 transition-all flex items-center gap-2 cursor-pointer"
                  disabled={isLoading}
                >
                  {isLoading && (
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {isLoading ? 'Creating...' : 'Register Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal Dialog Overlay */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col gap-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 text-left">Edit Team Member</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 text-left">Update employee profile and security configurations</p>
              </div>
              <button
                onClick={() => setEditingMember(null)}
                className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                disabled={isLoading}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error/Success Feedbacks */}
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

            {/* Edit Member Form */}
            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Name */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mila Jovovich"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* PIN Code */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  PIN Code (4 Digits)
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="e.g. 2045"
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-mono font-bold tracking-widest text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* Role Select */}
              <div className="text-left">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  System Role / Designation
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 outline-none focus:border-sky-500 focus:bg-white transition-all cursor-pointer"
                  disabled={isLoading}
                >
                  <option value="employee">Regular Employee</option>
                  <option value="software_engineer">Software Engineer</option>
                  <option value="ba">Business Analyst</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="designer">UI/UX Designer</option>
                  <option value="qa">QA Engineer</option>
                  <option value="devops">DevOps Engineer</option>
                  <option value="manager">Manager</option>
                  <option value="admin">System Admin</option>
                </select>
              </div>

              {/* Password Controls */}
              <div className="space-y-2 text-left">
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="changePassword"
                    checked={changePassword}
                    onChange={(e) => setChangePassword(e.target.checked)}
                    className="h-4.5 w-4.5 rounded border-slate-200 bg-slate-50 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    disabled={isLoading}
                  />
                  <label htmlFor="changePassword" className="text-xs font-semibold text-slate-600 cursor-pointer">
                    Change Password / Login Credentials
                  </label>
                </div>

                {changePassword && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      required={changePassword}
                      placeholder="Enter new password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-700 outline-none focus:border-sky-500 focus:bg-white transition-all"
                      disabled={isLoading}
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 font-bold text-xs px-4 py-2.5 transition-colors cursor-pointer"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2.5 shadow hover:shadow-sky-100 transition-all flex items-center gap-2 cursor-pointer"
                  disabled={isLoading}
                >
                  {isLoading && (
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
