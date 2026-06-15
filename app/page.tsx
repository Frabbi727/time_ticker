"use client";

import React, { useState } from "react";
import TimeLogForm from "@/components/TimeLogForm";
import ProjectManager from "@/components/ProjectManager";
import TimeLogList from "@/components/TimeLogList";

export default function Home() {
  const [editingLog, setEditingLog] = useState<unknown>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  return (
    <div className="min-h-screen bg-gray-50 py-12 space-y-12">
      <TimeLogForm 
        editingLog={editingLog} 
        onSuccess={() => {
          setEditingLog(null);
          triggerRefresh();
        }} 
        onCancel={() => setEditingLog(null)}
      />
      <TimeLogList 
        refreshTrigger={refreshTrigger} 
        onEdit={(log) => {
          setEditingLog(log);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }} 
      />
      <ProjectManager />
    </div>
  );
}
