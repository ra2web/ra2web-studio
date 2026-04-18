import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocale } from '../../i18n/LocaleContext'

export interface AppDialogAlertOptions {
  title?: string
  message: string
  confirmText?: string
}

export interface AppDialogConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
}

export interface AppDialogPromptOptions {
  title?: string
  /** 可选的辅助说明，显示在标题下方、输入框上方。 */
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  /**
   * 同步校验回调。返回非空字符串会阻止提交并以红色文本显示在按钮上方。
   * 返回 null/undefined/空字符串 表示通过。
   */
  validate?: (value: string) => string | null | undefined
}

type AlertRequest = {
  id: number
  kind: 'alert'
  variant: 'info' | 'danger'
  title: string
  message: string
  confirmText: string
  cancelText: string
  resolve: (value: boolean | string | null) => void
}

type ConfirmRequest = {
  id: number
  kind: 'confirm'
  variant: 'info' | 'danger'
  title: string
  message: string
  confirmText: string
  cancelText: string
  resolve: (value: boolean | string | null) => void
}

type PromptRequest = {
  id: number
  kind: 'prompt'
  variant: 'info'
  title: string
  message: string
  confirmText: string
  cancelText: string
  placeholder: string
  defaultValue: string
  validate?: (value: string) => string | null | undefined
  resolve: (value: boolean | string | null) => void
}

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest

type EnqueueAlert = Omit<AlertRequest, 'id' | 'resolve'>
type EnqueueConfirm = Omit<ConfirmRequest, 'id' | 'resolve'>
type EnqueuePrompt = Omit<PromptRequest, 'id' | 'resolve'>
// 注意：直接用 Omit<DialogRequest, 'id'|'resolve'> 会丢掉每个分支独有的字段
// （TS 对联合类型 Omit 不分配），所以这里显式列出三种 EnqueueXxx 的并集。
type EnqueueRequest = EnqueueAlert | EnqueueConfirm | EnqueuePrompt

export interface AppDialogApi {
  info: (options: AppDialogAlertOptions | string) => Promise<void>
  alert: (options: AppDialogAlertOptions | string) => Promise<void>
  confirm: (options: AppDialogConfirmOptions | string) => Promise<boolean>
  confirmDanger: (options: AppDialogConfirmOptions | string) => Promise<boolean>
  /** 弹出输入框；用户取消返回 null，提交则返回 trim 后的字符串。 */
  prompt: (options: AppDialogPromptOptions | string) => Promise<string | null>
}

const AppDialogContext = createContext<AppDialogApi | null>(null)

function toAlertOptions(input: AppDialogAlertOptions | string): AppDialogAlertOptions {
  return typeof input === 'string' ? { message: input } : input
}

function toConfirmOptions(input: AppDialogConfirmOptions | string): AppDialogConfirmOptions {
  return typeof input === 'string' ? { message: input } : input
}

function toPromptOptions(input: AppDialogPromptOptions | string): AppDialogPromptOptions {
  return typeof input === 'string' ? { message: input } : input
}

export const AppDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLocale()
  const idRef = useRef(1)
  const queueRef = useRef<DialogRequest[]>([])
  const [current, setCurrent] = useState<DialogRequest | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [promptError, setPromptError] = useState<string | null>(null)
  const promptInputRef = useRef<HTMLInputElement | null>(null)

  const flushNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null
    setCurrent(next)
  }, [])

  const enqueue = useCallback(
    <T extends boolean | string | null>(request: EnqueueRequest): Promise<T> => {
      return new Promise<T>((resolve) => {
        const item: DialogRequest = {
          ...(request as any),
          id: idRef.current++,
          resolve: resolve as DialogRequest['resolve'],
        }
        queueRef.current.push(item)
        setCurrent((prev) => prev ?? queueRef.current.shift() ?? null)
      })
    },
    [],
  )

  // 切换到一个新的 prompt request 时，重置输入框状态并 autofocus
  useEffect(() => {
    if (current?.kind === 'prompt') {
      setPromptValue(current.defaultValue)
      setPromptError(null)
      // 等下一帧 input 挂载后聚焦
      const handle = window.requestAnimationFrame(() => {
        promptInputRef.current?.focus()
        promptInputRef.current?.select()
      })
      return () => window.cancelAnimationFrame(handle)
    } else {
      setPromptValue('')
      setPromptError(null)
    }
  }, [current])

  const info = useCallback<AppDialogApi['info']>(
    async (input) => {
      const options = toAlertOptions(input)
      await enqueue<boolean>({
        kind: 'alert',
        variant: 'info',
        title: options.title ?? t('dialog.infoTitle'),
        message: options.message,
        confirmText: options.confirmText ?? t('common.ok'),
        cancelText: t('common.cancel'),
      } satisfies EnqueueAlert)
    },
    [enqueue, t],
  )

  const alert = useCallback<AppDialogApi['alert']>((input) => info(input), [info])

  const confirm = useCallback<AppDialogApi['confirm']>(
    (input) => {
      const options = toConfirmOptions(input)
      return enqueue<boolean>({
        kind: 'confirm',
        variant: 'info',
        title: options.title ?? t('dialog.confirmTitle'),
        message: options.message,
        confirmText: options.confirmText ?? t('common.ok'),
        cancelText: options.cancelText ?? t('common.cancel'),
      } satisfies EnqueueConfirm)
    },
    [enqueue, t],
  )

  const confirmDanger = useCallback<AppDialogApi['confirmDanger']>(
    (input) => {
      const options = toConfirmOptions(input)
      return enqueue<boolean>({
        kind: 'confirm',
        variant: 'danger',
        title: options.title ?? t('dialog.dangerTitle'),
        message: options.message,
        confirmText: options.confirmText ?? t('common.continue'),
        cancelText: options.cancelText ?? t('common.cancel'),
      } satisfies EnqueueConfirm)
    },
    [enqueue, t],
  )

  const prompt = useCallback<AppDialogApi['prompt']>(
    (input) => {
      const options = toPromptOptions(input)
      return enqueue<string | null>({
        kind: 'prompt',
        variant: 'info',
        title: options.title ?? t('dialog.promptTitle'),
        message: options.message ?? '',
        confirmText: options.confirmText ?? t('common.ok'),
        cancelText: options.cancelText ?? t('common.cancel'),
        placeholder: options.placeholder ?? '',
        defaultValue: options.defaultValue ?? '',
        validate: options.validate,
      } satisfies EnqueuePrompt)
    },
    [enqueue, t],
  )

  const onAccept = useCallback(() => {
    if (!current) return
    if (current.kind === 'prompt') {
      const trimmed = promptValue.trim()
      const validationError = current.validate?.(trimmed)
      if (validationError) {
        setPromptError(validationError)
        return
      }
      current.resolve(trimmed)
    } else {
      current.resolve(true)
    }
    flushNext()
  }, [current, flushNext, promptValue])

  const onCancel = useCallback(() => {
    if (!current) return
    if (current.kind === 'prompt') {
      current.resolve(null)
    } else {
      current.resolve(false)
    }
    flushNext()
  }, [current, flushNext])

  // 全局 Esc 关闭（覆盖所有 kind；Enter 仅由 prompt input 自己处理）
  useEffect(() => {
    if (!current) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // IME 组词期间的 Esc 通常是用来关闭候选词，不要把 dialog 也关掉。
      // keyCode 229 是浏览器在 IME 阶段保留的统一标识；isComposing 是更现代的属性。
      if (event.isComposing || event.keyCode === 229) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, onCancel])

  const handlePromptKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      // 中文等输入法在拼音转汉字时也会触发 Enter，这里要忽略，避免把"敲定候选词"
      // 误识别为"提交对话框"。React 在 nativeEvent 上暴露 isComposing；老浏览器
      // 还会用 keyCode === 229 表示同一状态。
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      event.preventDefault()
      onAccept()
    },
    [onAccept],
  )

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPromptValue(event.target.value)
      // 用户继续输入时清掉旧的错误，避免一直挂着
      if (promptError) setPromptError(null)
    },
    [promptError],
  )

  const contextValue = useMemo<AppDialogApi>(
    () => ({ info, alert, confirm, confirmDanger, prompt }),
    [info, alert, confirm, confirmDanger, prompt],
  )

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      {current && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded border border-gray-700 bg-gray-900 shadow-2xl">
            <div className="border-b border-gray-700 px-4 py-3">
              <h3
                className={`text-base font-semibold ${
                  current.variant === 'danger' ? 'text-red-300' : 'text-white'
                }`}
              >
                {current.title}
              </h3>
            </div>
            <div className="px-4 py-4 text-sm text-gray-200 whitespace-pre-wrap break-words">
              {current.message}
              {current.kind === 'prompt' && (
                <>
                  <input
                    ref={promptInputRef}
                    type="text"
                    value={promptValue}
                    onChange={handlePromptChange}
                    onKeyDown={handlePromptKeyDown}
                    placeholder={current.placeholder}
                    className="mt-3 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-400"
                  />
                  {promptError && (
                    <div className="mt-2 text-xs text-red-300">{promptError}</div>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-700 px-4 py-3">
              {(current.kind === 'confirm' || current.kind === 'prompt') && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-100 hover:bg-gray-600"
                >
                  {current.cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={onAccept}
                className={`rounded px-3 py-1.5 text-sm text-white ${
                  current.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {current.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  )
}

export function useAppDialog(): AppDialogApi {
  const context = useContext(AppDialogContext)
  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider')
  }
  return context
}
