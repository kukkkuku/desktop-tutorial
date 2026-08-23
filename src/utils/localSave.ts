// "데이터 관리 > 로컬 파일"에서 내려받는 모든 파일(엑셀/JSON 백업, 업로드
// 양식, 결과 리포트 zip 등)이 이 모듈을 거쳐 저장된다. 기본은 브라우저의
// 다운로드 폴더로 떨어지는 기존 방식 그대로지만, 사용자가 폴더를 한 번
// 지정해두면 그 폴더 밑에 전용 하위 폴더를 만들어 이후 저장을 전부 거기로
// 모아준다("아무데나 다운로드돼서 불편하다"는 문제 해결).
//
// File System Access API(showDirectoryPicker)는 Chrome/Edge 계열만
// 지원한다 -- 지원하지 않는 브라우저(Firefox/Safari)에서는 폴더 지정
// UI 자체를 숨기고 기존 다운로드 방식만 쓴다. 선택한 폴더 핸들은
// IndexedDB에 남겨 다음에 다시 열어도(권한이 아직 살아있으면) 재사용한다.

const DB_NAME = 'perf-eval-local-save'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'save-directory'
export const LOCAL_SAVE_SUBFOLDER = '성장관리_로컬백업'

interface MinimalWritable {
  write(data: Blob): Promise<void>
  close(): Promise<void>
}
interface MinimalFileHandle {
  createWritable(): Promise<MinimalWritable>
}
interface MinimalDirHandle {
  name: string
  getDirectoryHandle(name: string, opts: { create: boolean }): Promise<MinimalDirHandle>
  getFileHandle(name: string, opts: { create: boolean }): Promise<MinimalFileHandle>
  queryPermission?(opts: { mode: string }): Promise<string>
  requestPermission?(opts: { mode: string }): Promise<string>
}
type ShowDirectoryPicker = (opts?: { mode?: string }) => Promise<MinimalDirHandle>

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker === 'function'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<unknown> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

let rootHandle: MinimalDirHandle | null = null
let subfolderHandle: MinimalDirHandle | null = null

export function getSaveDirectoryName(): string | null {
  return rootHandle?.name ?? null
}

async function ensureSubfolder(root: MinimalDirHandle): Promise<MinimalDirHandle> {
  return root.getDirectoryHandle(LOCAL_SAVE_SUBFOLDER, { create: true })
}

// "위치 지정" 버튼 -- 폴더 선택창을 띄우고, 고른 폴더 밑에 전용 하위
// 폴더가 없으면 새로 만든다. 선택 결과는 IndexedDB에도 남겨 다음에
// 다시 열어도 재사용할 수 있게 한다.
export async function pickSaveDirectory(): Promise<string> {
  const showPicker = (window as unknown as { showDirectoryPicker: ShowDirectoryPicker }).showDirectoryPicker
  const handle = await showPicker({ mode: 'readwrite' })
  rootHandle = handle
  subfolderHandle = await ensureSubfolder(handle)
  await idbSet(HANDLE_KEY, handle)
  return handle.name
}

export function clearSaveDirectory(): void {
  rootHandle = null
  subfolderHandle = null
  void idbDelete(HANDLE_KEY)
}

// 앱(정확히는 데이터 관리 화면)이 열릴 때 한 번 호출한다. 예전에 지정해둔
// 폴더가 있고 권한이 아직 살아있으면 조용히 재사용하고, 아니면 null --
// 매번 다시 물어보면 오히려 불편하므로 저장 시점에만 필요하면 다시 권한을
// 요청한다(requestPermission).
export async function restoreSaveDirectory(): Promise<string | null> {
  if (!isDirectoryPickerSupported()) return null
  try {
    const handle = (await idbGet(HANDLE_KEY)) as MinimalDirHandle | undefined
    if (!handle) return null
    const state = handle.queryPermission ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted'
    if (state !== 'granted') return null
    rootHandle = handle
    subfolderHandle = await ensureSubfolder(handle)
    return handle.name
  } catch {
    return null
  }
}

async function writeToSubfolder(blob: Blob, filename: string): Promise<boolean> {
  if (!subfolderHandle) return false
  try {
    const fileHandle = await subfolderHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch (err) {
    console.warn('지정한 폴더에 저장하지 못해 기본 다운로드로 대체합니다:', err)
    return false
  }
}

function downloadViaAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 모든 "로컬 파일로 저장" 지점이 이 함수 하나를 통해 저장한다 -- 지정된
// 폴더가 있으면 거기(하위 폴더)에 바로 쓰고, 없거나 쓰기에 실패하면 기존
// 방식(브라우저 다운로드)으로 대체한다.
export async function saveBlobLocally(blob: Blob, filename: string): Promise<void> {
  const saved = await writeToSubfolder(blob, filename)
  if (!saved) downloadViaAnchor(blob, filename)
}
