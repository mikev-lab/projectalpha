"use client";

import { ProjectProvider } from "@/contexts/ProjectContext";

export default function AdminLayout({ children }) {
  return <ProjectProvider>{children}</ProjectProvider>;
}
