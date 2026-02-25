interface SplitsTabProps {
  eventId: number | null;
  raceName: string;
}

/** Placeholder for splits analysis. Split times and segment analysis coming soon. */
export function SplitsTab({ eventId, raceName }: SplitsTabProps) {
  if (eventId == null) {
    return (
      <div className="py-8 text-center text-slate-500 dark:text-slate-400">
        Select a single race to view splits.
      </div>
    );
  }
  return (
    <div className="py-8 text-center text-slate-500 dark:text-slate-400">
      <p className="font-medium text-slate-700 dark:text-slate-300">{raceName}</p>
      <p className="mt-2">Splits and timing-point analysis coming soon.</p>
    </div>
  );
}
