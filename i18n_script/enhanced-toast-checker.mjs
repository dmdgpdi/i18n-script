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
        
        // 기본 message 함수
        'message',
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
          const calleeText = this.getCalleeText(path.node.callee);

          if (this.isToastFunction(calleeText)) {
            const hardcodedArgs = this.findHardcodedArguments(path.node.arguments);

            hardcodedArgs.forEach((arg) => {
              // 🆕 객체 인수인 경우 상세 정보 제공
              if (arg.type === 'ObjectExpression') {
                const objectErrors = this.getObjectPropertyErrors(arg, calleeText, filePath);
                errors.push(...objectErrors);
              } else {
                // 기존 단순 인수 처리
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
              }
            });
          }
        },

        // 객체 속성 검사 (상세 정보 포함) - 함수 호출 외부의 객체만
        ObjectProperty: (path) => {
          // 🚫 임시로 ObjectProperty 검사 비활성화
          // CallExpression에서 객체 인수를 처리하므로 중복 방지
          // 함수 호출 외부의 객체 속성은 별도로 처리 필요
          return;
          
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

    if ((node.type === 'Literal' || node.type === 'StringLiteral') && typeof node.value === 'string') {
      return !this.isAllowedPattern(node.value);
    }

    if (node.type === 'TemplateLiteral') {
      if (node.expressions.length === 0) {
        // 표현식이 없는 순수 템플릿 리터럴
        const value = node.quasis[0]?.value?.raw || '';
        return !this.isAllowedPattern(value);
      } else {
        // 🆕 표현식이 있는 템플릿 리터럴 - 정적 부분이 충분한 경우만 하드코딩으로 간주
        return this.hasSignificantStaticContent(node);
      }
    }

    if (node.type === 'JSXExpressionContainer') {
      return this.isHardcodedValue(node.expression);
    }

    // 🆕 ObjectExpression 처리 추가
    if (node.type === 'ObjectExpression') {
      return this.hasHardcodedObjectProperties(node);
    }

    // 🆕 ArrayExpression 처리 추가 (객체 배열)
    if (node.type === 'ArrayExpression') {
      return node.elements.some(element => 
        element && this.isHardcodedValue(element)
      );
    }

    return false;
  }

  // 🆕 템플릿 리터럴의 정적 부분이 충분한지 확인
  hasSignificantStaticContent(templateLiteralNode) {
    if (!templateLiteralNode || templateLiteralNode.type !== 'TemplateLiteral') {
      return false;
    }

    const MIN_STATIC_LENGTH = 3; // 최소 정적 부분 길이 (3글자 이상)
    
    // 모든 정적 부분(quasis)의 길이를 합산
    const totalStaticLength = templateLiteralNode.quasis.reduce((total, quasi) => {
      const staticText = quasi.value.raw || '';
      return total + staticText.length;
    }, 0);

    // 정적 부분이 충분히 긴 경우만 하드코딩으로 간주
    return totalStaticLength >= MIN_STATIC_LENGTH;
  }

  // 🆕 객체 속성 하드코딩 검사 메서드
  hasHardcodedObjectProperties(objectNode) {
    if (!objectNode || objectNode.type !== 'ObjectExpression') {
      return false;
    }

    return objectNode.properties.some(prop => {
      if (prop.type === 'ObjectProperty') {
        // 사용자 대면 속성인지 확인
        if (this.isUserFacingProperty(prop)) {
          // 하드코딩된 값인지 확인
          return this.isHardcodedValue(prop.value);
        }
      }
      
      // SpreadElement 처리 (예: {...config})
      if (prop.type === 'SpreadElement') {
        // 스프레드된 객체도 검사
        return this.isHardcodedValue(prop.argument);
      }
      
      return false;
    });
  }

  // 🆕 Toast 함수 호출 내부인지 확인
  isInsideToastFunctionCall(path) {
    let currentPath = path.parent;
    
    while (currentPath && currentPath.node) {
      if (currentPath.node.type === 'CallExpression') {
        const calleeText = this.getCalleeText(currentPath.node.callee);
        if (this.isToastFunction(calleeText)) {
          return true;
        }
      }
      currentPath = currentPath.parent;
    }
    
    return false;
  }

  // 🆕 ObjectExpression이 함수 호출의 인수인지 확인
  isObjectExpressionInFunctionCall(objectExpressionNode) {
    // ObjectExpression의 부모가 CallExpression의 arguments 배열에 포함되어 있는지 확인
    // 이는 AST 구조상 직접적으로 확인하기 어려우므로, 
    // ObjectExpression이 CallExpression의 직접적인 자식인지 확인
    return false; // 일단 false로 설정하여 모든 ObjectExpression을 ObjectProperty에서 처리
  }

  // 🆕 객체 속성별 에러 정보 생성
  getObjectPropertyErrors(objectNode, functionName, filePath) {
    const errors = [];
    
    if (!objectNode || objectNode.type !== 'ObjectExpression') {
      return errors;
    }

    objectNode.properties.forEach(prop => {
      if (prop.type === 'ObjectProperty' && 
          this.isUserFacingProperty(prop) && 
          this.isHardcodedValue(prop.value)) {
        
        const propertyName = prop.key.name || prop.key.value;
        const errorInfo = {
          line: prop.value.loc?.start.line || prop.loc?.start.line || 0,
          column: prop.value.loc?.start.column || prop.loc?.start.column || 0,
          message: `하드코딩된 ${functionName} 객체 속성 "${propertyName}"`,
          type: 'toast-object-property',
          value: this.getStringValue(prop.value),
          functionName: functionName,
          propertyName: propertyName,
          suggestion: `${propertyName}: t('${this.suggestKey(propertyName, this.getStringValue(prop.value))}')`,
        };

        const enhancedError = this.reporter.formatError(errorInfo, filePath);
        errors.push(enhancedError);
      }
    });

    return errors;
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
    if (node.type === 'Literal' || node.type === 'StringLiteral') {
      return node.value;
    }
    if (node.type === 'TemplateLiteral') {
      if (node.expressions.length === 0) {
        // 표현식이 없는 순수 템플릿 리터럴
        return node.quasis[0]?.value?.raw || '';
      } else {
        // 🆕 표현식이 있는 템플릿 리터럴 - 정적 부분만 추출
        const staticParts = node.quasis.map(quasi => quasi.value.raw || '').join('');
        return staticParts || '[템플릿 리터럴]';
      }
    }
    if (node.type === 'JSXExpressionContainer') {
      return this.getStringValue(node.expression);
    }
    return '[복잡한 표현식]';
  }
}
