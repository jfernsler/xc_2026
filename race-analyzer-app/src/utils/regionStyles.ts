/** Tailwind text color class by region */
export function regionTextClass(region: string): string {
  switch (region) {
    case "North": return "text-blue-400";
    case "Central": return "text-amber-400";
    case "South": return "text-green-400";
    default: return "text-gray-500";
  }
}

/** Tailwind bar/bg color class by region */
export function regionBarClass(region: string): string {
  switch (region) {
    case "North": return "bg-blue-500";
    case "Central": return "bg-amber-500";
    case "South": return "bg-green-500";
    default: return "bg-gray-500";
  }
}
