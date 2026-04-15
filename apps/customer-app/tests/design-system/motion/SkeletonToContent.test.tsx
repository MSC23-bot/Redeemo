import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { SkeletonToContent } from '@/design-system/motion/SkeletonToContent'

describe('<SkeletonToContent>', () => {
  it('shows skeleton when loading, content when resolved', () => {
    const skel = <Text>skel</Text>
    const body = <Text>body</Text>
    const { queryByText, rerender } = render(<SkeletonToContent loading skeleton={skel}>{body}</SkeletonToContent>)
    expect(queryByText('skel')).toBeTruthy()
    rerender(<SkeletonToContent loading={false} skeleton={skel}>{body}</SkeletonToContent>)
    expect(queryByText('body')).toBeTruthy()
  })
})
