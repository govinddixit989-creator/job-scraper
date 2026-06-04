import { Job, JobStatus, UserPreferences } from "./types"

const STATUS_KEY = "job_statuses"
const CACHE_KEY = "jobs_cache"
const CACHE_TTL = 1000 * 60 * 30 // 30 minutes

interface CacheEntry {
  jobs: Job[]
  fetchedAt: number
}

export function getStatuses(): Record<string, JobStatus> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}")
  } catch {
    return {}
  }
}

export function setStatus(jobId: string, status: JobStatus) {
  const statuses = getStatuses()
  statuses[jobId] = status
  localStorage.setItem(STATUS_KEY, JSON.stringify(statuses))
}

export function getCachedJobs(): Job[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.fetchedAt > CACHE_TTL) return null
    return entry.jobs
  } catch {
    return null
  }
}

export function setCachedJobs(jobs: Job[]) {
  const entry: CacheEntry = { jobs, fetchedAt: Date.now() }
  localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY)
}

const PREFS_KEY = "user_preferences"

export function getPreferences(): UserPreferences | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePreferences(prefs: UserPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function clearPreferences() {
  localStorage.removeItem(PREFS_KEY)
}
