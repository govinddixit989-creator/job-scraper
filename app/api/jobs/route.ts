import { NextResponse } from "next/server"
import { XMLParser } from "fast-xml-parser"
import { Job } from "@/lib/types"

// ─── RemoteOK ────────────────────────────────────────────────────────────────
async function fetchRemoteOK(): Promise<Job[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "Mozilla/5.0 personal job tracker" },
    next: { revalidate: 1800 },
  })
  if (!res.ok) return []
  const data = await res.json()

  return (data as Record<string, unknown>[])
    .filter((item) => item.slug)
    .slice(0, 50)
    .map((job) => ({
      id: `rok-${job.id ?? job.slug}`,
      title: String(job.position ?? ""),
      company: String(job.company ?? ""),
      location: String(job.location || "Worldwide"),
      type: "remote",
      salary:
        job.salary_min && job.salary_max
          ? `$${job.salary_min}–$${job.salary_max}`
          : job.salary_min
          ? `$${job.salary_min}+`
          : undefined,
      tags: Array.isArray(job.tags) ? (job.tags as string[]).slice(0, 5) : [],
      url: String(job.url ?? `https://remoteok.com/jobs/${job.id}`),
      postedAt: String(job.date ?? ""),
      source: "remoteok" as const,
      status: "new" as const,
    }))
}

// ─── WeWorkRemotely (RSS) ─────────────────────────────────────────────────────
async function fetchWeWorkRemotely(): Promise<Job[]> {
  const feeds = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
  ]

  const parser = new XMLParser({ ignoreAttributes: false })
  const results: Job[] = []

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, { next: { revalidate: 1800 } })
      if (!res.ok) continue
      const xml = await res.text()
      const parsed = parser.parse(xml)
      const items: Record<string, unknown>[] = parsed?.rss?.channel?.item ?? []

      items.slice(0, 25).forEach((item, idx) => {
        const title = String(item.title ?? "")
        // title format: "Company: Job Title"
        const [company, ...rest] = title.split(": ")
        const jobTitle = rest.join(": ") || title

        results.push({
          id: `wwr-${feedUrl.includes("devops") ? "d" : "p"}-${idx}`,
          title: jobTitle,
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
    } catch {
      // skip failed feed
    }
  }

  return results
}

// ─── Remotive ─────────────────────────────────────────────────────────────────
async function fetchRemotive(): Promise<Job[]> {
  const res = await fetch("https://remotive.com/api/remote-jobs?limit=50", {
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
    tags: Array.isArray(job.tags) ? (job.tags as string[]).slice(0, 5) : [],
    url: String(job.url ?? ""),
    postedAt: String(job.publication_date ?? ""),
    source: "remotive" as const,
    status: "new" as const,
  }))
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function GET() {
  const [remoteok, wwr, remotive] = await Promise.allSettled([
    fetchRemoteOK(),
    fetchWeWorkRemotely(),
    fetchRemotive(),
  ])

  const jobs: Job[] = [
    ...(remoteok.status === "fulfilled" ? remoteok.value : []),
    ...(wwr.status === "fulfilled" ? wwr.value : []),
    ...(remotive.status === "fulfilled" ? remotive.value : []),
  ]

  return NextResponse.json({ jobs, fetchedAt: new Date().toISOString() })
}
