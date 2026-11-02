'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pill } from 'lucide-react'
import Image from 'next/image'
const inputClass = 'h-10 w-full rounded-lg border border-[#e0e8e4] bg-white px-3 text-sm text-[#26352f] outline-none transition placeholder:text-[#a2ada8] focus:border-[#58a98c] focus:ring-2 focus:ring-[#e1f2eb]'
const buttonClass = 'inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#157a62] px-4 text-sm font-semibold text-white transition hover:bg-[#116c56] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4bab8a] disabled:cursor-not-allowed disabled:opacity-50'

type LoginPageProps = { initialMode?: 'sign-in' | 'setup' }

export function LoginPage({ initialMode = 'sign-in' }: LoginPageProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'sign-in' | 'setup'>(initialMode)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [verificationToken, setVerificationToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const isSetup = mode === 'setup'
      const response = await fetch(isSetup ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSetup
          ? { email: identifier, password, ...(verificationToken.trim() ? { verificationToken: verificationToken.trim() } : {}) }
          : { identifier, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Authentication failed')
      router.replace('/dashboard')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f5f8f6] px-4 py-10">
    <div className="w-full max-w-[420px]">
      <div className="mx-auto mb-7 flex w-fit items-center gap-2.5">
        {/* <span className="flex size-10 items-center justify-center rounded-xl bg-[#157a62] text-white"><Pill size={18} /></span> */}
        <Image
                     src="/logo.jpg"
                     alt="Med Easy Logo"
                     width={40}
                     height={40}
                     className="size-10 rounded-xl object-contain"
                     priority
                   />
        <span className="text-lg font-bold tracking-tight text-[#20322a]">med easy</span>
      </div>
      <section className="rounded-2xl border border-[#e6ece8] bg-white p-6 shadow-[0_8px_35px_rgba(27,58,43,.06)] sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#218066]">{mode === 'setup' ? 'Workspace setup' : 'Welcome back'}</p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-.04em] text-[#21332b]">{mode === 'setup' ? 'Set up your account' : 'Sign in to your workspace'}</h1>
        <p className="mt-1 text-xs leading-5 text-[#8b9791]">{mode === 'setup' ? 'The first active admin profile can set the workspace password. Staff need a one-time setup token from an administrator.' : 'Sign in with your workspace email or username and password.'}</p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#526159]">{mode === 'setup' ? 'Workspace email' : 'Email or username'}
            <input autoComplete="username" className={inputClass} value={identifier} onChange={(event) => setIdentifier(event.target.value)} required maxLength={254} placeholder={mode === 'setup' ? 'name@example.test' : 'name@example.test or username'} />
          </label>
          {mode === 'setup' && <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#526159]">One-time setup token <span className="font-normal text-[#929d98]">Only needed for invited staff accounts</span>
            <input className={inputClass} value={verificationToken} onChange={(event) => setVerificationToken(event.target.value)} autoComplete="one-time-code" maxLength={100} placeholder="Paste the token shared by an administrator" />
          </label>}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#526159]">Password
            <input autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'setup' ? 12 : 1} maxLength={128} placeholder={mode === 'setup' ? 'At least 12 characters' : 'Enter your password'} />
          </label>
          {error && <p role="alert" className="rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-3 py-2 text-xs text-[#ad514c]">{error}</p>}
          <button className={buttonClass} type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}</button>
        </form>
        <div className="mt-5 border-t border-[#edf1ef] pt-4 text-center text-xs text-[#87938e]">
          {mode === 'setup' ? 'Already have an account?' : 'First time in this workspace?'}{' '}
          <button type="button" onClick={() => { setError(''); setMode(mode === 'setup' ? 'sign-in' : 'setup') }} className="font-semibold text-[#18765e] hover:underline">
            {mode === 'setup' ? 'Sign in' : 'Set up account'}
          </button>
        </div>
      </section>
      <p className="mt-4 text-center text-[10px] leading-4 text-[#9aa5a1]">Local JSON-backed workspace · passwords are stored as salted hashes; session tokens are stored as hashes.</p>
    </div>
  </main>
}
