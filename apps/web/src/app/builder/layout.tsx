"use client";

import { ProjectProvider } from "@/contexts/ProjectContext";

export default function BuilderLayout({ children }) {
  return <ProjectProvider>{children}</ProjectProvider>;
}
