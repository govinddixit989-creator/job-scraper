"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Job, JobStatus, UserPreferences } from "@/lib/types"
import { getStatuses, setStatus, getCachedJobs, setCachedJobs, clearCache } from "@/lib/storage"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ExternalLink,
  RefreshCw,
  Bookmark,
  CheckCircle2,
  XCircle,
  Sparkles,
  Search,
  SlidersHorizontal,
} from "lucide-react"

const STATUS_CONFIG: Record<
  JobStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  new: {
    label: "New",
    icon: <Sparkles size={13} />,
    className: "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20",
  },
  saved: {
    label: "Saved",
    icon: <Bookmark size={13} />,
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20",
  },
  applied: {
    label: "Applied",
    icon: <CheckCircle2 size={13} />,
    className: "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20",
  },
  skipped: {
    label: "Skip",
    icon: <XCircle size={13} />,
    className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 hover:bg-zinc-500/20",
  },
}

const STATUS_CYCLE: JobStatus[] = ["new", "saved", "applied", "skipped"]

const SOURCE_LABELS: Record<string, string> = {
  remoteok: "RemoteOK",
  weworkremotely: "WWR",
  remotive: "Remotive",
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "—"
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

interface Props {
  preferences: UserPreferences
  onEditPrefs: () => void
}

export default function JobTracker({ preferences, onEditPrefs }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [statuses, setStatuses] = useState<Record<string, JobStatus>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<JobStatus | "all">("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [fetchedAt, setFetchedAt] = useState<string>("")

  const loadJobs = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedJobs()
      if (cached) {
        setJobs(cached)
        setStatuses(getStatuses())
        setLoading(false)
        return
      }
    }
    try {
      const res = await fetch("/api/jobs")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setCachedJobs(data.jobs)
      setFetchedAt(data.fetchedAt)
      setJobs(data.jobs)
      setStatuses(getStatuses())
    } catch (e) {
      setError("Could not load jobs. Check your connection.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
    setStatuses(getStatuses())
  }, [loadJobs])

  const handleRefresh = () => {
    setRefreshing(true)
    clearCache()
    loadJobs(true)
  }

  const cycleStatus = (jobId: string) => {
    const current = statuses[jobId] ?? "new"
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
    setStatus(jobId, next)
    setStatuses((prev) => ({ ...prev, [jobId]: next }))
  }

  const filtered = useMemo(() => {
    const userSkills = preferences.skills.map((s) => s.toLowerCase())
    const userRoles = preferences.roles.map((r) => r.toLowerCase())
    const wantAny = preferences.workTypes.includes("any")

    return jobs
      .filter((job) => {
        const jobStatus = statuses[job.id] ?? "new"
        if (tab !== "all" && jobStatus !== tab) return false
        if (sourceFilter !== "all" && job.source !== sourceFilter) return false

        // Work type filter
        if (!wantAny) {
          const wantsRemote = preferences.workTypes.includes("remote")
          const wantsContract = preferences.workTypes.includes("contract")
          const wantsFulltime = preferences.workTypes.includes("fulltime")
          const jt = job.type.toLowerCase()
          const matches =
            (wantsRemote && jt.includes("remote")) ||
            (wantsContract && (jt.includes("contract") || jt.includes("freelance"))) ||
            (wantsFulltime && (jt.includes("full") || jt.includes("permanent")))
          if (!matches) return false
        }

        // Search bar
        if (search) {
          const q = search.toLowerCase()
          return (
            job.title.toLowerCase().includes(q) ||
            job.company.toLowerCase().includes(q) ||
            job.tags.some((t) => t.toLowerCase().includes(q))
          )
        }
        return true
      })
      .sort((a, b) => {
        // Rank by skill/role relevance
        const score = (job: Job) => {
          let s = 0
          const text = `${job.title} ${job.tags.join(" ")}`.toLowerCase()
          userSkills.forEach((sk) => { if (text.includes(sk)) s += 2 })
          userRoles.forEach((r) => { if (text.includes(r)) s += 3 })
          return s
        }
        return score(b) - score(a)
      })
  }, [jobs, statuses, tab, sourceFilter, search, preferences])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length, new: 0, saved: 0, applied: 0, skipped: 0 }
    jobs.forEach((job) => {
      const s = statuses[job.id] ?? "new"
      c[s] = (c[s] ?? 0) + 1
    })
    return c
  }, [jobs, statuses])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <RefreshCw size={18} className="animate-spin" />
        <span>Fetching jobs from 3 sources…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">{error}</p>
        <button onClick={handleRefresh} className="text-sm underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Preferences summary bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Showing jobs for:</span>
        {preferences.roles.map((r) => (
          <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
        ))}
        {preferences.workTypes.map((wt) => (
          <Badge key={wt} variant="outline" className="text-xs capitalize">{wt}</Badge>
        ))}
        <button
          onClick={onEditPrefs}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
        >
          <SlidersHorizontal size={12} /> Edit preferences
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, company, tech…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? "all")}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="remoteok">RemoteOK</SelectItem>
            <SelectItem value="weworkremotely">WeWorkRemotely</SelectItem>
            <SelectItem value="remotive">Remotive</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>

        {fetchedAt && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Updated {new Date(fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-9">
          {(["all", "new", "saved", "applied", "skipped"] as const).map((t) => (
            <TabsTrigger key={t} value={t} className="gap-1.5 capitalize">
              {t === "all" ? "All" : STATUS_CONFIG[t].label}
              <span className="text-xs tabular-nums opacity-60">{counts[t] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[260px]">Role</TableHead>
              <TableHead className="w-[160px]">Company</TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead className="hidden sm:table-cell w-[90px]">Location</TableHead>
              <TableHead className="hidden lg:table-cell w-[80px]">Salary</TableHead>
              <TableHead className="hidden sm:table-cell w-[70px]">Source</TableHead>
              <TableHead className="w-[80px]">Posted</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[44px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  No jobs found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((job) => {
                const jobStatus = statuses[job.id] ?? "new"
                const cfg = STATUS_CONFIG[jobStatus]
                const isSkipped = jobStatus === "skipped"

                return (
                  <TableRow
                    key={job.id}
                    className={isSkipped ? "opacity-40" : undefined}
                  >
                    <TableCell className="font-medium max-w-[260px]">
                      <span className="line-clamp-2 leading-snug">{job.title}</span>
                    </TableCell>

                    <TableCell className="text-muted-foreground max-w-[160px]">
                      <span className="truncate block">{job.company}</span>
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {job.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[11px] py-0 px-1.5 font-normal">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      <span className="truncate block max-w-[90px]">{job.location}</span>
                    </TableCell>

                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {job.salary ?? "—"}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-normal">
                        {SOURCE_LABELS[job.source] ?? job.source}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(job.postedAt)}
                    </TableCell>

                    <TableCell>
                      <button
                        onClick={() => cycleStatus(job.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${cfg.className}`}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </button>
                    </TableCell>

                    <TableCell>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Open job listing"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} of {jobs.length} jobs · Click status badge to cycle New → Saved → Applied → Skip
      </p>
    </div>
  )
}
