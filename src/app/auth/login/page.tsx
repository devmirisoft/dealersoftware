"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  ChartColumn,
  Eye,
  EyeOff,
  FlaskConical,
  Handshake,
  Headphones,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react"
import type { StoredUser } from "@/lib/roleAccess"
import { setCurrentUser } from "@/lib/currentUser"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { cn } from "@/lib/utils"

const FEATURES = [
  { icon: FlaskConical, label: "Innovative Solutions" },
  { icon: ShieldCheck, label: "Trusted Quality" },
  { icon: Handshake, label: "Long-Term Partnership" },
  { icon: Headphones, label: "Dedicated Support" },
  { icon: Zap, label: "Reliable Performance" },
  { icon: ChartColumn, label: "Business Growth" },
]

const inputClass =
  "h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
const labelClass = "mb-2 block text-[15px] font-medium text-slate-900"
const fieldIconClass = "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"

export default function Login() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [otpRequired, setOtpRequired] = useState(false)
  const [notice, setNotice] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [otpLoading, setOtpLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Only the server opens the code panel, and only for a dealer or staff member whose password already checked out.
  const showOtp = otpRequired
  const otpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showOtp) otpInputRef.current?.focus()
  }, [showOtp])

  const completeLogin = (userData: StoredUser) => {
    const session = setCurrentUser(userData)
    if (session.status !== "authenticated") {
      setError("Invalid credentials")
      return
    }

    const clientRole = session.role

    setEmail("")
    setPassword("")
    setOtpCode("")
    setOtpRequired(false)
    setNotice("")

    if (clientRole === "staff") router.push("/dashboard/staff")
    else if (clientRole === "dealer") router.push("/home")
    else if (clientRole === "admin") router.push("/dashboard/admin")
    else if (clientRole === "accountant") router.push("/dashboard/accountant")
  }

  const resetOtp = () => {
    setOtpRequired(false)
    setOtpCode("")
    setNotice("")
    setError("")
  }

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")

    // Once the panel is open the same button verifies the code.
    if (showOtp) return handleVerifyOtp()

    if (!email || !password) {
      setError("Email or username and password are required")
      return
    }

    try {
      setLoading(true)

      const formData = new FormData()
      formData.append("email", email)
      formData.append("password", password)

      // A keep-alive connection the dev/prod server closes mid-POST surfaces as
      // "Failed to fetch" before the request is ever handled. One retry covers it.
      const post = () => fetch("/api/auth/login", {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      const res = await post().catch(post)
      const data = await res.json()
      const responseMessage = typeof data?.message === "string" ? data.message : "Invalid credentials"

      if (res.ok && data?.status) {
        // Dealers, staff and NSMs need a second factor; admins and accountants already hold a session here.
        if (data?.data?.otpRequired) {
          setOtpRequired(true)
          setOtpCode("")
          setNotice(responseMessage)
          return
        }
        completeLogin(data.data || { email })
      } else {
        setError(responseMessage)
      }
    } catch (err: unknown) {
      console.error("Login error:", err)

      setError("Server error")
    } finally {
      setLoading(false)
    }
  }

  const handleRequestOtp = async () => {
    setError("")
    if (!email) {
      setError("Email or username is required")
      return
    }

    try {
      setOtpLoading(true)
      const res = await fetch("/api/auth/email-otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Unable to send verification code")
      }
    } catch (err: unknown) {
      console.error("OTP request error:", err)
      setError("Server error")
    } finally {
      setOtpLoading(false)
    }
  }

  // The code arrives as an argument from onComplete, where `otpCode` state is still a render behind.
  const handleVerifyOtp = async (code: string = otpCode) => {
    setError("")
    if (!email || !code) {
      setError("Email or username and verification code are required")
      return
    }

    try {
      setOtpLoading(true)
      const res = await fetch("/api/auth/email-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      const failureMessage = typeof data?.message === "string" ? data.message : "Invalid verification code"
      if (res.ok && data?.status) {
        completeLogin(data.data || { email })
      } else {
        setError(failureMessage)
      }
    } catch (err: unknown) {
      console.error("OTP verify error:", err)
      setError("Server error")
    } finally {
      setOtpLoading(false)
    }
  }
  return (
    <main className="relative min-h-screen overflow-hidden bg-gray-100 text-slate-900">
      {/* Soft corner blobs */}
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-blue-100/60" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-32 h-[420px] w-[420px] rounded-full bg-blue-100/60" />

      <div className="relative flex min-h-screen items-center justify-center gap-12 px-4 py-10 sm:px-10 xl:gap-16">

        {/* ── Form card ──────────────────────────────────────────────── */}
        <form
          className="w-full max-w-[460px] shrink-0 rounded-3xl border border-slate-100 bg-white px-8 py-10 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:px-12"
          onSubmit={handleLogin}
        >
          {/* Header */}
          <svg viewBox="0 0 48 40" className="h-11 w-12 text-blue-600" fill="none" stroke="currentColor" strokeWidth="8" aria-hidden>
            <path d="M4 6h18a14 14 0 0 1 0 28H14" />
            <path d="M4 20h14" />
          </svg>
          <h1 className="mt-5 text-[32px] font-bold leading-tight tracking-tight text-slate-900">Welcome Back</h1>
          <p className="mt-2 text-[16px] text-slate-500">Sign in to access your dashboard</p>

          {/* Fields */}
          <div className="mt-9 space-y-6">
            <label className="block">
              <span className={labelClass}>Email or Username</span>
              <div className="relative">
                <Mail size={20} className={fieldIconClass} />
                <input
                  type="text"
                  placeholder="Enter your email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className={inputClass}
                />
              </div>
            </label>

            <label className="block">
              <span className={labelClass}>Password</span>
              <div className="relative">
                <Lock size={20} className={fieldIconClass} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={cn(inputClass, "pr-12")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((visible) => !visible)}
                  className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
          </div>

          {/* Dealer and staff second factor: slides open only after the password check passes. */}
          <div
            className={cn(
              "grid transition-all duration-300 ease-out",
              showOtp ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <span className={labelClass}>Verification Code</span>
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={setOtpCode}
                onComplete={handleVerifyOtp}
                disabled={!showOtp || otpLoading}
                containerClassName="w-full"
                ref={otpInputRef}
              >
                <InputOTPGroup className="w-full justify-between gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((slot) => (
                    <InputOTPSlot
                      key={slot}
                      index={slot}
                      className="h-12 w-auto max-w-12 flex-1 rounded-xl border border-slate-200 bg-white text-[16px] font-bold text-slate-900 first:rounded-xl first:border-l last:rounded-xl data-[active=true]:border-blue-500 data-[active=true]:ring-4 data-[active=true]:ring-blue-500/10"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>

              {notice && <p className="mt-2 text-[12px] text-slate-500">{notice}</p>}

              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={resetOtp}
                  className="text-[12px] font-semibold text-slate-500 hover:text-slate-800"
                >
                  Use Password
                </button>
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={otpLoading}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-600 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw size={12} />
                  Resend Code
                </button>
              </div>
            </div>
          </div>

          {/* Forgot password */}
          <div className="mt-4 flex justify-end">
            <button type="button" className="text-[14px] font-medium text-blue-600 hover:text-blue-500">
              Forgot Password?
            </button>
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-600">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || otpLoading}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-600 text-[17px] font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {showOtp ? (otpLoading ? "Verifying..." : "Verify & Login") : loading ? "Signing in..." : "Login"}
            {!loading && !otpLoading && <ArrowRight size={18} />}
          </button>

          <div className="mt-8 flex items-center gap-3 text-[13px] text-slate-500">
            <span className="h-px flex-1 bg-slate-200" />
            <ShieldCheck size={16} />
            Secure &amp; Encrypted
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </form>

        {/* ── Brand panel ────────────────────────────────────────────── */}
        <div aria-hidden className="hidden h-[440px] w-px bg-slate-200 lg:block" />

        <section className="hidden w-[560px] min-w-0 lg:block">
          <div className="h-1 w-20 rounded-full bg-blue-600" />
          <h2 className="mt-8 text-[clamp(2.25rem,3.4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-slate-900">
            Welcome to <br />
            <span className="text-blue-600">Dealer Management Software</span>
          </h2>
          <p className="mt-6 text-[19px] leading-relaxed text-slate-600">
            Your partner in Laboratory Glassware, Filtration Products and Laboratory Solutions.
          </p>

          <ul className="mt-10 grid grid-cols-3 gap-x-6 gap-y-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center text-center">
                <span className="grid h-[72px] w-[72px] place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon size={30} strokeWidth={1.8} />
                </span>
                <span className="mt-3 max-w-[110px] text-[15px] leading-snug text-slate-600">{label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
