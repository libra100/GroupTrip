import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMemberTripDayColor(days?: number, isSelected?: boolean) {
  if (!days || days < 3) {
    return isSelected ? "bg-rose-500 text-white border-rose-600 shadow-rose-200/50" : "bg-rose-50 text-rose-500 border-rose-100";
  }
  if (days >= 8) {
    return isSelected ? "bg-indigo-500 text-white border-indigo-600 shadow-indigo-200/50" : "bg-indigo-50 text-indigo-500 border-indigo-100";
  }
  if (days >= 5) {
    return isSelected ? "bg-emerald-500 text-white border-emerald-600 shadow-emerald-200/50" : "bg-emerald-50 text-emerald-500 border-emerald-100";
  }
  if (days >= 3) {
    return isSelected ? "bg-amber-500 text-white border-amber-600 shadow-amber-200/50" : "bg-amber-50 text-amber-500 border-amber-100";
  }
  return isSelected ? "bg-stone-500 text-white border-stone-600" : "bg-stone-50 text-stone-500 border-stone-100";
}
