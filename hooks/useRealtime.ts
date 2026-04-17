import { useEffect, useRef } from 'react';
import { useRealtime as useRealtimeContext, RealtimeStatus } from '@/lib/contexts/RealtimeContext';
import { ScanEvent } from '@/types';

export type { RealtimeStatus };

export function useScanEvents(
  _orgId: string, // Kept for API compatibility, but we use Context's orgId
  onEvent: (event: ScanEvent & { source_method?: 'db' | 'broadcast' }) => void,
  onStatusChange?: (status: RealtimeStatus) => void
) {
  const { status, lastEvent } = useRealtimeContext();
  const onEventRef = useRef(onEvent);
  const onStatusRef = useRef(onStatusChange);
  const lastProcessedIdRef = useRef<string | null>(null);

  // Keep refs up to date
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onStatusRef.current = onStatusChange; }, [onStatusChange]);

  // Notify status changes
  useEffect(() => {
    onStatusRef.current?.(status);
  }, [status]);

  // Process incoming events from Context
  useEffect(() => {
    if (!lastEvent) return;
    
    // Prevent double-processing of the exact same event instance
    // (Context handles de-duplication from DB/Broadcast, but multiple components 
    // might re-render. We ensure only NEW events are passed to the callback).
    if (lastEvent.id !== lastProcessedIdRef.current) {
      lastProcessedIdRef.current = lastEvent.id;
      onEventRef.current(lastEvent);
    }
  }, [lastEvent]);
}
