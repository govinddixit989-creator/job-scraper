import type { Browser } from "playwright-core"
import type { Job } from "@/lib/types"

export async function scrapeIndeed(browser: Browser, roles: string[]): Promise<Job[]> {
  const query = encodeURIComponent(roles.slice(0, 2).join(" "))
  const url = `https://in.indeed.com/jobs?q=${query}&l=Remote&sort=date&fromage=15`

  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" })
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForSelector("[data-jk], .job_seen_beacon", { timeout: 15000 }).catch(() => {})

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll("[data-jk], .job_seen_beacon")
      return Array.from(cards).slice(0, 20).map(card => {
        const titleEl   = card.querySelector(".jobTitle span[title], .jobTitle span, a[data-jk] span")
        const compEl    = card.querySelector("[data-testid='company-name'], .companyName")
        const locEl     = card.querySelector("[data-testid='text-location'], .companyLocation")
        const linkEl    = card.querySelector("a[data-jk], a.jcs-JobTitle")
        const salaryEl  = card.querySelector(".salary-snippet, [data-testid='attribute_snippet_testid']")
        const jk        = card.getAttribute("data-jk") ?? (linkEl as HTMLAnchorElement)?.href?.match(/jk=([^&]+)/)?.[1]
        return {
          title:    titleEl?.textContent?.trim()  ?? "",
          company:  compEl?.textContent?.trim()   ?? "",
          location: locEl?.textContent?.trim()    ?? "Remote",
          url:      jk ? `https://in.indeed.com/viewjob?jk=${jk}` : (linkEl as HTMLAnchorElement)?.href ?? "",
          salary:   salaryEl?.textContent?.trim() ?? "",
        }
      })
    })

    return jobs
      .filter(j => j.title && j.url)
      .map((j, idx) => ({
        id:       `ind-pw-${Date.now()}-${idx}`,
        title:    j.title,
        company:  j.company,
        location: j.location,
        type:     "remote",
        salary:   j.salary || undefined,
        tags:     [],
        url:      j.url,
        postedAt: new Date().toISOString(),
        source:   "indeed" as const,
        status:   "new" as const,
      }))
  } finally {
    await page.close()
  }
}
