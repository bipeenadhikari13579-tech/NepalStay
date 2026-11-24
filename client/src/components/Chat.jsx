import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Send, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { shrinkImage } from '../lib/shrinkImage.js'
import './chat.css'

const POLL_MS = 8000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const stamp = (d) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Conversation on one booking, between the traveler and the host.
 * Messages can carry text, a photo from the device, or both.
 * Checks for new messages every few seconds while it is on screen.
 */
export default function Chat({ bookingId, otherName, emptyHint }) {
  const [messages, setMessages] = useState(null)
  const [mySide, setMySide] = useState(null)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null) // { file, url } chosen but not sent yet
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const fileRef = useRef(null)
  const countRef = useRef(0)

  const load = useCallback(() => {
    api(`/messages/${bookingId}`)
      .then((d) => {
        setMessages(d.messages)
        setMySide(d.mySide)
      })
      .catch((err) => setError(err.message))
  }, [bookingId])

  useEffect(() => {
    load()
    const t = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [])

  // Keep the newest message in view when one arrives.
  useEffect(() => {
    if (!messages || messages.length === countRef.current) return
    countRef.current = messages.length
    scrollToEnd()
  }, [messages, scrollToEnd])

  // Free the preview when the photo is sent, replaced or removed.
  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo])

  function choosePhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // so the same file can be chosen again
    if (!file) return
    if (!IMAGE_TYPES.includes(file.type)) return setError('Only JPG, PNG, GIF or WebP photos can be sent.')
    if (file.size > MAX_IMAGE_BYTES) return setError('That photo is too large. The limit is 5 MB.')
    setError('')
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if ((!body && !photo) || busy) return
    setBusy(true)
    setError('')
    try {
      let payload = { text: body }
      if (photo) {
        payload = new FormData()
        payload.append('text', body)
        payload.append('image', await shrinkImage(photo.file))
      }
      const d = await api(`/messages/${bookingId}`, { method: 'POST', body: payload })
      setMessages((m) => [...(m ?? []), d.message])
      setText('')
      setPhoto(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      <div className="chat__list" ref={listRef} aria-live="polite">
        {messages === null && !error && <p className="chat__empty">Loading messages…</p>}
        {messages?.length === 0 && <p className="chat__empty">{emptyHint ?? 'No messages yet. Say namaste.'}</p>}
        {messages?.map((m) => {
          const src = m.image?.file && `/api/messages/${bookingId}/images/${m.image.file}`
          return (
            <div key={m._id} className={`chat__msg ${m.side === mySide ? 'is-mine' : ''}`}>
              {src && (
                <a href={src} target="_blank" rel="noreferrer" className="chat__photo" title="Open full size">
                  <img src={src} alt={`Photo from ${m.side === mySide ? 'you' : m.senderName || otherName}`} onLoad={scrollToEnd} />
                </a>
              )}
              {m.text && <p>{m.text}</p>}
              <small>
                {m.side === mySide ? 'You' : m.senderName || otherName} · {stamp(m.createdAt)}
              </small>
            </div>
          )
        })}
      </div>

      {error && <p className="chat__error">{error}</p>}

      {photo && (
        <div className="chat__preview">
          <img src={photo.url} alt="Photo ready to send" />
          <span>
            {photo.file.name}
            <small>Ready to send</small>
          </span>
          <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" title="Remove photo">
            <X size={16} />
          </button>
        </div>
      )}

      <form className="chat__form" onSubmit={send}>
        <input
          ref={fileRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          onChange={choosePhoto}
          hidden
        />
        <button
          type="button"
          className="chat__attach"
          onClick={() => fileRef.current?.click()}
          aria-label="Add a photo"
          title="Add a photo"
        >
          <ImagePlus size={19} />
        </button>
        <textarea
          rows={2}
          maxLength={2000}
          placeholder={photo ? 'Add a caption (optional)…' : `Message ${otherName}…`}
          aria-label={`Message ${otherName}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e)
          }}
        />
        <button type="submit" className="chat__send" disabled={busy || (!text.trim() && !photo)} aria-label="Send message">
          <Send size={17} />
        </button>
      </form>
    </div>
  )
}
