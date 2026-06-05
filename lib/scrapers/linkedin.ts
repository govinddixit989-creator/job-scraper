import type { Browser } from "playwright-core"
import type { Job } from "@/lib/types"

export async function scrapeLinkedIn(browser: Browser, roles: string[]): Promise<Job[]> {
  const query = encodeURIComponent(roles.slice(0, 2).join(" "))
  // Public LinkedIn job search — no login needed
  const url = `https://www.linkedin.com/jobs/search/?keywords=${query}&location=India&f_WT=2&f_TPR=r${15 * 24 * 3600}&sortBy=DD`

  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
    })
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForSelector(".jobs-search__results-list li, .base-card", { timeout: 15000 }).catch(() => {})

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll(".jobs-search__results-list li, ul.jobs-search__results-list > li")
      return Array.from(cards).slice(0, 20).map(card => {
        const titleEl  = card.querySelector(".base-search-card__title, h3.base-search-card__title")
        const compEl   = card.querySelector(".base-search-card__subtitle, h4.base-search-card__subtitle")
        const locEl    = card.querySelector(".job-search-card__location, span.job-search-card__location")
        const linkEl   = card.querySelector("a.base-card__full-link, a[href*='linkedin.com/jobs']")
        const timeEl   = card.querySelector("time")
        return {
          title:    titleEl?.textContent?.trim()   ?? "",
          company:  compEl?.textContent?.trim()    ?? "",
          location: locEl?.textContent?.trim()     ?? "India",
          url:      (linkEl as HTMLAnchorElement)?.href ?? "",
          postedAt: timeEl?.getAttribute("datetime") ?? "",
        }
      })
    })

    return jobs
      .filter(j => j.title && j.url)
      .map((j, idx) => ({
        id:       `li-pw-${Date.now()}-${idx}`,
        title:    j.title,
        company:  j.company,
        location: j.location,
        type:     "remote",
        salary:   undefined,
        tags:     [],
        url:      j.url.split("?")[0], // strip tracking params
        postedAt: j.postedAt || new Date().toISOString(),
        source:   "linkedin" as const,
        status:   "new" as const,
      }))
  } finally {
    await page.close()
  }
}
