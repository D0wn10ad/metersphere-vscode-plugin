import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export interface JavaFileInfo {
  filePath: string
  relativePath: string
  hasControllerAnnotation: boolean
}

export class JavaFileScanner {
  private static readonly CONTROLLER_ANNOTATIONS = [
    '@RestController',
    '@Controller',
    '@RequestMapping',
  ]

  static async findJavaFilesInProject(
    projectPath: string,
    onProgress?: (message: string, count: number) => void
  ): Promise<string[]> {
    const javaFiles = await this.walkDirectory(projectPath, onProgress)
    
    if (onProgress) {
      onProgress('Scanning for @RestController annotations...', javaFiles.length)
    }

    const controllerFiles = javaFiles.filter(filePath => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        return this.CONTROLLER_ANNOTATIONS.some(ann => content.includes(ann))
      } catch {
        return false
      }
    })

    return controllerFiles
  }

  private static async walkDirectory(
    dirPath: string,
    onProgress?: (message: string, count: number) => void
  ): Promise<string[]> {
    const files: string[] = []
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'target' || entry.name === 'build') {
          continue
        }
        
        const subFiles = await this.walkDirectory(fullPath, onProgress)
        files.push(...subFiles)
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        files.push(fullPath)
        
        if (onProgress && files.length % 10 === 0) {
          onProgress(`Found ${files.length} Java files...`, files.length)
        }
      }
    }

    return files
  }

  static async findProjectRoot(startPath: string): Promise<string | null> {
    let current = startPath
    const root = path.parse(startPath).root

    while (current !== root) {
      const pomPath = path.join(current, 'pom.xml')
      const buildGradlePath = path.join(current, 'build.gradle')
      const settingsGradlePath = path.join(current, 'settings.gradle')

      if (fs.existsSync(pomPath) || fs.existsSync(buildGradlePath) || fs.existsSync(settingsGradlePath)) {
        return current
      }

      current = path.dirname(current)
    }

    if (fs.existsSync(startPath) && fs.statSync(startPath).isDirectory()) {
      return startPath
    }

    return null
  }

  static getCommonProjectPaths(projectPath: string): string[] {
    const paths: string[] = []
    const srcMainJava = path.join(projectPath, 'src', 'main', 'java')
    const srcJava = path.join(projectPath, 'src', 'java')
    const src = path.join(projectPath, 'src')

    if (fs.existsSync(srcMainJava)) {
      paths.push(srcMainJava)
    }
    if (fs.existsSync(srcJava)) {
      paths.push(srcJava)
    }
    if (fs.existsSync(src)) {
      paths.push(src)
    }
    if (fs.existsSync(projectPath)) {
      paths.push(projectPath)
    }

    return paths
  }
}