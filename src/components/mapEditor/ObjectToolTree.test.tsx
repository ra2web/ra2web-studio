import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { emptyRulesObjectLists } from '../../data/map/rulesObjects'
import { emptyObjectNameLookup } from '../../data/map/fa2ObjectLabel'
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

  it('shows CSF names with the type code in brackets', () => {
    const onSelect = vi.fn()
    const lists = emptyRulesObjectLists()
    lists.infantry = ['E1']
    renderWithProviders(
      <ObjectToolTree
        rulesLists={lists}
        objectNames={{
          ...emptyObjectNameLookup(),
          uiName: { E1: 'Name:E1' },
          csf: { 'NAME:E1': '美国大兵' },
        }}
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '美国大兵 [E1]' }))
    expect(onSelect).toHaveBeenCalledWith('inf-E1', expect.objectContaining({ tool: 'infantry', objectName: 'E1' }))
  })

  it('marks objects whose art cannot be read', () => {
    const lists = emptyRulesObjectLists()
    lists.infantry = ['E1']
    renderWithProviders(
      <ObjectToolTree
        rulesLists={lists}
        objectNames={{
          ...emptyObjectNameLookup(),
          uiName: { E1: 'Name:E1' },
          csf: { 'NAME:E1': '美国大兵' },
        }}
        theaterArt={{
          peekObject: () => null,
          requestObject: () => {},
        } as never}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /美国大兵 \[E1\] \((素材丢失|missing art)\)/ })).toBeInTheDocument()
  })
})
