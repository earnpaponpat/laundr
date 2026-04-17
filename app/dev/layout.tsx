import React from 'react';

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_ENABLE_SIMULATOR !== 'true') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        Simulator is currently disabled.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
