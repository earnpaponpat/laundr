"use client";

import { useState } from "react";
import { RouteCard } from "./RouteCard";
import { RouteDetailSheet } from "./RouteDetailSheet";
import { useRouter } from "next/navigation";

interface RouteDetailSheetWrapperProps {
  route: any;
}

export function RouteDetailSheetWrapper({ route }: RouteDetailSheetWrapperProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <RouteCard route={route} onViewDetails={() => setOpen(true)} />
      <RouteDetailSheet 
        route={route} 
        open={open} 
        onOpenChange={setOpen} 
        onRefresh={() => {
            router.refresh();
        }} 
      />
    </>
  );
}
