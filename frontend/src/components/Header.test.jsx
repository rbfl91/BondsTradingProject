import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Header from './Header'

describe('Header', () => {
  it('renders the three navigation items (L-07: all-English labels)', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    // L-07: "Operações" (Portuguese) was replaced with the English label
    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('Crypto Market')).toBeInTheDocument()
    expect(screen.queryByText('Operações')).not.toBeInTheDocument()
  })

  it('shows the app title', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getAllByText(/Bond Trading/i).length).toBeGreaterThan(0)
  })
})
