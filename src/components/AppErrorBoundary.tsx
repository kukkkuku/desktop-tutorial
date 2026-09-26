// 화면을 그리다 오류가 나면 빈 화면 대신 무슨 오류인지와 다시 열기 버튼을 보여 준다.
import { Component, type ReactNode } from 'react'

export default class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    const e = this.state.error
    if (!e) return this.props.children
    return (
      <div style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontFamily: 'Pretendard, sans-serif', color: '#14161A' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>화면을 여는 중에 오류가 났습니다</h1>
        <p style={{ marginTop: 8, fontSize: 13, color: '#5F6368', lineHeight: 1.6 }}>
          새로 고침하면 대부분 해결됩니다. 계속되면 아래 오류 내용을 캡처해서 알려 주세요(저장된 입력 내용은 지워지지 않습니다).
        </p>
        <pre style={{ marginTop: 12, padding: 12, background: '#F5F5F7', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {e.message}
          {'\n'}
          {(e.stack ?? '').split('\n').slice(1, 6).join('\n')}
        </pre>
        <button
          onClick={() => location.reload()}
          style={{ marginTop: 14, padding: '8px 16px', borderRadius: 8, background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600, border: 0, cursor: 'pointer' }}
        >
          새로 고침
        </button>
      </div>
    )
  }
}
