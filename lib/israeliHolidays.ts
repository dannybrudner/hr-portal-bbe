// Fetch Israeli holidays from Hebcal REST API
// https://www.hebcal.com/api/holidays/
// Called client-side (browser can reach it, server cannot)

const CACHE: Record<string, Record<string, string>> = {}

export async function fetchHolidaysForMonth(year: number, month: number): Promise<Record<string, string>> {
  const key = `${year}-${month}`
  if (CACHE[key]) return CACHE[key]

  try {
    // Hebcal API: maj=major, min=minor, mod=modern Israeli, nx=Rosh Chodesh off
    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=off&year=${year}&month=${month}&c=off&M=on&s=on`
    const res = await fetch(url)
    if (!res.ok) throw new Error('API error')
    const data = await res.json()

    const map: Record<string, string> = {}
    for (const item of data.items || []) {
      if (item.date && item.title) {
        // item.date is "2026-05-01" format
        const dateStr = item.date.split('T')[0]
        // Prefer Hebrew title if available
        const title = item.hebrew || item.title
        map[dateStr] = title
      }
    }
    CACHE[key] = map
    return map
  } catch {
    // Fallback to empty map on error - calendar still works, just no holiday labels
    CACHE[key] = {}
    return {}
  }
}

// Sync getter for already-cached data (for calendar render)
export function getHoliday(dateStr: string, cache: Record<string, string>): string | undefined {
  return cache[dateStr]
}
