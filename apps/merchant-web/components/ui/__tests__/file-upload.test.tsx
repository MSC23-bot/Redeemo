import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUpload } from '../file-upload'

// The file-upload posts to the B5 server-proxied route through the shared API
// client. We mock the client so we can assert the request shape (kind in the path,
// FormData body, auth) without a network call.
const apiFetchMock = jest.fn()
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

const PNG = () => makeFile('logo.png', 'image/png', 100 * 1024) // 100KB

describe('FileUpload', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('renders an accessible file input and size guidance text', () => {
    render(<FileUpload kind="logo" label="Logo" hint="PNG or JPG, up to 2MB" />)
    expect(screen.getByLabelText(/Logo/i)).toBeInTheDocument()
    expect(screen.getByText(/up to 2MB/i)).toBeInTheDocument()
  })

  it('uploads a valid file to the B5 route (kind in path, FormData, authed) and reports the URL', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
    const onUploaded = jest.fn()
    render(<FileUpload kind="logo" label="Logo" onUploaded={onUploaded} />)

    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, PNG())

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    const [path, opts] = apiFetchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('/api/v1/merchant/uploads/logo')
    expect(opts.method).toBe('POST')
    expect(opts.auth).toBe(true)
    expect(opts.body).toBeInstanceOf(FormData)

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://cdn.example/logo.png'))
    // Selected-file name is surfaced.
    expect(screen.getByText(/logo\.png/)).toBeInTheDocument()
  })

  it('rejects a wrong file type client-side and never calls the upload route', async () => {
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    // applyAccept:false so the test exercises the component's own type guard rather
    // than the input's `accept` attribute pre-filter (a real user can still force-pick
    // a non-matching file, which is what the in-component guard defends against).
    await userEvent.upload(input, makeFile('doc.pdf', 'application/pdf', 1024), { applyAccept: false })

    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG|JPG/i)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized file client-side and never calls the upload route', async () => {
    // logo cap is 2MB; supply 3MB.
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, makeFile('logo.png', 'image/png', 3 * 1024 * 1024))

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large|2MB/i)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('surfaces an error state when the upload route fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'))
    render(<FileUpload kind="banner" label="Cover" />)
    const input = screen.getByLabelText(/Cover/i) as HTMLInputElement
    // banner cap is 5MB; 100KB png is within size + type, so it reaches the route.
    await userEvent.upload(input, makeFile('cover.png', 'image/png', 100 * 1024))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  // WF5 (staging acceptance walk): the backend's typed IMAGE_DIMENSIONS_INVALID
  // 400 already states the minimum-dimension requirement in its message - surface
  // it verbatim instead of the generic "Upload failed. Please try again."
  it('surfaces the backend message for a typed IMAGE_DIMENSIONS_INVALID error', async () => {
    apiFetchMock.mockRejectedValue(
      Object.assign(new Error('The image dimensions are not allowed. Photos must be landscape (at least 1200x600).'), {
        code: 'IMAGE_DIMENSIONS_INVALID',
      }),
    )
    render(<FileUpload kind="photo" label="Photo" />)
    const input = screen.getByLabelText(/Photo/i) as HTMLInputElement
    await userEvent.upload(input, makeFile('photo.png', 'image/png', 100 * 1024))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /image dimensions are not allowed.*photos must be landscape.*1200x600/i,
    )
  })

  // An unrecognised/unknown backend code must NOT leak a raw internal message -
  // it still falls back to the generic copy.
  it('falls back to the generic message for an unmapped error code', async () => {
    apiFetchMock.mockRejectedValue(Object.assign(new Error('boom, internal detail'), { code: 'SOME_UNMAPPED_CODE' }))
    render(<FileUpload kind="photo" label="Photo" />)
    const input = screen.getByLabelText(/Photo/i) as HTMLInputElement
    await userEvent.upload(input, makeFile('photo.png', 'image/png', 100 * 1024))

    expect(await screen.findByRole('alert')).toHaveTextContent(/upload failed\. please try again\./i)
  })

  it('lets the user re-select the SAME file and retry after a failed upload', async () => {
    // First attempt fails (transient upload failure), second attempt with the
    // EXACT same file succeeds. The input value must be reset after each change
    // so re-picking an identical file refires onChange and hits the route again.
    apiFetchMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'https://cdn.example/logo.png' })
    const onUploaded = jest.fn()
    render(<FileUpload kind="logo" label="Logo" onUploaded={onUploaded} />)

    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    const sameFile = PNG()

    // First selection -> failure.
    await userEvent.upload(input, sameFile)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    // Re-select the SAME file -> the handler refires and retries the route.
    await userEvent.upload(input, sameFile)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://cdn.example/logo.png'))
  })

  it('applies the banner kind cap (5MB) and path when kind="banner"', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://cdn.example/cover.png' })
    render(<FileUpload kind="banner" label="Cover" />)
    const input = screen.getByLabelText(/Cover/i) as HTMLInputElement
    // 4MB is within the 5MB banner cap (would have failed the 2MB logo cap).
    await userEvent.upload(input, makeFile('cover.png', 'image/png', 4 * 1024 * 1024))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/v1/merchant/uploads/banner')
  })
})
