"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

// --- Types ---
interface Project {
  id: string;
  name: string;
}

interface ProjectManagerProps {
  projectsList?: Project[];
  onProjectsChange?: () => void;
}

export default function ProjectManager({ projectsList, onProjectsChange }: ProjectManagerProps) {
  // 1. Local States
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projects = projectsList || localProjects;

  // 2. Fetch fallbacks if not provided
  useEffect(() => {
    if (!projectsList) {
      fetchProjects();
    }
  }, [projectsList]);

  async function fetchProjects() {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('id, name')
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;
      setLocalProjects(data || []);
    } catch (err: any) {
      console.error("Error fetching projects locally:", err);
      setError('Failed to fetch projects. Check your database connection.');
    } finally {
      setIsLoading(false);
    }
  }

  // 3. Actions
  async function handleAddOrUpdate() {
    if (!projectName.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      if (editingId) {
        // Update Project
        const { error: updateError } = await supabase
          .from('projects')
          .update({ name: projectName.trim() })
          .eq('id', editingId);
        
        if (updateError) throw updateError;
      } else {
        // Add Project
        const { error: insertError } = await supabase
          .from('projects')
          .insert([{ name: projectName.trim() }]);
        
        if (insertError) throw insertError;
      }

      setProjectName('');
      setEditingId(null);
      
      // Update local state if in fallback mode
      if (!projectsList) {
        await fetchProjects();
      }

      // Notify parent to sync
      if (onProjectsChange) onProjectsChange();
    } catch (err: unknown) {
      console.error("Error saving project:", err);
      const errorMessage = err instanceof Error ? err.message : 'Error saving project. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this project? This will also affect time logs associated with it.')) return;
    setIsLoading(true);
    setError(null);
    
    try {
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      
      // Update local state if in fallback mode
      if (!projectsList) {
        await fetchProjects();
      }

      // Notify parent
      if (onProjectsChange) onProjectsChange();
    } catch (err: unknown) {
      console.error("Error deleting project:", err);
      const errorMessage = err instanceof Error ? err.message : 'Error deleting project. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function startEdit(project: Project) {
    setProjectName(project.name);
    setEditingId(project.id);
    setError(null);
  }

  function cancelEdit() {
    setProjectName('');
    setEditingId(null);
    setError(null);
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 border-b border-slate-100 pb-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <span>⚙️</span> Manage Projects
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">Create, rename, or delete active client projects</p>
      </div>

      {/* Input Field Control */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="New Project Name..."
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition-all placeholder-slate-300"
          disabled={isLoading}
        />
        <div className="flex gap-2.5">
          <button
            onClick={handleAddOrUpdate}
            disabled={isLoading || !projectName.trim()}
            className="flex-1 sm:flex-none bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold py-2.5 px-5 rounded-xl transition-all disabled:bg-slate-300 shadow-sm active:scale-95 cursor-pointer"
          >
            {editingId ? 'Rename Project' : 'Add Project'}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-extrabold py-2.5 px-5 rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border-l-4 border-rose-500 p-3.5 text-xs text-rose-700 font-semibold mb-5">
          {error}
        </div>
      )}

      {/* Projects list grid */}
      <div className="grid gap-2.5 max-h-[400px] overflow-y-auto pr-1">
        {projects.map((project) => (
          <div 
            key={project.id} 
            className="flex items-center justify-between border border-slate-100 hover:border-slate-200 bg-slate-50/20 hover:bg-white p-4 rounded-xl shadow-sm transition-all duration-200 group"
          >
            <span className="font-semibold text-slate-700 text-sm">{project.name}</span>
            <div className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => startEdit(project)}
                className="text-sky-600 hover:bg-sky-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(project.id)}
                className="text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
            <p className="text-xs text-slate-400 font-semibold">No active projects found. Create your first one above!</p>
          </div>
        )}
      </div>
    </div>
  );
}
