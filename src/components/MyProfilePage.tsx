import { useEffect, useState } from 'react'
import { Download, Keyboard, Pencil, Check, ArrowRight } from 'lucide-react'
import type { ProfileSlot } from '../protocol/hero68/types'

type Props = {
  slot: ProfileSlot
  names: Record<ProfileSlot, string>
  connected: boolean
  loaded: boolean
  busy: boolean
  pending: number
  rapidKeys: number
  remappedKeys: number
  onSelect: (slot: ProfileSlot) => void
  onRename: (name: string) => Promise<boolean>
  onExport: () => void
  onRemap: () => void
  onRefresh: () => void
}
export default function MyProfilePage({ slot, names, connected, loaded, busy, pending, rapidKeys, remappedKeys, onSelect, onRename, onExport, onRemap, onRefresh }: Props) {
  const [name, setName] = useState(names[slot])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setName(names[slot]); setEditing(false); setError('') }, [slot, names])
  async function rename() {
    if (!name.trim()) { setError('Enter a profile name.'); return }
    if (new TextEncoder().encode(name.trim()).length > 55) { setError('Use a name of at most 55 UTF-8 bytes.'); return }
    setError('')
    if (await onRename(name.trim())) setEditing(false)
  }
  return (
    <div className="page my-profile-page page-enter">
      <div className="profile-page-heading"><div><h1>My Profile</h1><p>Your keyboard settings, together in one profile.</p></div><button className="secondary-button" disabled={busy} onClick={onExport}><Download size={16} />Export profile</button></div>
      <article className="profile-detail settings-card">
        <div className={`profile-detail-icon profile-accent-${slot}`}><Keyboard size={32} /></div>
        <div className="profile-detail-copy"><span className="profile-eyebrow">Onboard profile {slot}</span><h2>{names[slot]}</h2><p>{connected && loaded ? 'Loaded from your HERO68' : connected ? 'Read this profile before saving changes.' : 'Local preview · connect your HERO68 to sync.'}</p></div>
        <span className={`profile-status ${loaded && connected ? 'is-ready' : ''}`}>{busy ? 'Syncing…' : pending ? `${pending} pending change${pending === 1 ? '' : 's'}` : connected && loaded ? 'Synced' : 'Local preview'}</span>
        <div className="profile-name-field"><label htmlFor="onboard-profile-name">Profile name</label><div className="profile-name-input"><input id="onboard-profile-name" value={name} readOnly={!editing} disabled={busy} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && editing) void rename(); if (event.key === 'Escape') { setName(names[slot]); setEditing(false); setError('') } }} /><button className="secondary-button" disabled={!connected || !loaded || busy} onClick={() => editing ? void rename() : setEditing(true)}>{editing ? <Check size={15} /> : <Pencil size={15} />}{editing ? 'Save name' : 'Rename'}</button>{editing && <button className="ghost-button" onClick={() => { setName(names[slot]); setEditing(false); setError('') }}>Cancel</button>}</div>{error && <p className="profile-field-error" role="alert">{error}</p>}</div>
        <div className="profile-summary"><div><strong>68</strong><span>Keys</span></div><div><strong>{rapidKeys}</strong><span>Rapid Trigger enabled</span></div><div><strong>{remappedKeys}</strong><span>Remapped functions</span></div><div><strong>3</strong><span>Keyboard layers</span></div></div>
        <div className="profile-detail-actions"><button className="secondary-button" disabled={busy} onClick={onRemap}>Edit key mappings<ArrowRight size={15} /></button><button className="ghost-button" disabled={!connected || busy} onClick={onRefresh}>Refresh from keyboard</button></div>
      </article>
      <div className="profile-section-heading"><h2>Onboard Profiles</h2><span>3 slots on your HERO68</span></div>
      <section className="onboard-profile-grid" aria-label="Onboard profiles">
        {([0, 1, 2] as const).map(id => <button key={id} disabled={busy} className={`onboard-profile-card ${id === slot ? 'is-active' : ''}`} onClick={() => onSelect(id)} aria-pressed={id === slot}><span className={`onboard-profile-icon profile-accent-${id}`}><Keyboard size={23} /></span><span className="onboard-profile-copy"><small>Onboard profile {id}</small><strong>{names[id]}</strong></span><span className="onboard-profile-action">{id === slot ? <><Check size={14} />Current</> : <ArrowRight size={17} />}</span></button>)}
      </section>
    </div>
  )
}
