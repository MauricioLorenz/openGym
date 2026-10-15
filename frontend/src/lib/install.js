// Install prompt (PWA) helpers for the "install the app" sheet shown after sign-in.
//
// Browsers with an install flow (Chromium desktop/Android) fire `beforeinstallprompt`;
// capturing it lets the sheet show a real Install button instead of only instructions.
// iOS Safari and Firefox never fire it, so the sheet falls back to per-platform steps.
// The native Capacitor shell (MOBILE) is already an app: every helper here is a no-op there.
import { MOBILE } from './mobile.js'

const NEVER_KEY = userId => `gym_install_never_v1:${userId}`
const offeredThisSession = new Set()
let deferredPrompt = null
let listening = false

// Running as an installed app (home-screen web app): no install offer then.
export function isStandalone() {
  try {
    return !!(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true
    )
  } catch {
    return false
  }
}

// 'ios' | 'android' | 'desktop'. iPadOS Safari reports Macintosh, so a Mac with
// touch points counts as iOS (the instructions are the same Share-sheet ones).
export function installPlatform(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  try {
    const ua = nav?.userAgent || ''
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
    if (/Android/i.test(ua)) return 'android'
    if (/Macintosh/i.test(ua) && (nav?.maxTouchPoints || 0) > 1) return 'ios'
    return 'desktop'
  } catch {
    return 'desktop'
  }
}

// Captures the install prompt for later use. Safe to call more than once; idle
// outside the web build (the native shell and tests without a window).
export function initInstallPrompt() {
  if (MOBILE || listening || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  listening = true
  window.addEventListener('beforeinstallprompt', e => {
    try { e.preventDefault() } catch { /* older browsers without preventDefault on it */ }
    deferredPrompt = e
  })
  // Installed from the browser while the app was open: never offer again.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('gym_install_never_v1:')) window.localStorage.setItem(k, '1')
      }
    } catch { /* private mode: the session set still covers this visit */ }
  })
}

export function hasInstallPrompt() {
  return !!deferredPrompt
}

// Shows the captured prompt. Resolves 'accepted' | 'dismissed' | 'unavailable'.
// The event can only be used once, so it is cleared either way.
export async function promptInstall() {
  const e = deferredPrompt
  deferredPrompt = null
  if (!e || typeof e.prompt !== 'function') return 'unavailable'
  try {
    await e.prompt()
    const outcome = await e.userChoice
    return outcome?.outcome === 'accepted' ? 'accepted' : 'dismissed'
  } catch {
    return 'dismissed'
  }
}

function neverAsked(userId) {
  try {
    return window.localStorage?.getItem(NEVER_KEY(userId)) === '1'
  } catch {
    return false
  }
}

// Whether the post-sign-in sheet should open for this user on this device.
export function shouldOfferInstall(userId) {
  if (MOBILE || !userId) return false
  try {
    if (isStandalone()) return false
  } catch {
    return false
  }
  if (offeredThisSession.has(userId) || neverAsked(userId)) return false
  return true
}

// Session snooze: "Not now" (or any close) shows it again at most next visit.
export function markInstallOffered(userId) {
  if (userId) offeredThisSession.add(userId)
}

// Permanent opt-out for this user on this device ("Don't show this again").
export function neverShowInstall(userId) {
  markInstallOffered(userId)
  try {
    window.localStorage?.setItem(NEVER_KEY(userId), '1')
  } catch { /* private mode: the session snooze still holds */ }
}
