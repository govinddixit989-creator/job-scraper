export type JobStatus = "new" | "saved" | "applied" | "skipped"

export type WorkType = "remote" | "contract" | "fulltime" | "any"

export interface UserPreferences {
  roles: string[]          // e.g. ["React Developer", "Frontend Engineer"]
  skills: string[]         // e.g. ["React", "TypeScript", "Node.js"]
  workTypes: WorkType[]
  resumeText?: string      // raw extracted text from PDF
  resumeName?: string
}

export interface Job {
  id: string
  title: string
  company: string
  location: string
  type: string        // remote, hybrid, onsite
  salary?: string
  tags: string[]
  url: string
  postedAt: string
  source: "remoteok" | "weworkremotely" | "remotive"
  status: JobStatus
}
