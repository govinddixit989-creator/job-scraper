export type JobStatus = "new" | "saved" | "applied" | "skipped"

export type WorkType = "remote" | "contract" | "fulltime" | "any"

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

export type WorkType2 = WorkType

export interface UserPreferences {
  roles: string[]
  skills: string[]
  workTypes: WorkType[]
  resumeText?: string
  resumeName?: string
}

export interface ApiKeys {
  groq: string
  apify: string
}
