"use client";

import { useState } from "react";
import { useProject } from "@/contexts/ProjectContext";

export default function ImpositionAdmin() {
  const { project, loadProject } = useProject();
  const [projectId, setProjectId] = useState("");

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Admin Imposition Tool</h1>
      <div className="flex items-center space-x-4 mb-8">
        <input
          type="text"
          placeholder="Project ID"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
        <button onClick={() => loadProject(projectId)}>Load Project</button>
      </div>
      {project && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            {/* Imposition controls will go here */}
          </div>
          <div className="lg:col-span-2">
            <h2 className="text-xl font-bold mb-4">{project.name}</h2>
            <div className="grid grid-cols-4 gap-4">
              {project.pages.map((page) => (
                <div key={page.id} className="aspect-[8.5/11] bg-white shadow-lg flex items-center justify-center">
                  <span className="text-gray-500">{page.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
