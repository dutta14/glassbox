/**
 * Ambient declarations for the parts of the File System Access API that
 * TypeScript's lib.dom does not yet include:
 *
 *  - `window.showDirectoryPicker`
 *  - `FileSystemHandle.queryPermission`
 *  - `FileSystemHandle.requestPermission`
 *
 * Everything else (FileSystemDirectoryHandle, FileSystemFileHandle,
 * FileSystemWritableFileStream, values()/entries()/keys(), getFileHandle,
 * removeEntry, createWritable) is already in lib.dom.
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?:
    | FileSystemHandle
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos';
}

interface Window {
  showDirectoryPicker?(
    options?: DirectoryPickerOptions
  ): Promise<FileSystemDirectoryHandle>;
}
