import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { FileUpload } from '../file-upload'

// The file-upload posts to the B5 server-proxied route through the shared API
// client. We mock the client so we can assert the request shape (kind in the path,
// FormData body, auth) without a network call.
const apiFetchMock = jest.fn()
jest.mock('@/lib/api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

// ImageCropModal is exercised on its own (components/ui/__tests__/ImageCropModal.test.tsx)
// and its canvas-render step in lib/image/__tests__/cropImage.test.ts. Here it is
// replaced with a minimal fake exposing confirm/cancel buttons, so these tests
// stay focused on file-upload.tsx's own wiring: does an image pick open the crop
// step, does upload wait for crop confirm, does cancel skip the upload, and is
// the CROPPED file (not necessarily byte-identical to the original) what gets
// posted. The fake "confirms" with the SAME File instance it was given, which is
// enough to assert the wiring without re-testing the crop math here.
jest.mock('../ImageCropModal', () => ({
  ImageCropModal: ({
    file,
    onConfirm,
    onCancel,
  }: {
    file: File
    onConfirm: (f: File) => void
    onCancel: () => void
  }) => (
    <div data-testid="mock-image-crop-modal">
      <span data-testid="mock-crop-file-name">{file.name}</span>
      <button type="button" data-testid="mock-crop-confirm" onClick={() => onConfirm(file)}>
        confirm crop
      </button>
      <button type="button" data-testid="mock-crop-cancel" onClick={onCancel}>
        cancel crop
      </button>
    </div>
  ),
}))

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

const PNG = () => makeFile('logo.png', 'image/png', 100 * 1024) // 100KB

// URL.createObjectURL / revokeObjectURL exist via the jest.setup.ts polyfill;
// pin the return value here so the preview thumbnail's src is assertable.
beforeAll(() => {
  jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-preview')
})

describe('FileUpload', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('renders an accessible file input and size guidance text', () => {
    render(<FileUpload kind="logo" label="Logo" hint="PNG or JPG, up to 2MB" />)
    expect(screen.getByLabelText(/Logo/i)).toBeInTheDocument()
    expect(screen.getByText(/up to 2MB/i)).toBeInTheDocument()
  })

  it('opens the crop step after a valid image pick, and does not upload until crop is confirmed', async () => {
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, PNG())

    expect(await screen.findByTestId('mock-image-crop-modal')).toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('uploads the CROPPED file to the B5 route (kind in path, FormData, authed) once crop is confirmed', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
    const onUploaded = jest.fn()
    render(<FileUpload kind="logo" label="Logo" onUploaded={onUploaded} />)

    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, PNG())
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    const [path, opts] = apiFetchMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('/api/v1/merchant/uploads/logo')
    expect(opts.method).toBe('POST')
    expect(opts.auth).toBe(true)
    expect(opts.body).toBeInstanceOf(FormData)

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://cdn.example/logo.png'))
    expect(screen.queryByTestId('mock-image-crop-modal')).not.toBeInTheDocument()
  })

  it('cancelling the crop step closes it without uploading', async () => {
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, PNG())
    fireEvent.click(await screen.findByTestId('mock-crop-cancel'))

    expect(screen.queryByTestId('mock-image-crop-modal')).not.toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('shows a thumbnail preview of the saved image after a successful upload', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://cdn.example/logo.png' })
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, PNG())
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))

    const preview = await screen.findByTestId('file-upload-preview')
    expect(preview).toHaveAttribute('src', 'blob:mock-preview')
  })

  it('rejects a wrong file type client-side, never opens the crop step, and never calls the upload route', async () => {
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    // applyAccept:false so the test exercises the component's own type guard rather
    // than the input's `accept` attribute pre-filter (a real user can still force-pick
    // a non-matching file, which is what the in-component guard defends against).
    await userEvent.upload(input, makeFile('doc.pdf', 'application/pdf', 1024), { applyAccept: false })

    expect(await screen.findByRole('alert')).toHaveTextContent(/PNG|JPG/i)
    expect(screen.queryByTestId('mock-image-crop-modal')).not.toBeInTheDocument()
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('rejects an oversized CROPPED output client-side and never calls the upload route', async () => {
    // logo cap is 2MB. The mock crop step confirms with the SAME file it was given
    // (see the ImageCropModal mock above), so picking an oversized source and
    // confirming exercises the post-crop size check that runs on its output.
    render(<FileUpload kind="logo" label="Logo" />)
    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    await userEvent.upload(input, makeFile('logo.png', 'image/png', 3 * 1024 * 1024))
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large|2MB/i)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('surfaces an error state when the upload route fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'))
    render(<FileUpload kind="banner" label="Cover" />)
    const input = screen.getByLabelText(/Cover/i) as HTMLInputElement
    // banner cap is 5MB; 100KB png is within size + type, so it reaches the route.
    await userEvent.upload(input, makeFile('cover.png', 'image/png', 100 * 1024))
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))

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
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))

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
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/upload failed\. please try again\./i)
  })

  it('lets the user re-select the SAME file and retry after a failed upload', async () => {
    // First attempt fails (transient upload failure), second attempt with the
    // EXACT same file succeeds. The input value must be reset after each pick
    // so re-picking an identical file refires onChange and reopens the crop step.
    apiFetchMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ url: 'https://cdn.example/logo.png' })
    const onUploaded = jest.fn()
    render(<FileUpload kind="logo" label="Logo" onUploaded={onUploaded} />)

    const input = screen.getByLabelText(/Logo/i) as HTMLInputElement
    const sameFile = PNG()

    // First selection -> crop confirm -> failure.
    await userEvent.upload(input, sameFile)
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    // Re-select the SAME file -> the crop step reopens and retries the route.
    await userEvent.upload(input, sameFile)
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('https://cdn.example/logo.png'))
  })

  it('applies the banner kind cap (5MB) and path when kind="banner"', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://cdn.example/cover.png' })
    render(<FileUpload kind="banner" label="Cover" />)
    const input = screen.getByLabelText(/Cover/i) as HTMLInputElement
    // 4MB is within the 5MB banner cap (would have failed the 2MB logo cap).
    await userEvent.upload(input, makeFile('cover.png', 'image/png', 4 * 1024 * 1024))
    fireEvent.click(await screen.findByTestId('mock-crop-confirm'))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1))
    expect(apiFetchMock.mock.calls[0][0]).toBe('/api/v1/merchant/uploads/banner')
  })
})
