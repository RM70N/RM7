/**
 * تعريفات مبسّطة لـ yauzl-promise — المكتبة ما تجي بتعريفات جاهزة.
 * نغطي الجزء اللي نستخدمه فقط: القراءة من ذاكرة والمرور على المدخلات.
 */
declare module 'yauzl-promise' {
  import type { Readable } from 'node:stream';

  export interface ZipEntry {
    filename: string;
    uncompressedSize: number;
    compressedSize: number;
    openReadStream(): Promise<Readable>;
  }

  export interface ZipFile extends AsyncIterable<ZipEntry> {
    close(): Promise<void>;
  }

  export function fromBuffer(buffer: Buffer): Promise<ZipFile>;
  export function open(path: string): Promise<ZipFile>;

  const yauzl: {
    fromBuffer: typeof fromBuffer;
    open: typeof open;
  };
  export default yauzl;
}
