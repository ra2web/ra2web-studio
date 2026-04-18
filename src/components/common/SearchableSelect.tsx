import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export type SearchableSelectOption = {
  value: string
  label: string
  searchText?: string
}

interface SearchableSelectProps {
  value: string
  options: SearchableSelectOption[]
  onChange: (value: string) => void
  closeOnSelect?: boolean
  pinnedValues?: string[]
  /** 自定义最外层 div 的 className，默认 'relative'。需要让 trigger 的 `h-full` 生效时，可传 'relative h-full'。 */
  rootClassName?: string
  triggerClassName?: string
  triggerTitle?: string
  triggerAriaLabel?: string
  renderTriggerContent?: (selected: SearchableSelectOption | null, open: boolean) => React.ReactNode
  hideChevron?: boolean
  menuClassName?: string
  searchPlaceholder?: string
  noResultsText?: string
  footerHint?: string
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  onChange,
  closeOnSelect = true,
  pinnedValues = [],
  rootClassName,
  triggerClassName,
  triggerTitle,
  triggerAriaLabel,
  renderTriggerContent,
  hideChevron = false,
  menuClassName,
  searchPlaceholder = '搜索...',
  noResultsText = '无匹配项',
  footerHint = 'Esc 关闭，可搜索',
}) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; minWidth: number }>({
    top: 0,
    left: 0,
    minWidth: 280,
  })

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? options[0] ?? null,
    [options, value],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const pinnedOptions = useMemo(() => {
    if (pinnedValues.length === 0) return []
    const optionByValue = new Map(options.map((opt) => [opt.value, opt]))
    const result: SearchableSelectOption[] = []
    for (const pinned of pinnedValues) {
      const option = optionByValue.get(pinned)
      if (option) result.push(option)
    }
    return result
  }, [options, pinnedValues])

  const pinnedValueSet = useMemo(() => new Set(pinnedOptions.map((opt) => opt.value)), [pinnedOptions])
  const normalOptions = useMemo(
    () => options.filter((opt) => !pinnedValueSet.has(opt.value)),
    [options, pinnedValueSet],
  )

  const filteredNormalOptions = useMemo(() => {
    if (!normalizedQuery) return normalOptions
    return normalOptions.filter((opt) => {
      const haystack = `${opt.label} ${opt.value} ${opt.searchText ?? ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalOptions, normalizedQuery])

  const showPinnedDivider = !normalizedQuery && pinnedOptions.length > 0 && normalOptions.length > 0

  useEffect(() => {
    if (!open) return
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      if (!rootRef.current) return
      if (!rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onDocumentKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onDocumentKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const updateMenuPosition = () => {
      const trigger = rootRef.current
      if (!trigger || typeof window === 'undefined') return
      const rect = trigger.getBoundingClientRect()
      const estimatedWidth = Math.max(rect.width, 320)
      const padding = 12
      const maxLeft = Math.max(padding, window.innerWidth - estimatedWidth - padding)
      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(Math.max(rect.left, padding), maxLeft),
        minWidth: rect.width,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const rafId = requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => cancelAnimationFrame(rafId)
  }, [open])

  useEffect(() => {
    if (!open) return
    const rafId = requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = scrollTopRef.current
      }
    })
    return () => cancelAnimationFrame(rafId)
  }, [open, filteredNormalOptions.length])

  const handleSelect = (nextValue: string) => {
    if (listRef.current) {
      scrollTopRef.current = listRef.current.scrollTop
    }
    onChange(nextValue)
    if (closeOnSelect) {
      setOpen(false)
    } else {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }

  return (
    <div ref={rootRef} className={rootClassName ?? 'relative'}>
      <button
        type="button"
        title={triggerTitle}
        aria-label={triggerAriaLabel}
        className={
          triggerClassName
          || 'min-w-[180px] max-w-[280px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-left flex items-center gap-2'
        }
        onClick={() => {
          setOpen((prev) => !prev)
          if (!open) setQuery('')
        }}
      >
        {renderTriggerContent ? (
          renderTriggerContent(selectedOption, open)
        ) : (
          <span className="truncate flex-1">{selectedOption?.label ?? ''}</span>
        )}
        {!hideChevron && <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            minWidth: menuPosition.minWidth,
          }}
          className={
            menuClassName
            || 'z-50 w-[280px] max-w-[70vw] rounded border border-gray-700 bg-gray-800 shadow-xl'
          }
        >
          <div className="p-2 border-b border-gray-700">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 outline-none focus:border-blue-500"
            />
          </div>
          {pinnedOptions.length > 0 && (
            <div className={showPinnedDivider ? 'border-b border-gray-700' : ''}>
              {pinnedOptions.map((opt) => {
                const active = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700 hover:text-white'
                    }`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div
            ref={listRef}
            className="max-h-56 overflow-y-auto"
            onScroll={(e) => {
              scrollTopRef.current = e.currentTarget.scrollTop
            }}
          >
            {filteredNormalOptions.length > 0 ? (
              filteredNormalOptions.map((opt) => {
                const active = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      active ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-700 hover:text-white'
                    }`}
                    onClick={() => handleSelect(opt.value)}
                  >
                    <span className="block truncate">{opt.label}</span>
                  </button>
                )
              })
            ) : (
              <div className="px-3 py-2 text-xs text-gray-400">{noResultsText}</div>
            )}
          </div>
          {footerHint && (
            <div className="px-2 py-1 text-[10px] text-gray-500 border-t border-gray-700">
              {footerHint}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

export default SearchableSelect
