import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Alert } from 'react-native'

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn().mockResolvedValue({}),
}))

jest.mock('@/lib/config/links', () => ({
  LINKS: {
    about: 'https://redeemo.co.uk/about',
    faq: 'https://redeemo.co.uk/faq',
    terms: 'https://redeemo.co.uk/terms',
    privacy: 'https://redeemo.co.uk/privacy',
  },
}))

import { SupportLegalSection } from '../components/SupportLegalSection'

describe('SupportLegalSection', () => {
  it('shows all rows', () => {
    const onGetHelp = jest.fn()
    render(<SupportLegalSection onGetHelp={onGetHelp} />)
    expect(screen.getByText('Get help')).toBeTruthy()
    expect(screen.getByText('About Redeemo')).toBeTruthy()
    expect(screen.getByText('FAQs')).toBeTruthy()
    expect(screen.getByText('Terms of Use')).toBeTruthy()
    expect(screen.getByText('Privacy Policy')).toBeTruthy()
  })

  it('calls onGetHelp when Get help row is pressed', () => {
    const onGetHelp = jest.fn()
    render(<SupportLegalSection onGetHelp={onGetHelp} />)
    fireEvent.press(screen.getByText('Get help'))
    expect(onGetHelp).toHaveBeenCalledTimes(1)
  })
})
