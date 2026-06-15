"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Project {
  id: string;
  name: string;
}

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const { data, error: fetchError } = await supabase
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true });

    if (fetchError) {
      setError('Failed to fetch projects');
    } else {
      setProjects(data || []);
    }
  }

  async function handleAddOrUpdate() {
    if (!projectName.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      if (editingId) {
        // Update
        const { error: updateError } = await supabase
          .from('projects')
          .update({ name: projectName })
          .eq('id', editingId);
        if (updateError) throw updateError;
      } else {
        // Add
        const { error: insertError } = await supabase
          .from('projects')
          .insert([{ name: projectName }]);
        if (insertError) throw insertError;
      }

      setProjectName('');
      setEditingId(null);
      await fetchProjects();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error saving project';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this project? This will also affect time logs associated with it.')) return;
    setIsLoading(true);
    
    try {
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      await fetchProjects();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error deleting project';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function startEdit(project: Project) {
    setProjectName(project.name);
    setEditingId(project.id);
  }

  function cancelEdit() {
    setProjectName('');
    setEditingId(null);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 mt-12 border-t border-gray-200">
      <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <span>⚙️</span> Manage Projects
      </h2>

      {/* Input Field */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          placeholder="New Project Name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-sky-600 focus:border-sky-600 outline-none transition-all"
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddOrUpdate}
            disabled={isLoading || !projectName.trim()}
            className="flex-1 sm:flex-none bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-6 rounded-lg transition-all disabled:bg-gray-400 shadow-sm active:scale-[0.98]"
          >
            {editingId ? 'Update' : 'Add Project'}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 px-6 rounded-lg transition-all active:scale-[0.98]"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {/* Projects List */}
      <div className="grid gap-3">
        {projects.map((project) => (
          <div key={project.id} className="flex items-center justify-between bg-white border border-gray-100 p-4 rounded-xl shadow-sm hover:border-sky-100 transition-colors">
            <span className="font-medium text-gray-800">{project.name}</span>
            <div className="flex gap-2">
              <button
                onClick={() => startEdit(project)}
                className="text-sky-600 hover:bg-sky-50 px-3 py-1.5 rounded-md text-sm font-semibold transition-all"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(project.id)}
                className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-md text-sm font-semibold transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="text-gray-500 text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            No projects found. Add your first project above!
          </p>
        )}
      </div>
    </div>
  );
}
