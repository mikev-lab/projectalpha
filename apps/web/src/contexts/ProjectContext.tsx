"use client";

import { createContext, useContext, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(null);
  const { user } = useAuth();

  const loadProject = async (projectId) => {
    const docRef = doc(db, "projects", projectId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      setProject({ id: docSnap.id, ...docSnap.data() });
    }
  };

  const saveProject = async () => {
    if (!project) return;
    const docRef = doc(db, "projects", project.id);
    await updateDoc(docRef, {
      ...project,
      updatedAt: new Date(),
    });
  };

  const updatePage = (pageId, newContent) => {
    setProject((prev) => ({
      ...prev,
      pages: prev.pages.map((p) =>
        p.id === pageId ? { ...p, ...newContent } : p
      ),
    }));
  };

  const value = {
    project,
    loadProject,
    saveProject,
    updatePage,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return useContext(ProjectContext);
}
