import { cookies } from 'next/headers'
import { jsonAuth, SESSION_COOKIE_NAME } from './index'

export async function getCurrentServerUser() {
  const cookieStore = await cookies()
  const session = await jsonAuth.getSessionByToken(cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null)
  return session?.user.status === 'active' ? session.user : null
}
