/** Tailwind text color class by region (muted in dark mode) */
export function regionTextClass(region: string): string {
  switch (region) {
    case "North": return "text-blue-400 dark:text-blue-300/90";
    case "Central": return "text-amber-400 dark:text-amber-300/90";
    case "South": return "text-green-400 dark:text-green-300/90";
    default: return "text-gray-500 dark:text-slate-400";
  }
}

/** Tailwind bar/bg color class by region (darker in dark mode to avoid glare) */
export function regionBarClass(region: string): string {
  switch (region) {
    case "North": return "bg-blue-500 dark:bg-blue-600/80";
    case "Central": return "bg-amber-500 dark:bg-amber-600/80";
    case "South": return "bg-green-500 dark:bg-green-600/80";
    default: return "bg-gray-500 dark:bg-slate-500";
  }
}
