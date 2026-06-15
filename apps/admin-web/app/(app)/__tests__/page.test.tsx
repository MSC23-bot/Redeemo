/**
 * Authenticated landing page.
 *
 * The page is a server component whose only job is to redirect to the approval
 * queue (the operator's work surface). next/navigation's `redirect` is mocked so
 * we assert the destination without an actual navigation.
 */
import { redirect } from 'next/navigation'
import DashboardPage from '../page'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

describe('authenticated landing', () => {
  it('redirects to /queue', () => {
    // The page calls redirect() when rendered.
    DashboardPage()
    expect(redirect).toHaveBeenCalledWith('/queue')
  })
})
