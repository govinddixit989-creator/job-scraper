import { NextResponse } from "next/server"
import { XMLParser } from "fast-xml-parser"
import { Job } from "@/lib/types"

// ─── RemoteOK ─────────────────────────────────────────────────────────────────
async function fetchRemoteOK(): Promise<Job[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "Mozilla/5.0 personal-job-tracker" },
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data as Record<string, unknown>[])
    .filter((item) => item.slug)
    .slice(0, 60)
    .map((job) => ({
      id: `rok-${job.id ?? job.slug}`,
      title: String(job.position ?? ""),
      company: String(job.company ?? ""),
      location: String(job.location || "Worldwide"),
      type: "remote",
      salary: job.salary_min ? `$${job.salary_min}–$${job.salary_max ?? "?"}` : undefined,
      tags: Array.isArray(job.tags) ? (job.tags as string[]).slice(0, 6) : [],
      url: String(job.url ?? `https://remoteok.com/jobs/${job.id}`),
      postedAt: String(job.date ?? ""),
      source: "remoteok" as const,
      status: "new" as const,
    }))
}

// ─── WeWorkRemotely ───────────────────────────────────────────────────────────
async function fetchWeWorkRemotely(): Promise<Job[]> {
  const feeds = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    "https://weworkremotely.com/categories/remote-product-jobs.rss",
  ]
  const parser = new XMLParser({ ignoreAttributes: false })
  const results: Job[] = []
  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, { next: { revalidate: 1800 } })
      if (!res.ok) continue
      const items: Record<string, unknown>[] = parser.parse(await res.text())?.rss?.channel?.item ?? []
      items.slice(0, 30).forEach((item, idx) => {
        const title = String(item.title ?? "")
        const [company, ...rest] = title.split(": ")
        results.push({
          id: `wwr-${feedUrl.split("/").at(-1)}-${idx}`,
          title: rest.join(": ") || title,
          company: company ?? "",
          location: String(item.region ?? item["dc:region"] ?? "Worldwide"),
          type: "remote",
          salary: undefined,
          tags: [],
          url: String(item.link ?? item.guid ?? ""),
          postedAt: String(item.pubDate ?? ""),
          source: "weworkremotely" as const,
          status: "new" as const,
        })
      })
    } catch { /* skip */ }
  }
  return results
}

// ─── Remotive ─────────────────────────────────────────────────────────────────
async function fetchRemotive(): Promise<Job[]> {
  const res = await fetch("https://remotive.com/api/remote-jobs?limit=60", {
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return ((data.jobs ?? []) as Record<string, unknown>[]).map((job) => ({
    id: `rem-${job.id}`,
    title: String(job.title ?? ""),
    company: String(job.company_name ?? ""),
    location: String(job.candidate_required_location || "Worldwide"),
    type: String(job.job_type ?? "remote").toLowerCase(),
    salary: String(job.salary || "") || undefined,
    tags: Array.isArray(job.tags) ? (job.tags as string[]).slice(0, 6) : [],
    url: String(job.url ?? ""),
    postedAt: String(job.publication_date ?? ""),
    source: "remotive" as const,
    status: "new" as const,
  }))
}

// ─── Arbeitnow (remote-friendly, India-open) ──────────────────────────────────
async function fetchArbeitnow(): Promise<Job[]> {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return ((data.data ?? []) as Record<string, unknown>[])
    .filter((job) => job.remote === true)
    .slice(0, 40)
    .map((job, idx) => ({
      id: `arb-${job.slug ?? idx}`,
      title: String(job.title ?? ""),
      company: String(job.company_name ?? ""),
      location: String(job.location ?? "Remote"),
      type: "remote",
      salary: undefined,
      tags: Array.isArray(job.tags) ? (job.tags as string[]).slice(0, 6) : [],
      url: String(job.url ?? ""),
      postedAt: job.created_at ? new Date((job.created_at as number) * 1000).toISOString() : "",
      source: "arbeitnow" as const,
      status: "new" as const,
    }))
}

// ─── Himalayas (remote-first, global hiring) ─────────────────────────────────
async function fetchHimalayas(): Promise<Job[]> {
  const res = await fetch("https://himalayas.app/jobs/api?limit=60", {
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return ((data.jobs ?? []) as Record<string, unknown>[]).map((job, idx) => {
    const minS = job.minSalary as number | undefined
    const maxS = job.maxSalary as number | undefined
    const curr = String(job.currency ?? "USD")
    return {
      id: `him-${job.guid ?? idx}`,
      title: String(job.title ?? ""),
      company: String(job.companyName ?? ""),
      location: String(
        Array.isArray(job.locationRestrictions) && (job.locationRestrictions as string[]).length
          ? (job.locationRestrictions as string[]).join(", ")
          : "Worldwide"
      ),
      type: String(job.employmentType ?? "remote").toLowerCase(),
      salary: minS ? `${curr} ${minS}–${maxS ?? "?"}` : undefined,
      tags: Array.isArray(job.categories) ? (job.categories as string[]).slice(0, 6) : [],
      url: String(job.applicationLink ?? job.guid ?? ""),
      postedAt: String(job.pubDate ?? ""),
      source: "himalayas" as const,
      status: "new" as const,
    }
  })
}

// ─── Jobicy (remote only) ─────────────────────────────────────────────────────
async function fetchJobicy(): Promise<Job[]> {
  const res = await fetch("https://jobicy.com/api/v2/remote-jobs?count=50", {
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const data = await res.json()
  return ((data.jobs ?? []) as Record<string, unknown>[]).map((job) => {
    const minS = job.salaryMin as number | undefined
    const maxS = job.salaryMax as number | undefined
    return {
      id: `jcy-${job.id}`,
      title: String(job.jobTitle ?? ""),
      company: String(job.companyName ?? ""),
      location: String(job.jobGeo || "Worldwide"),
      type: String(job.jobType ?? "remote").toLowerCase(),
      salary: minS ? `${job.salaryCurrency ?? "$"}${minS}–${maxS ?? "?"}` : undefined,
      tags: Array.isArray(job.jobIndustry) ? (job.jobIndustry as string[]).slice(0, 4) : [],
      url: String(job.url ?? ""),
      postedAt: String(job.pubDate ?? ""),
      source: "jobicy" as const,
      status: "new" as const,
    }
  })
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET() {
  const results = await Promise.allSettled([
    fetchRemoteOK(),
    fetchWeWorkRemotely(),
    fetchRemotive(),
    fetchArbeitnow(),
    fetchHimalayas(),
    fetchJobicy(),
  ])

  const jobs: Job[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []))

  return NextResponse.json({ jobs, fetchedAt: new Date().toISOString() })
}
