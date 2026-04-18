import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Archive,
  ArrowUp,
  Clipboard,
  Copy,
  Download,
  FolderOpen,
  FolderPlus,
  Image,
  Info,
  PanelLeft,
  Pencil,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Scissors,
  Trash2,
  Undo2,
  Upload,
  Boxes,
} from 'lucide-react'
import type { ContextMenuCommandId, ContextMenuEntry, ContextMenuIconName, ContextMenuTarget } from './contextMenuModel'
import { computeContextMenuPosition } from './contextMenuModel'

interface AppContextMenuProps {
  entries: ContextMenuEntry[]
  target: ContextMenuTarget | null
  open: boolean
  onClose: () => void
  onCommand: (id: ContextMenuCommandId) => void
}

const iconByName: Record<ContextMenuIconName, React.ComponentType<{ className?: string; size?: number }>> = {
  archive: Archive,
  copy: Copy,
  download: Download,
  folder: FolderOpen,
  'folder-plus': FolderPlus,
  image: Image,
  info: Info,
  paste: Clipboard,
  pencil: Pencil,
  redo: Redo2,
  'rotate-ccw': RotateCcw,
  save: Save,
  scissors: Scissors,
  trash: Trash2,
  undo: Undo2,
  upload: Upload,
  'arrow-up': ArrowUp,
  panel: PanelLeft,
  search: Search,
  box: Boxes,
}

const AppContextMenu: React.FC<AppContextMenuProps> = ({
  entries,
  target,
  open,
  onClose,
  onCommand,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !target || !menuRef.current) {
      setPosition(null)
      return
    }
    const rect = menuRef.current.getBoundingClientRect()
    setPosition(
      computeContextMenuPosition({
        anchorX: target.clientX,
        anchorY: target.clientY,
        menuWidth: rect.width,
        menuHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    )
  }, [entries, open, target])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    const close = () => onClose()
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [onClose, open])

  const visibleEntries = useMemo(
    () => entries.filter((entry, index) => !(entry.kind === 'separator' && index === entries.length - 1)),
    [entries],
  )

  useEffect(() => {
    if (!open || !menuRef.current) return
    menuRef.current.focus()
  }, [open])

  if (!open || !target || visibleEntries.length === 0 || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      data-testid="app-context-menu"
      className="fixed z-[120] min-w-[15rem] rounded-2xl border border-slate-700/90 bg-slate-950/95 p-2 text-sm text-slate-100 shadow-[0_28px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl outline-none"
      style={position ?? { left: target.clientX, top: target.clientY }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {visibleEntries.map((entry) => {
        if (entry.kind === 'separator') {
          return <div key={entry.id} className="my-1.5 h-px bg-slate-800" />
        }

        const Icon = iconByName[entry.icon]
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            data-context-menu-command={entry.id}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
              entry.disabled
                ? 'cursor-not-allowed text-slate-500'
                : entry.danger
                  ? 'text-red-200 hover:bg-red-500/12 hover:text-red-100'
                  : 'hover:bg-slate-800/90 hover:text-white'
            }`}
            disabled={entry.disabled}
            onClick={() => {
              if (entry.disabled) return
              onCommand(entry.id)
            }}
          >
            <Icon size={16} className={entry.danger ? 'text-red-300' : 'text-slate-400'} />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.hint && (
              <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {entry.hint}
              </span>
            )}
          </button>
        )
      })}
      <div className="mt-1 px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">
        Shift + Right Click
      </div>
    </div>,
    document.body,
  )
}

export default AppContextMenu
