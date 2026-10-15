import { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import {
  installPlatform,
  hasInstallPrompt,
  promptInstall,
  markInstallOffered,
  neverShowInstall,
} from '../lib/install.js'

// Post-sign-in sheet: the app is installable (PWA) on desktop, iOS and Android,
// so one sheet after login says so. Chromium browsers get a working Install
// button (beforeinstallprompt); everywhere else the sheet shows the manual
// steps, reusing the same strings as Settings → About.
function InstallSheet({ userId, close }) {
  const [busy, setBusy] = useState(false)
  const platform = installPlatform()
  const canPrompt = hasInstallPrompt()
  const manualLine =
    platform === 'ios'
      ? t('In Safari: Share → Add to Home Screen')
      : platform === 'android'
        ? t('In Chrome: ⋮ menu → Add to Home screen')
        : null
  const hintLine = canPrompt
    ? t('Tap Install below — it takes a second.')
    : (manualLine || t('Open your browser menu and choose Install to add it.'))

  const install = async () => {
    if (busy) return
    setBusy(true)
    try {
      await promptInstall()
    } catch { /* a failed prompt is still an answer: just close */ }
    markInstallOffered(userId)
    close()
  }
  const snooze = () => {
    markInstallOffered(userId)
    close()
  }
  const never = () => {
    neverShowInstall(userId)
    close()
  }

  return (
    <div style={{ textAlign: 'center', padding: '4px 0' }}>
      <div style={{ fontSize: 44, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}>
        <Icon name="download" />
      </div>
      <h3 style={{ margin: '10px 0 8px' }}>{t('Install openGym as an app')}</h3>
      <div className="muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        {t('Full screen, its own icon, and your workouts available offline.')}
      </div>
      <div className="card small" style={{ textAlign: 'start', marginBottom: 16, lineHeight: 1.5 }}>
        {hintLine}
      </div>
      {canPrompt
        ? <Button variant="primary" onClick={install}>{t('Install')}</Button>
        : <Button variant="primary" onClick={snooze}>{t('Got it')}</Button>}
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" onClick={snooze}>{t('Not now')}</Button>
      <div style={{ height: 4 }} />
      <Button variant="ghost" className="dim small" onClick={never}>{t('Don’t show this again')}</Button>
    </div>
  )
}

// Opens the sheet once per sign-in (App.jsx guards with shouldOfferInstall).
export function openInstallPrompt(userId) {
  useUI.getState().openSheet(close => <InstallSheet userId={userId} close={close} />, { kind: 'center' })
}
