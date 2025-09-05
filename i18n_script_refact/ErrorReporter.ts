import { codeFrameColumns } from "@babel/code-frame";
import { CodeError, IErrorReporter } from "./ErrorReporter.interface";
import fs from 'fs';
import chalk from "chalk";

export class ErrorReporter implements IErrorReporter {
  private fileCache: Map<string, string[]>;
  private fileErrors: Map<string, CodeError[]>;

  private codeErrors: CodeError[];

  constructor() {
    this.fileErrors = new Map();
    this.codeErrors = [];
    this.fileCache = new Map();
  }

  private getFileLines(filePath: string): string[] {
    if (!this.fileCache.has(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        this.fileCache.set(filePath, content.split('\n'));
      } catch {
        console.warn(chalk.yellow(`⚠️  파일을 읽을 수 없습니다: ${filePath}`));
        this.fileCache.set(filePath, []);
      }
    }
    return this.fileCache.get(filePath) || [];
  }
  private createCodeFrame({ 
    filePath, 
    line, 
    column, 
    contextLines = 3, 
    message 
  }: CreateCodeFrameParams): string {
    const lines = this.getFileLines(filePath);
    const rawLines = lines.join('\n');
    
    if (rawLines.length === 0) {
      return chalk.gray('(파일 내용을 읽을 수 없습니다)');
    }

    try {
      return codeFrameColumns(rawLines, {
        start: { line, column },
        end: { line, column },
        linesAbove: contextLines,
        linesBelow: contextLines,
        highlightCode: true,
        message: message ? chalk.red(message) : undefined
      });
    } catch {
      console.error(chalk.red(`❌ 코드 프레임 생성 중 오류가 발생했습니다: ${filePath}`));
      process.exit(1);
    }
  }


  public addCodeError(filePath: string, error: CodeError, ): void {
    if (!this.fileErrors.has(filePath)) {
      this.fileErrors.set(filePath, []);
    }

    const newErrors = this.fileErrors.get(filePath) || [];
    newErrors.push(error);
    this.codeErrors.push(error);
    this.fileErrors.set(filePath, newErrors);
  }

  private generateErrorReport(): string {
    const totalErrorCount = this.fileErrors.size;
    const report: string[] = [];

    report.push(chalk.red.bold(`🚨 총 ${totalErrorCount}개의 하드코딩 발견!\n`));

    Object.entries(this.fileErrors).forEach(([filePath, fileErrors]) => {
      report.push(chalk.yellow.bold(`📁 ${filePath} (${fileErrors.length}개 에러)`));
      report.push(chalk.gray('─'.repeat(80)));

      fileErrors.forEach((error, index) => {
        report.push(`\n${chalk.red('Error ' + (index + 1) + ':')} ${error.message}`);

        report.push(error.codeFrame);

        if (index < fileErrors.length - 1) {
          report.push(''); // 에러간 공백
        }
      });

      report.push('\n' + chalk.gray('─'.repeat(80)) + '\n');
    });


    return report.join('\n');
  }

  public printReport() {
    if(this.codeErrors.length === 0) {
      console.log(chalk.green('✅ 하드코딩된 콘텐츠가 발견되지 않았습니다!'));
      return;
    }

    const errorReport = this.generateErrorReport();
    console.log(errorReport);
  }
}