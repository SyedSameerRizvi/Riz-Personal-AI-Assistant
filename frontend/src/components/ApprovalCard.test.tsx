import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ApprovalCard } from './ApprovalCard'

const pickFile = vi.fn()
vi.mock('@/lib/pickFile', () => ({ pickFile: () => pickFile() }))

const read = { call_id: '1', tool: 'read_file', args: { path: 'C:/notes.txt' }, preview: null }
const write = {
  call_id: '2',
  tool: 'write_file',
  args: { path: 'F:/notes/todo.txt', content: 'x' },
  preview: { old_lines: 24, new_lines: 18, diff: '--- a\n+++ b\n-old line\n+new line\n' },
}

test('read request offers pick, which sends the chosen path', async () => {
  const onDecide = vi.fn()
  pickFile.mockResolvedValueOnce('D:/x.txt')
  render(<ApprovalCard request={read} onDecide={onDecide} />)
  expect(screen.getByText('Read file')).toBeInTheDocument()
  expect(screen.getByText('C:/notes.txt')).toBeInTheDocument()
  expect(screen.getAllByRole('button')).toHaveLength(3)
  await userEvent.click(screen.getByRole('button', { name: /Pick another file/ }))
  expect(onDecide).toHaveBeenCalledWith({ decision: 'pick', path: 'D:/x.txt' })
})

test('a cancelled pick sends nothing', async () => {
  const onDecide = vi.fn()
  pickFile.mockResolvedValueOnce(null)
  render(<ApprovalCard request={read} onDecide={onDecide} />)
  await userEvent.click(screen.getByRole('button', { name: /Pick another file/ }))
  expect(onDecide).not.toHaveBeenCalled()
})

test('write request shows the line change, a diff toggle and no pick', async () => {
  const onDecide = vi.fn()
  render(<ApprovalCard request={write} onDecide={onDecide} />)
  expect(screen.getByText(/24 lines become 18 lines/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pick another file/ })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Show changes' }))
  expect(screen.getByText('+new line')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Deny' }))
  expect(onDecide).toHaveBeenCalledWith({ decision: 'deny', path: null })
})

test('new file and delete copy', () => {
  const { unmount } = render(
    <ApprovalCard
      request={{ ...write, preview: { old_lines: 0, new_lines: 3, diff: '' } }}
      onDecide={() => {}}
    />,
  )
  expect(screen.getByText('Creates a new file with 3 lines.')).toBeInTheDocument()
  unmount()
  render(
    <ApprovalCard
      request={{ call_id: '3', tool: 'delete_file', args: { path: 'C:/old.txt' }, preview: null }}
      onDecide={() => {}}
    />,
  )
  expect(screen.getByText('Moves it to the Recycle Bin.')).toBeInTheDocument()
})

test('allow sends allow once', async () => {
  const onDecide = vi.fn()
  render(
    <ApprovalCard
      request={{ call_id: '4', tool: 'run_command', args: { command: 'Get-Date' }, preview: null }}
      onDecide={onDecide}
    />,
  )
  expect(screen.getByText('Run command')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
  await userEvent.click(screen.getByRole('button', { name: 'Allow' }))
  expect(onDecide).toHaveBeenCalledTimes(1)
  expect(onDecide).toHaveBeenCalledWith({ decision: 'allow', path: null })
})
