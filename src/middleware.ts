import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/login') || req.nextUrl.pathname.startsWith('/signup')
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')

  if (isApiAuth) return NextResponse.next()
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/inbox', req.url))
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
