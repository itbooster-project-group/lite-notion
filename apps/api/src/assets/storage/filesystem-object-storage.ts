import { createWriteStream, type Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  ListedObject,
  ObjectStorage,
  PutObjectInput,
  StoredObjectMetadata,
} from './object-storage';
import { assertStorageKey } from './object-storage';

/** Test-only adapter. It is never registered by the production AssetsModule. */
export class FilesystemObjectStorage implements ObjectStorage {
  constructor(readonly rootDirectory: string) {
    if (!isAbsolute(rootDirectory)) throw new Error('Storage test directory must be absolute');
  }

  async putObject(key: string, input: PutObjectInput): Promise<void> {
    const file = this.filePath(key);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await pipeline(input.body, createWriteStream(file, { flags: 'wx', mode: 0o600 }));
    await writeFile(
      `${file}.metadata.json`,
      JSON.stringify({
        checksum: input.checksum,
        contentType: input.contentType,
        sizeBytes: input.contentLength,
      }),
      { flag: 'wx', mode: 0o600 },
    );
  }

  async headObject(key: string): Promise<StoredObjectMetadata | null> {
    const file = this.filePath(key);
    try {
      const [fileStats, metadataBytes] = await Promise.all([
        stat(file),
        readFile(`${file}.metadata.json`),
      ]);
      const metadata = JSON.parse(metadataBytes.toString()) as StoredObjectMetadata;
      return { ...metadata, sizeBytes: fileStats.size };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  readObject(key: string): Promise<Uint8Array> {
    return readFile(this.filePath(key));
  }

  async signedReadUrl(key: string, _expiresInSeconds: number): Promise<string> {
    const file = this.filePath(key);
    if ((await this.headObject(key)) === null) throw new Error('Object not found');
    return new URL(`file://${file}`).toString();
  }

  async deleteObject(key: string): Promise<void> {
    const file = this.filePath(key);
    await Promise.all([rm(file, { force: true }), rm(`${file}.metadata.json`, { force: true })]);
  }

  async listObjects(
    prefix: string,
    continuationToken?: string,
    maxKeys = 1000,
  ): Promise<{ continuationToken: string | null; objects: ListedObject[] }> {
    const all = await this.walk(this.rootDirectory);
    const filtered = all
      .filter((entry) => entry.key.startsWith(prefix))
      .filter((entry) => continuationToken === undefined || entry.key > continuationToken)
      .sort((a, b) => a.key.localeCompare(b.key));
    const page = filtered.slice(0, Math.max(1, Math.min(maxKeys, 1000)));
    return {
      continuationToken: filtered.length > page.length ? (page.at(-1)?.key ?? null) : null,
      objects: page,
    };
  }

  private filePath(key: string): string {
    assertStorageKey(key);
    const file = resolve(this.rootDirectory, key);
    const rel = relative(this.rootDirectory, file);
    if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error('Storage key escapes test directory');
    }
    return file;
  }

  private async walk(directory: string): Promise<ListedObject[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return [];
      throw error;
    }
    const objects: ListedObject[] = [];
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        objects.push(...(await this.walk(path)));
      } else if (!entry.name.endsWith('.metadata.json')) {
        const key = relative(this.rootDirectory, path).split(sep).join('/');
        const fileStats = await stat(path);
        objects.push({ key, lastModified: fileStats.mtime });
      }
    }
    return objects;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
