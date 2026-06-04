"use client"

import { useEffect, useState } from "react"
import { UserPreferences } from "@/lib/types"
import { getPreferences, savePreferences, clearPreferences } from "@/lib/storage"
import Onboarding from "@/components/Onboarding"
import JobTracker from "@/components/JobTracker"
import { Briefcase } from "lucide-react"

export default function Home() {
  const [prefs, setPrefs] = useState<UserPreferences | null | "loading">("loading")

  useEffect(() => {
    setPrefs(getPreferences())
  }, [])

  const handleOnboardingComplete = (p: UserPreferences) => {
    savePreferences(p)
    setPrefs(p)
  }

  const handleEditPrefs = () => {
    clearPreferences()
    setPrefs(null)
  }

  if (prefs === "loading") return null

  if (!prefs) return <Onboarding onComplete={handleOnboardingComplete} />

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Briefcase size={18} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-none">Job Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              RemoteOK · WeWorkRemotely · Remotive — personalised for you
            </p>
          </div>
        </div>

        <JobTracker preferences={prefs} onEditPrefs={handleEditPrefs} />
      </div>
    </main>
  )
}
