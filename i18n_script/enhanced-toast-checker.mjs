import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default || _traverse;

import chalk from 'chalk';
import fs from 'fs';
import { glob } from 'glob';
import EnhancedErrorReporter from './enhanced-error-reporter.mjs';

export default class EnhancedToastChecker {
  constructor(options = {}) {
    this.options = {
      toastFunctions: [
        // Ant Design message
        'message.error',
        'message.success',
        'message.warning',
        'message.info',
        'message.loading',

        // Kosmos message (프로젝트 고유)
        'Message.error',
        'Message.success',
        'Message.warning',
        'Message.info',

        // 일반적인 toast 라이브러리들
        'toast.error',
        'toast.success',
        'toast.warning',
        'toast.info',
        'notification.error',
        'notification.success',
        'notification.warning',
        'notification.info',
        'notification.open',

        // 브라우저 기본 API
        'alert',
        'confirm',
        'prompt',

        // 기타 가능한 알림 함수들
        'showMessage',
        'showError',
        'showSuccess',
        'showWarning',
      ],
      objectProperties: [
        'title',
        'message',
        'description',
        'content',
        'label',
        'placeholder',
        'tooltip',
        'helpText',
        'errorMessage',
        'successMessage',
        'warningMessage',
        'text',
        'body',
        'detail',
      ],
      allowPatterns: [
        /^t\(['"]/, // i18n 함수: t('key')
        /^i18n\./, // i18n 객체: i18n.t()
        /^\$\{.*\}$/, // 템플릿 변수
        /^(true|false|null|undefined)$/, // 기본값들
        /^\d+$/, // 숫자
        /^['"]?\s*['"]?$/, // 빈 문자열
        /^console\./, // console 로그 허용
        /^process\.env\./, // 환경변수 허용
        /^import\(/, // 동적 import
        /^require\(/, // require 함수
      ],
      ...options,
    };

    this.reporter = new EnhancedErrorReporter();
  }

  async checkFiles(patterns) {
    console.log(chalk.blue('🔍 Toast/알림 하드코딩 검사 시작...\n'));

    // 패턴에서 포함/제외 분리
    const includePatterns = patterns.filter(p => !p.startsWith('!'));
    const excludePatterns = patterns
      .filter(p => p.startsWith('!'))
      .map(p => p.substring(1)); // ! 제거

    const defaultIgnores = [
      '**/*.test.{js,jsx,ts,tsx}',
      '**/*.stories.{js,jsx,ts,tsx}',
      '**/*.spec.{js,jsx,ts,tsx}',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
    ];

    const allIgnores = [...defaultIgnores, ...excludePatterns];

    console.log(chalk.gray(`📋 포함 패턴: [${includePatterns.join(', ')}]`));
    console.log(chalk.gray(`📋 제외 패턴: [${excludePatterns.join(', ')}]`));

    const files = await glob(includePatterns, {
      ignore: allIgnores,
    });

    console.log(chalk.gray(`📊 검사 대상: ${files.length}개 파일`));

    const allErrors = [];

    for (const file of files) {
      const errors = await this.checkFile(file);
      allErrors.push(...errors);
    }

    const report = this.reporter.generateReport(allErrors);
    console.log(report);

    return allErrors.length === 0;
  }

  async checkFile(filePath) {
    // 디렉토리인지 확인
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return [];
    }

    const code = fs.readFileSync(filePath, 'utf8');
    const errors = [];

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
      });

      traverse(ast, {
        // 함수 호출 검사 (상세 정보 포함)
        CallExpression: (path) => {
          const calleeText = this.getCalleeText(path.node);

          if (this.isToastFunction(calleeText)) {
            const hardcodedArgs = this.findHardcodedArguments(path.node.arguments);

            hardcodedArgs.forEach((arg) => {
              const errorInfo = {
                line: arg.loc?.start.line || 0,
                column: arg.loc?.start.column || 0,
                message: `하드코딩된 ${calleeText} 메시지`,
                type: 'toast-function',
                value: this.getStringValue(arg),
                functionName: calleeText,
                suggestion: `${calleeText}(t('${this.suggestKey(calleeText, this.getStringValue(arg))}'))`,
              };

              const enhancedError = this.reporter.formatError(errorInfo, filePath);
              errors.push(enhancedError);
            });
          }
        },

        // 객체 속성 검사 (상세 정보 포함)
        ObjectProperty: (path) => {
          if (this.isUserFacingProperty(path.node) && this.isHardcodedValue(path.node.value)) {
            const propertyName = path.node.key.name || path.node.key.value;
            const errorInfo = {
              line: path.node.value.loc?.start.line || 0,
              column: path.node.value.loc?.start.column || 0,
              message: `하드코딩된 객체 속성 "${propertyName}"`,
              type: 'object-property',
              value: this.getStringValue(path.node.value),
              propertyName,
              suggestion: `${propertyName}: t('${this.suggestKey(propertyName, this.getStringValue(path.node.value))}')`,
            };

            const enhancedError = this.reporter.formatError(errorInfo, filePath);
            errors.push(enhancedError);
          }
        },

        // JSX 속성 검사 (상세 정보 포함)
        JSXAttribute: (path) => {
          const attrName = path.node.name.name;

          if (
            ['data-tooltip', 'data-title', 'data-message', 'data-content'].includes(attrName) &&
            this.isHardcodedValue(path.node.value)
          ) {
            const errorInfo = {
              line: path.node.value.loc?.start.line || 0,
              column: path.node.value.loc?.start.column || 0,
              message: `하드코딩된 JSX 속성 "${attrName}"`,
              type: 'jsx-attribute',
              value: this.getStringValue(path.node.value),
              attributeName: attrName,
              suggestion: `${attrName}={t('${this.suggestKey(attrName, this.getStringValue(path.node.value))}')}`,
            };

            const enhancedError = this.reporter.formatError(errorInfo, filePath);
            errors.push(enhancedError);
          }
        },
      });
    } catch (error) {
      console.error(chalk.yellow(`⚠️  파싱 에러 in ${filePath}: ${error.message}`));
    }

    return errors;
  }

  // i18n 키 제안 함수
  suggestKey(context, value) {
    // 값에서 특수문자 제거하고 camelCase로 변환
    const cleanValue = value
      .replace(/[^a-zA-Z0-9\s가-힣]/g, '') // 한글도 허용
      .trim()
      .split(/\s+/)
      .map((word, index) => {
        if (index === 0) {
          return word.toLowerCase();
        }
        // 한글인 경우 그대로, 영어인 경우 첫 글자 대문자
        if (/[가-힣]/.test(word)) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('');

    // 컨텍스트별 접두사 추가
    const contextPrefix = this.getContextPrefix(context);

    return `${contextPrefix}.${cleanValue}`;
  }

  getContextPrefix(context) {
    const prefixMap = {
      'message.error': 'error',
      'message.success': 'success',
      'message.warning': 'warning',
      'message.info': 'info',
      'Message.error': 'error',
      'Message.success': 'success',
      'Message.warning': 'warning',
      alert: 'alert',
      confirm: 'confirm',
      title: 'title',
      description: 'description',
      label: 'label',
      placeholder: 'placeholder',
      tooltip: 'tooltip',
      helpText: 'help',
    };

    return prefixMap[context] || 'common';
  }

  getCalleeText(node) {
    if (node.type === 'MemberExpression') {
      return `${this.getCalleeText(node.object)}.${node.property.name}`;
    }
    if (node.type === 'Identifier') {
      return node.name;
    }
    return '';
  }

  isToastFunction(calleeText) {
    return this.options.toastFunctions.some((func) => {
      if (func.includes('*')) {
        const pattern = func.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(calleeText);
      }
      return calleeText === func;
    });
  }

  isUserFacingProperty(node) {
    if (node.key?.type === 'Identifier') {
      return this.options.objectProperties.includes(node.key.name);
    }
    if (node.key?.type === 'Literal') {
      return this.options.objectProperties.includes(node.key.value);
    }
    return false;
  }

  findHardcodedArguments(args) {
    return args.filter((arg) => this.isHardcodedValue(arg));
  }

  isHardcodedValue(node) {
    if (!node) return false;

    if (node.type === 'Literal' && typeof node.value === 'string') {
      return !this.isAllowedPattern(node.value);
    }

    if (node.type === 'TemplateLiteral') {
      if (node.expressions.length === 0) {
        const value = node.quasis[0]?.value?.raw || '';
        return !this.isAllowedPattern(value);
      }
    }

    if (node.type === 'JSXExpressionContainer') {
      return this.isHardcodedValue(node.expression);
    }

    return false;
  }

  isAllowedPattern(value) {
    if (!value || value.trim() === '') return true;

    return this.options.allowPatterns.some((pattern) => {
      if (pattern instanceof RegExp) {
        return pattern.test(value);
      }
      return value.includes(pattern);
    });
  }

  getStringValue(node) {
    if (node.type === 'Literal') {
      return node.value;
    }
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
      return node.quasis[0]?.value?.raw || '';
    }
    if (node.type === 'JSXExpressionContainer') {
      return this.getStringValue(node.expression);
    }
    return '[복잡한 표현식]';
  }
}
