import chalk from 'chalk';
import fs from 'fs';

export default class EnhancedErrorReporter {
  constructor() {
    this.fileCache = new Map(); // 파일 내용 캐시
  }

  // 파일 내용을 캐시하여 성능 향상
  getFileLines(filePath) {
    if (!this.fileCache.has(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        this.fileCache.set(filePath, content.split('\n'));
      } catch (error) {
        this.fileCache.set(filePath, []);
      }
    }
    return this.fileCache.get(filePath);
  }

  // 에러 위치 주변 코드 컨텍스트 생성
  createCodeContext(filePath, line, column = 0, contextLines = 2) {
    const lines = this.getFileLines(filePath);
    const startLine = Math.max(1, line - contextLines);
    const endLine = Math.min(lines.length, line + contextLines);

    const context = [];

    for (let i = startLine; i <= endLine; i++) {
      const lineContent = lines[i - 1] || '';
      const lineNumber = i.toString().padStart(3, ' ');
      const isErrorLine = i === line;

      if (isErrorLine) {
        // 에러 라인 강조
        context.push({
          lineNumber,
          content: lineContent,
          isError: true,
          column,
        });
      } else {
        // 컨텍스트 라인
        context.push({
          lineNumber,
          content: lineContent,
          isError: false,
        });
      }
    }

    return context;
  }

  // 에러 상세 정보 포맷팅
  formatError(error, filePath) {
    const context = this.createCodeContext(filePath, error.line, error.column);

    return {
      ...error,
      filePath,
      context,
      codeSnippet: this.generateCodeSnippet(context, error.column),
    };
  }

  // 코드 스니펫 생성 (화살표로 정확한 위치 표시)
  generateCodeSnippet(context, column) {
    const lines = [];

    context.forEach(({ lineNumber, content, isError }) => {
      if (isError) {
        // 에러 라인
        lines.push(chalk.red(`${lineNumber}| ${content}`));

        // 에러 위치 화살표 표시
        if (column > 0) {
          const padding = ' '.repeat(lineNumber.length + 1);
          const arrow = ' '.repeat(column) + chalk.red('^^^');
          lines.push(chalk.red(`${padding}| ${arrow}`));
        }
      } else {
        // 컨텍스트 라인
        lines.push(chalk.gray(`${lineNumber}| ${content}`));
      }
    });

    return lines.join('\n');
  }

  // 전체 에러 리포트 생성
  generateReport(errors) {
    if (errors.length === 0) {
      return chalk.green('✅ 하드코딩된 콘텐츠가 발견되지 않았습니다!');
    }

    const groupedErrors = this.groupErrorsByFile(errors);
    const report = [];

    report.push(chalk.red.bold(`🚨 총 ${errors.length}개의 하드코딩 발견!\n`));

    Object.entries(groupedErrors).forEach(([filePath, fileErrors]) => {
      report.push(chalk.yellow.bold(`📁 ${filePath} (${fileErrors.length}개 에러)`));
      report.push(chalk.gray('─'.repeat(80)));

      fileErrors.forEach((error, index) => {
        report.push(`\n${chalk.red('Error ' + (index + 1) + ':')} ${error.message}`);

        if (error.suggestion) {
          report.push(chalk.blue(`💡 제안: ${error.suggestion}`));
        }

        report.push(error.codeSnippet);

        if (index < fileErrors.length - 1) {
          report.push(''); // 에러 간 공백
        }
      });

      report.push('\n' + chalk.gray('─'.repeat(80)) + '\n');
    });

    // 수정 가이드 추가
    report.push(this.generateFixGuide());

    return report.join('\n');
  }

  groupErrorsByFile(errors) {
    return errors.reduce((groups, error) => {
      const file = error.filePath;
      if (!groups[file]) {
        groups[file] = [];
      }
      groups[file].push(error);
      return groups;
    }, {});
  }

  generateFixGuide() {
    return chalk.cyan.bold(`
📚 수정 가이드:
${chalk.cyan('1. JSX 텍스트:')} <div>하드코딩</div> → <div>{t('key')}</div>
${chalk.cyan('2. 속성 값:')} <img alt="하드코딩" /> → <img alt={t('alt.key')} />
${chalk.cyan('3. Toast 메시지:')} message.error('하드코딩') → message.error(t('error.key'))
${chalk.cyan('4. 객체 속성:')} title: '하드코딩' → title: t('title.key')
`);
  }
}
