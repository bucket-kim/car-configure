import { useState } from 'react'
import { useConfiguration } from '../../hooks/useConfiguration'
import { UIStyleContainer } from './UIStyleContainer'
import type { GroupId } from '@car-config/core'
import { formatCents } from '@car-config/core'

const UI = () => {

    const { groups, price, optionsByGroup, disabled, selected, selectOption, reset } = useConfiguration()

    const [openGroup, setOpenGroup] = useState(new Set<GroupId>())

    const toggleOption = (key: GroupId) => {
        setOpenGroup((prev) => (prev.has(key) ? new Set() : new Set([key])))

    }


    return (
        <UIStyleContainer>
            <h1>Config Panel</h1>
            <div>
                {groups.map((g) => {
                    const isOpen = openGroup.has(g.id)
                    return (
                        <div key={g.id}>
                            <button onClick={() => toggleOption(g.id)} aria-expanded={isOpen}>{g.label}</button>
                            {isOpen && (
                                optionsByGroup[g.id].map((option) => {
                                    const isDisabled = disabled.has(option.id)
                                    return (
                                        <div key={option.id} >
                                            <button disabled={isDisabled} aria-pressed={selected.has(option.id)} onClick={() => selectOption(option.id)}>{option.label}</button>
                                            <p>- {formatCents(option.priceCents)}</p>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )
                })}
                <p>{formatCents(price.totalCents)}</p>
                <button onClick={() => reset()}>Reset</button>
            </div>
        </UIStyleContainer>
    )
}

export default UI
