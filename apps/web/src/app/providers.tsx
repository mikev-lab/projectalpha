"use client";

import { BusinessProvider } from "@/contexts/BusinessContext";
import { CartProvider } from "@/contexts/CartContext";
import { ProjectProvider } from "@/contexts/ProjectContext";

export function Providers({ children }) {
  return (
    <BusinessProvider>
      <ProjectProvider>
        <CartProvider>{children}</CartProvider>
      </ProjectProvider>
    </BusinessProvider>
  );
}
