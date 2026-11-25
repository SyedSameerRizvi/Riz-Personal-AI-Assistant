declare global {
  interface Window {
    pywebview?: { api: { pick_file: () => Promise<string | null> } }
  }
}

/** Native Windows file picker in the desktop app; a plain prompt in a browser. */
export async function pickFile(): Promise<string | null> {
  if (window.pywebview?.api?.pick_file) return (await window.pywebview.api.pick_file()) || null
  const path = window.prompt('Path to read')
  return path?.trim() || null
}
