"use client"

import { useEffect, useState } from "react"
import { UserPreferences, ApiKeys } from "@/lib/types"
import {
  getPreferences, savePreferences, clearPreferences,
  getApiKeys, saveApiKeys, clearApiKeys,
} from "@/lib/storage"
import KeySetup  from "@/components/KeySetup"
import Onboarding from "@/components/Onboarding"
import JobTracker from "@/components/JobTracker"
import Settings   from "@/components/Settings"
import { Briefcase, Settings as SettingsIcon, LogOut } from "lucide-react"

type AppState = "loading" | "keys" | "onboarding" | "tracker" | "settings"

export default function Home() {
  const [state, setState] = useState<AppState>("loading")
  const [keys,  setKeys]  = useState<ApiKeys | null>(null)
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)

  useEffect(() => {
    const k = getApiKeys()
    const p = getPreferences()
    setKeys(k)
    setPrefs(p)
    if (!k)      setState("keys")
    else if (!p) setState("onboarding")
    else         setState("tracker")
  }, [])

  const handleKeys = (k: ApiKeys) => {
    saveApiKeys(k)
    setKeys(k)
    setState(prefs ? "tracker" : "onboarding")
  }

  const handleOnboarding = (p: UserPreferences) => {
    savePreferences(p)
    setPrefs(p)
    setState("tracker")
  }

  const handleEditPrefs = () => {
    clearPreferences()
    setPrefs(null)
    setState("onboarding")
  }

  const handleSaveKeys = (k: ApiKeys) => {
    saveApiKeys(k)
    setKeys(k)
  }

  const handleSavePrefs = (p: UserPreferences) => {
    savePreferences(p)
    setPrefs(p)
  }

  const handleLogout = () => {
    clearApiKeys()
    clearPreferences()
    setKeys(null)
    setPrefs(null)
    setState("keys")
  }

  if (state === "loading")   return null
  if (state === "keys")      return <KeySetup onComplete={handleKeys} />
  if (state === "onboarding" && keys)
    return <Onboarding onComplete={handleOnboarding} apiKeys={keys} />

  if (state === "settings" && keys && prefs)
    return (
      <Settings
        apiKeys={keys}
        preferences={prefs}
        onSaveKeys={handleSaveKeys}
        onSavePrefs={handleSavePrefs}
        onBack={() => setState("tracker")}
      />
    )

  if (state === "tracker" && keys && prefs) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Briefcase size={18} className="text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-semibold leading-none">Job Tracker</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                RemoteOK · WeWorkRemotely · Remotive · LinkedIn
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setState("settings")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Settings"
              >
                <SettingsIcon size={15} /> Settings
              </button>
              <span className="text-border">|</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Clear keys and log out"
              >
                <LogOut size={13} /> Log out
              </button>
            </div>
          </div>

          <JobTracker
            preferences={prefs}
            apiKeys={keys}
            onEditPrefs={handleEditPrefs}
          />
        </div>
      </main>
    )
  }

  return null
}
