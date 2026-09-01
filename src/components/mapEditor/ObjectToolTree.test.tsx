import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyRulesObjectLists } from '../../data/map/rulesObjects'
import { renderWithProviders } from '../../test/render'
import ObjectToolTree from './ObjectToolTree'

describe('ObjectToolTree', () => {
  it('selects FA2 nothing and overlay leaves', () => {
    const onSelect = vi.fn()
    renderWithProviders(
      <ObjectToolTree rulesLists={emptyRulesObjectLists()} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^无$|^Nothing$/ }))
    expect(onSelect).toHaveBeenCalledWith('nothing', expect.objectContaining({ tool: 'select' }))
    fireEvent.click(screen.getByRole('button', { name: /矿石|Ore/ }))
    expect(onSelect).toHaveBeenCalledWith('ore', expect.objectContaining({ tool: 'ore' }))
  })
})
