/**
 * Tests for JavaFileScanner directory-walk isolation: one unreadable
 * directory or broken entry must not abort the whole scan.
 *
 * fs is spied on the RAW module object (not an `import * as` namespace) so the
 * source module's esModuleInterop getter wrapper sees the patched functions.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { JavaFileScanner } from '../src/metersphere/javaFileScanner'

const fsRaw = require('fs') as typeof import('fs')

const controllerSrc = [
  'package com.example.demo;',
  'import org.springframework.web.bind.annotation.*;',
  '@RestController',
  'public class C {',
  '  @GetMapping("/x")',
  '  public String h() { return "x"; }',
  '}',
].join('\n')

type ReaddirImpl = (p: fs.PathLike, options?: unknown) => unknown

function spyOnReaddir(impl: ReaddirImpl): jest.SpyInstance {
  return jest
    .spyOn(fsRaw, 'readdirSync')
    .mockImplementation(impl as unknown as typeof fsRaw.readdirSync)
}

describe('JavaFileScanner walk isolation', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-scan-'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('skips an unreadable subdirectory and still finds sibling Java files', async () => {
    fs.mkdirSync(path.join(root, 'good'))
    fs.writeFileSync(path.join(root, 'good', 'A.java'), controllerSrc)
    fs.mkdirSync(path.join(root, 'locked'))
    fs.writeFileSync(path.join(root, 'locked', 'Hidden.java'), controllerSrc)
    fs.writeFileSync(path.join(root, 'Top.java'), controllerSrc)

    const original = fsRaw.readdirSync.bind(fsRaw) as ReaddirImpl
    spyOnReaddir((p, options) => {
      if (String(p).endsWith('locked')) {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException
        err.code = 'EACCES'
        throw err
      }
      return original(p, options)
    })

    const files = await JavaFileScanner.findJavaFilesInProject(root)

    expect(files.sort()).toEqual(
      [path.join(root, 'good', 'A.java'), path.join(root, 'Top.java')].sort()
    )
  })

  test('an unreadable scan root returns [] instead of throwing', async () => {
    spyOnReaddir(() => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException
      err.code = 'EACCES'
      throw err
    })

    await expect(JavaFileScanner.findJavaFilesInProject(root)).resolves.toEqual([])
  })

  test('a broken directory entry is logged and skipped while other entries are collected', async () => {
    fs.writeFileSync(path.join(root, 'A.java'), controllerSrc)
    fs.mkdirSync(path.join(root, 'sub'))
    fs.writeFileSync(path.join(root, 'sub', 'B.java'), controllerSrc)

    const original = fsRaw.readdirSync.bind(fsRaw) as ReaddirImpl
    spyOnReaddir((p, options) => {
      const list = original(p, options) as fs.Dirent[]
      if (String(p) === root) {
        const broken = {
          name: 'broken-entry',
          isDirectory: () => {
            throw new Error('broken dirent')
          },
          isFile: () => false,
          isSymbolicLink: () => false,
        } as unknown as fs.Dirent
        return [...list, broken]
      }
      return list
    })

    const files = await JavaFileScanner.findJavaFilesInProject(root)

    expect(files.sort()).toEqual(
      [path.join(root, 'A.java'), path.join(root, 'sub', 'B.java')].sort()
    )
  })

  test('a symlink loop back to the scan root is not followed (walk terminates)', async () => {
    fs.writeFileSync(path.join(root, 'A.java'), controllerSrc)
    fs.symlinkSync(root, path.join(root, 'loop'), 'dir')

    const files = await JavaFileScanner.findJavaFilesInProject(root)

    expect(files).toEqual([path.join(root, 'A.java')])
  })
})
