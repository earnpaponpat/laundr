"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface HeaderActionsContextType {
  actions: React.ReactNode | null;
  setActions: (actions: React.ReactNode | null) => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextType | undefined>(undefined);

export function HeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = useState<React.ReactNode | null>(null);

  return (
    <HeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function useHeaderActions(actions: React.ReactNode | null) {
  const context = useContext(HeaderActionsContext);
  if (!context) {
    throw new Error("useHeaderActions must be used within a HeaderActionsProvider");
  }

  useEffect(() => {
    context.setActions(actions);
    // Cleanup actions when component unmounts
    return () => context.setActions(null);
  }, [actions, context]);
}

export function HeaderActionsSlot() {
  const context = useContext(HeaderActionsContext);
  if (!context) return null;
  return <>{context.actions}</>;
}
