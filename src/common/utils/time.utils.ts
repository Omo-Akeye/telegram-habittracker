/**
 * Validates that a time string is in HH:MM format and represents a valid time.
 * Hours must be 00-23, minutes must be 00-59.
 */
export function isValidTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return false;
  }

  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
