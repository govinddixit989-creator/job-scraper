export type JobStatus = "new" | "saved" | "applied" | "skipped"

export type WorkType = "remote" | "contract" | "fulltime" | "any"

export type Seniority = "fresher" | "junior" | "mid" | "senior" | "lead"

export type JobSource =
  | "remoteok"
  | "weworkremotely"
  | "remotive"
  | "arbeitnow"
  | "himalayas"
  | "jobicy"
  | "linkedin"
  | "indeed"
  | "naukri"
  | "glassdoor"

export interface Job {
  id: string
  title: string
  company: string
  location: string
  type: string
  salary?: string
  tags: string[]
  url: string
  postedAt: string
  source: JobSource
  status: JobStatus
}

export interface UserPreferences {
  roles: string[]
  skills: string[]
  workTypes: WorkType[]
  experienceYears: number
  seniority: Seniority
  salaryExpectation?: string   // e.g. "$3000/mo" or "₹15 LPA"
  resumeText?: string
  resumeName?: string
}

export interface ApiKeys {
  groq: string
  apify: string
}
