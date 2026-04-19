import React from 'react'
import type {
  ButtonizeOptions,
  TextBarOptions,
  TransparentCornersOptions,
  VeteranBadgeOptions,
} from '../../services/cameo/postprocess'
import { isOsCameoFontFullyCoverable } from '../../services/cameo/osCameoFont'
import { useLocale } from '../../i18n/LocaleContext'

/**
 * Cameo 专属装饰控件集合：底部文字栏 / 立体感 / 老兵勋章 / RA2 透明角。
 * 仅在 ShpEditor 选 cameo preset 时挂出来；其他 preset (loadscreen / sprite-sheet / custom) 不挂。
 *
 * 所有设置项都是受控的：父组件持有 textBar/buttonize/veteran/transparentCorners 状态并下传 setter。
 */
export interface CameoOptionsFieldsetProps {
  textBar: TextBarOptions
  setTextBar: (next: TextBarOptions) => void
  buttonize: ButtonizeOptions
  setButtonize: (next: ButtonizeOptions) => void
  veteran: VeteranBadgeOptions
  setVeteran: (next: VeteranBadgeOptions) => void
  transparentCorners: TransparentCornersOptions
  setTransparentCorners: (next: TransparentCornersOptions) => void
}

const CameoOptionsFieldset: React.FC<CameoOptionsFieldsetProps> = ({
  textBar,
  setTextBar,
  buttonize,
  setButtonize,
  veteran,
  setVeteran,
  transparentCorners,
  setTransparentCorners,
}) => {
  const { t } = useLocale()

  return (
    <>
      {/* 文字条 */}
      <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
        <legend className="px-1 text-gray-300">{t('cameo.editor.textBarTitle')}</legend>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={textBar.enabled}
            onChange={(e) => setTextBar({ ...textBar, enabled: e.target.checked })}
          />
          <span>{t('cameo.editor.textBarEnable')}</span>
        </label>
        <div className={textBar.enabled ? 'space-y-1.5' : 'space-y-1.5 opacity-50 pointer-events-none'}>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={textBar.osStrict !== false}
              onChange={(e) => setTextBar({ ...textBar, osStrict: e.target.checked })}
            />
            <span>{t('cameo.editor.textBarOsStrict')}</span>
          </label>
          {textBar.osStrict !== false && (
            <div className="text-[10px] text-gray-500">{t('cameo.editor.textBarOsStrictHint')}</div>
          )}
          {(() => {
            const usingBitmapFont =
              textBar.osStrict !== false
              && isOsCameoFontFullyCoverable(textBar.text ?? '')
              && isOsCameoFontFullyCoverable(textBar.text2 ?? '')
            const hasFallbackChars =
              textBar.osStrict !== false
              && (!isOsCameoFontFullyCoverable(textBar.text ?? '')
                || !isOsCameoFontFullyCoverable(textBar.text2 ?? ''))
            return (
              <>
                <label className="block">
                  <span className="text-gray-400">{t('cameo.editor.textBarText')}</span>
                  <input
                    type="text"
                    value={textBar.text ?? ''}
                    maxLength={32}
                    placeholder="坦克 / TANK"
                    onChange={(e) => setTextBar({ ...textBar, text: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400"
                  />
                </label>
                <label className="block">
                  <span className="text-gray-400">{t('cameo.editor.textBarText2')}</span>
                  <input
                    type="text"
                    value={textBar.text2 ?? ''}
                    maxLength={32}
                    placeholder="V3"
                    disabled={!(textBar.text ?? '').trim()}
                    onChange={(e) => setTextBar({ ...textBar, text2: e.target.value })}
                    className="mt-1 w-full rounded border border-gray-600 bg-gray-950 px-2 py-1 text-gray-100 outline-none focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>
                {usingBitmapFont && (
                  <div className="text-[10px] text-emerald-300">
                    {t('cameo.editor.textBarBitmapFontActive')}
                  </div>
                )}
                {hasFallbackChars && (
                  <div className="text-[10px] text-amber-300">
                    {t('cameo.editor.textBarFallbackToSystemFont')}
                  </div>
                )}
                {textBar.osStrict === false && (
                  <div className="text-[10px] text-gray-500">{t('cameo.editor.textBarTextHint')}</div>
                )}
              </>
            )
          })()}
          <label className="block">
            <span className="text-gray-400">
              {t('cameo.editor.textBarHeight')}: {textBar.barHeight ?? 8}px
            </span>
            <input
              type="range"
              min={4}
              max={24}
              value={textBar.barHeight ?? 8}
              onChange={(e) => setTextBar({ ...textBar, barHeight: Number(e.target.value) })}
              className="w-full"
            />
            <div className="mt-0.5 text-[10px] text-gray-500">
              {t('cameo.editor.textBarHeightHint')}
            </div>
          </label>
          <label className="block">
            <span className="text-gray-400">
              {t('cameo.editor.textBarFontSize')}: {textBar.fontSize ?? 8}px
            </span>
            <input
              type="range"
              min={6}
              max={16}
              value={textBar.fontSize ?? 8}
              onChange={(e) => setTextBar({ ...textBar, fontSize: Number(e.target.value) })}
              className="w-full"
            />
            {(textBar.fontSize ?? 8) > (textBar.barHeight ?? 8) && (
              <div className="mt-0.5 text-[10px] text-amber-300">
                {t('cameo.editor.textBarFontSizeOverflow')}
              </div>
            )}
          </label>
          <label className="block">
            <span className="text-gray-400">
              {t('cameo.editor.textBarDarkness')}: {textBar.darkness ?? 160}
            </span>
            <input
              type="range"
              min={0}
              max={255}
              value={textBar.darkness ?? 160}
              onChange={(e) => setTextBar({ ...textBar, darkness: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          {textBar.osStrict === false && (
            <label className="block">
              <span className="text-gray-400">
                {t('cameo.editor.textBarFade')}: {textBar.fadeRows ?? 3}
              </span>
              <input
                type="range"
                min={0}
                max={Math.min(20, textBar.barHeight ?? 8)}
                value={textBar.fadeRows ?? 3}
                onChange={(e) => setTextBar({ ...textBar, fadeRows: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          )}
          {textBar.osStrict !== false && (
            <>
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.textBarSharpenThreshold')}: {textBar.sharpenThreshold ?? 96}
                </span>
                <input
                  type="range"
                  min={16}
                  max={250}
                  value={textBar.sharpenThreshold ?? 96}
                  onChange={(e) =>
                    setTextBar({ ...textBar, sharpenThreshold: Number(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="mt-0.5 text-[10px] text-gray-500">
                  {t('cameo.editor.textBarSharpenHint')}
                </div>
              </label>
              <label className="block">
                <span className="text-gray-400">
                  {t('cameo.editor.textBarCharAspect')}: {(textBar.charAspectRatio ?? 1.25).toFixed(2)}
                </span>
                <input
                  type="range"
                  min={1.0}
                  max={1.6}
                  step={0.05}
                  value={textBar.charAspectRatio ?? 1.25}
                  onChange={(e) =>
                    setTextBar({ ...textBar, charAspectRatio: Number(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="mt-0.5 text-[10px] text-gray-500">
                  {t('cameo.editor.textBarCharAspectHint')}
                </div>
              </label>
            </>
          )}
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={textBar.textShadow !== false}
              onChange={(e) => setTextBar({ ...textBar, textShadow: e.target.checked })}
            />
            <span>{t('cameo.editor.textBarShadow')}</span>
          </label>
        </div>
      </fieldset>

      {/* 立体感 */}
      <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
        <legend className="px-1 text-gray-300">{t('cameo.editor.buttonizeTitle')}</legend>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={buttonize.enabled}
            onChange={(e) => setButtonize({ ...buttonize, enabled: e.target.checked })}
          />
          <span>{t('cameo.editor.buttonizeEnable')}</span>
        </label>
        <div className={buttonize.enabled ? 'space-y-1.5' : 'space-y-1.5 opacity-50 pointer-events-none'}>
          <div className="text-[10px] text-gray-500">{t('cameo.editor.buttonizeHint')}</div>
          <label className="block">
            <span className="text-gray-400">
              {t('cameo.editor.buttonizeLightness')}: {buttonize.lightness ?? 20}
            </span>
            <input
              type="range"
              min={1}
              max={255}
              value={buttonize.lightness ?? 20}
              onChange={(e) => setButtonize({ ...buttonize, lightness: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="text-gray-400">
              {t('cameo.editor.buttonizeDarkness')}: {buttonize.darkness ?? 40}
            </span>
            <input
              type="range"
              min={1}
              max={255}
              value={buttonize.darkness ?? 40}
              onChange={(e) => setButtonize({ ...buttonize, darkness: Number(e.target.value) })}
              className="w-full"
            />
          </label>
        </div>
      </fieldset>

      {/* 老兵勋章 */}
      <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
        <legend className="px-1 text-gray-300">{t('cameo.editor.veteranTitle')}</legend>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={veteran.enabled}
            onChange={(e) => setVeteran({ ...veteran, enabled: e.target.checked })}
          />
          <span>{t('cameo.editor.veteranEnable')}</span>
        </label>
        <div className={veteran.enabled ? 'space-y-1.5' : 'space-y-1.5 opacity-50 pointer-events-none'}>
          <div className="text-gray-400">{t('cameo.editor.veteranPosition')}</div>
          <div className="inline-flex rounded border border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setVeteran({ ...veteran, position: 'top-left' })}
              className={`px-2 py-1 ${veteran.position !== 'top-right' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
            >
              {t('cameo.editor.veteranPosTopLeftOs')}
            </button>
            <button
              type="button"
              onClick={() => setVeteran({ ...veteran, position: 'top-right' })}
              className={`px-2 py-1 ${veteran.position === 'top-right' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
            >
              {t('cameo.editor.veteranPosTopRightCustom')}
            </button>
          </div>
        </div>
      </fieldset>

      {/* RA2 透明角 */}
      <fieldset className="space-y-1.5 rounded border border-gray-700 px-3 py-2">
        <legend className="px-1 text-gray-300">{t('cameo.editor.transparentCornersTitle')}</legend>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={transparentCorners.enabled}
            onChange={(e) => setTransparentCorners({ enabled: e.target.checked })}
          />
          <span>{t('cameo.editor.transparentCornersEnable')}</span>
        </label>
        <div className="text-[10px] text-gray-500">{t('cameo.editor.transparentCornersHint')}</div>
      </fieldset>
    </>
  )
}

export default CameoOptionsFieldset
