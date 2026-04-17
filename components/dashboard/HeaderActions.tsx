"use client";

import React from "react";
import { useHeaderActions } from "@/lib/contexts/HeaderActionsContext";

interface HeaderActionsProps {
  children: React.ReactNode;
}

export function HeaderActions({ children }: HeaderActionsProps) {
  useHeaderActions(children);
  return null;
}
