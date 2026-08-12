export {}

declare global {
  interface ClaudeDownloadsError {
    code: string
    message: string
  }

  interface ClaudeDownloadsSaveRequest {
    filename: string
    data: string | Blob | ArrayBuffer | ArrayBufferView
  }

  interface ClaudeDownloadsSaveResult {
    status: 'saved'
  }

  interface Window {
    claude?: {
      downloads?: {
        save: (request: ClaudeDownloadsSaveRequest) => Promise<ClaudeDownloadsSaveResult>
      }
    }
  }
}
