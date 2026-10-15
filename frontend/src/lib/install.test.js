// @vitest-environment node

/* Post-sign-in install sheet helpers (lib/install.js): platform detection,
 * standalone detection, the captured beforeinstallprompt flow, and the
 * per-user offer / snooze / opt-out bookkeeping. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  vi.resetModules()
  return import('./install.js')
}

const memStorage = () => {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: k => { m.delete(k) },
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}

const fakeWindow = ({ standalone = false, fullscreen = false, iosStandalone = false } = {}) => {
  const listeners = {}
  return {
    listeners,
    navigator: { standalone: iosStandalone },
    localStorage: memStorage(),
    matchMedia: q => ({
      media: q,
      matches: q === '(display-mode: standalone)' ? standalone : q === '(display-mode: fullscreen)' ? fullscreen : false,
    }),
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn) },
    removeEventListener: () => {},
    fire: (ev, obj) => { for (const fn of listeners[ev] || []) fn(obj) },
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('installPlatform', () => {
  it('tells iOS, Android and desktop apart', async () => {
    const { installPlatform } = await load()
    expect(installPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe('ios')
    expect(installPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe('android')
    expect(installPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('desktop')
  })

  it('treats a touch-screen Mac (iPadOS Safari) as iOS', async () => {
    const { installPlatform } = await load()
    expect(installPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 5 })).toBe('ios')
    expect(installPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', maxTouchPoints: 0 })).toBe('desktop')
  })

  it('falls back to desktop without a navigator', async () => {
    const { installPlatform } = await load()
    expect(installPlatform(undefined)).toBe('desktop')
  })
})

describe('isStandalone', () => {
  it('is true in a standalone display mode or iOS home-screen app', async () => {
    vi.stubGlobal('window', fakeWindow({ standalone: true }))
    expect((await load()).isStandalone()).toBe(true)
    vi.stubGlobal('window', fakeWindow({ iosStandalone: true }))
    expect((await load()).isStandalone()).toBe(true)
  })

  it('is false in a plain browser tab', async () => {
    vi.stubGlobal('window', fakeWindow())
    expect((await load()).isStandalone()).toBe(false)
  })
})

describe('beforeinstallprompt capture', () => {
  it('holds no prompt until the browser fires the event', async () => {
    const win = fakeWindow()
    vi.stubGlobal('window', win)
    const m = await load()
    m.initInstallPrompt()
    expect(m.hasInstallPrompt()).toBe(false)
    let prevented = false
    win.fire('beforeinstallprompt', { preventDefault: () => { prevented = true }, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    expect(prevented).toBe(true)
    expect(m.hasInstallPrompt()).toBe(true)
  })

  it('promptInstall reports the user choice and clears the prompt', async () => {
    const win = fakeWindow()
    vi.stubGlobal('window', win)
    const m = await load()
    m.initInstallPrompt()
    win.fire('beforeinstallprompt', { preventDefault: () => {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    expect(await m.promptInstall()).toBe('dismissed')
    expect(m.hasInstallPrompt()).toBe(false)
    expect(await m.promptInstall()).toBe('unavailable')
  })
})

describe('shouldOfferInstall', () => {
  it('offers once per user, then snoozes for the session', async () => {
    vi.stubGlobal('window', fakeWindow())
    const m = await load()
    expect(m.shouldOfferInstall('u1')).toBe(true)
    m.markInstallOffered('u1')
    expect(m.shouldOfferInstall('u1')).toBe(false)
    expect(m.shouldOfferInstall('u2')).toBe(true)
  })

  it('never offers without a user, standalone, or after opt-out', async () => {
    vi.stubGlobal('window', fakeWindow({ standalone: true }))
    const m = await load()
    expect(m.shouldOfferInstall('u1')).toBe(false)
    expect(m.shouldOfferInstall(null)).toBe(false)
    vi.stubGlobal('window', fakeWindow())
    const m2 = await load()
    m2.neverShowInstall('u1')
    expect(m2.shouldOfferInstall('u1')).toBe(false)
  })
})
