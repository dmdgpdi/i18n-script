import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default || _traverse;

import chalk from "chalk";
import fs from "fs";
import { glob } from "glob";
import EnhancedErrorReporter from "./enhanced-error-reporter.mjs";

export default class JSXHardcodedChecker {
	constructor() {
		this.reporter = new EnhancedErrorReporter();

		// JSX 검사 설정
		this.options = {
			allowStrings: false,
			allowNumbers: true,
			checkProps: ["title", "aria-label", "alt", "placeholder"],
			dom: {
				img: {
					checkProps: ["alt", "title", "aria-label"],
				},
				input: {
					checkProps: ["placeholder", "title", "aria-label"],
				},
				button: {
					checkProps: ["title", "aria-label"],
				},
				a: {
					checkProps: ["title", "aria-label"],
				},
				area: {
					checkProps: ["alt", "title", "aria-label"],
				},
			},
			// 프로젝트 특정 모듈 설정
			/**
         * @description 특정 라이브러리 모듈을 검사하고 싶다면 다음과 같이 하세요.
         * @example
         * antd: {
          Button: {
            allowStrings: false,
            checkProps: ['children'],
          },
          Input: {
            allowStrings: false,
            checkProps: ['placeholder', 'addonBefore', 'addonAfter'],
          },
          Modal: {
            allowStrings: false,
            checkProps: ['title', 'children'],
          },
          Tooltip: {
            allowStrings: false,
            checkProps: ['title', 'children'],
          },
        },
         */
			modules: {},
		};
	}

	async checkJSXHardcoding(patterns = ["src/**/*.{js,jsx,ts,tsx}"]) {
		console.log(chalk.blue("🔍 JSX 하드코딩 검사 시작...\n"));

		// 패턴에서 포함/제외 분리
		const includePatterns = patterns.filter((p) => !p.startsWith("!"));
		const excludePatterns = patterns
			.filter((p) => p.startsWith("!"))
			.map((p) => p.substring(1)); // ! 제거

		const defaultIgnores = [
			"**/*.test.{js,jsx,ts,tsx}",
			"**/*.stories.{js,jsx,ts,tsx}",
			"**/*.spec.{js,jsx,ts,tsx}",
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
		];

		const allIgnores = [...defaultIgnores, ...excludePatterns];

		console.log(chalk.gray(`📋 포함 패턴: [${includePatterns.join(", ")}]`));
		console.log(chalk.gray(`📋 제외 패턴: [${excludePatterns.join(", ")}]`));

		try {
			const files = await glob(includePatterns, {
				ignore: allIgnores,
			});
			console.log(chalk.gray(`📊 검사 대상: ${files.length}개 파일`));

			const allErrors = [];

			for (const file of files) {
				const errors = await this.checkFile(file);
				allErrors.push(...errors);
			}

			if (allErrors.length === 0) {
				console.log(chalk.green("✅ JSX 하드코딩 검사 통과!"));
				return true;
			} else {
				const report = this.reporter.generateReport(allErrors);
				console.log(report);
				return false;
			}
		} catch (error) {
			console.error(chalk.red("❌ JSX 검사 중 오류 발생:"), error.message);
			return false;
		}
	}

	async checkFile(filePath) {
		// 디렉토리인지 확인
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			return [];
		}

		const code = fs.readFileSync(filePath, "utf8");
		const errors = [];

		try {
			const ast = parse(code, {
				sourceType: "module",
				plugins: ["jsx", "typescript", "decorators-legacy"],
			});

			traverse(ast, {
				JSXElement: (path) => {
					const { node } = path;
					const options = this.getOptionsForNode(node);

					// 자식 요소 검사
					const childrenErrors = this.checkChildren(node, options, filePath);
					errors.push(...childrenErrors);

					// 속성 검사
					const propErrors = this.checkProps(node, options, filePath);
					errors.push(...propErrors);
				},
			});
		} catch (error) {
			console.error(
				chalk.yellow(`⚠️  파싱 에러 in ${filePath}: ${error.message}`),
			);
		}

		return errors;
	}

	getOptionsForNode(node) {
		const tagName = node.openingElement.name.name;

		// DOM 요소인지 확인 (소문자로 시작)
		if (tagName && tagName[0] === tagName[0].toLowerCase()) {
			// DOM 요소
			return this.options.dom[tagName] || this.options;
		}

		// React 컴포넌트 - 간단하게 기본 옵션 사용
		return this.options;
	}

	checkChildren(node, options, filePath) {
		const errors = [];
		const { allowStrings = false, allowNumbers = true } = options;

		node.children.forEach((child) => {
			if (this.isInvalidContent(child, { allowStrings, allowNumbers })) {
				const errorInfo = {
					line: child.loc?.start.line || 0,
					column: child.loc?.start.column || 0,
					message: `하드코딩된 JSX 텍스트 콘텐츠`,
					type: "jsx-children",
					value: this.getStringValue(child),
					suggestion: `{t('componentName.text')}로 교체하세요`,
				};

				const enhancedError = this.reporter.formatError(errorInfo, filePath);
				errors.push(enhancedError);
			}
		});

		return errors;
	}

	checkProps(node, options, filePath) {
		const errors = [];
		const {
			checkProps = [],
			allowStrings = false,
			allowNumbers = true,
		} = options;

		if (node.openingElement.attributes) {
			node.openingElement.attributes.forEach((attr) => {
				if (
					attr.type === "JSXAttribute" &&
					checkProps.includes(attr.name.name) &&
					this.isInvalidContent(attr.value, { allowStrings, allowNumbers })
				) {
					const errorInfo = {
						line: attr.value?.loc?.start.line || attr.loc?.start.line || 0,
						column:
							attr.value?.loc?.start.column || attr.loc?.start.column || 0,
						message: `하드코딩된 JSX 속성 "${attr.name.name}"`,
						type: "jsx-prop",
						value: this.getStringValue(attr.value),
						suggestion: `${attr.name.name}={t('${attr.name.name}.key')}로 교체하세요`,
					};

					const enhancedError = this.reporter.formatError(errorInfo, filePath);
					errors.push(enhancedError);
				}
			});
		}

		return errors;
	}

	isInvalidContent(node, { allowStrings = false, allowNumbers = true }) {
		if (!node) return false;

		// JSXText 노드
		if (node.type === "JSXText") {
			const value = node.value.trim();
			if (!value) return false; // 빈 텍스트는 허용
			return !allowStrings;
		}

		// Literal 노드
		if (node.type === "Literal") {
			if (typeof node.value === "string") {
				const value = node.value.trim();
				if (!value) return false; // 빈 문자열은 허용
				return !allowStrings;
			}
			if (typeof node.value === "number") {
				return !allowNumbers;
			}
		}

		// TemplateLiteral 노드
		if (node.type === "TemplateLiteral") {
			return !allowStrings;
		}

		// JSXExpressionContainer 노드
		if (node.type === "JSXExpressionContainer") {
			return this.isInvalidContent(node.expression, {
				allowStrings,
				allowNumbers,
			});
		}

		return false;
	}

	getStringValue(node) {
		if (!node) return "";

		if (node.type === "JSXText") {
			return node.value;
		}
		if (node.type === "Literal") {
			return String(node.value);
		}
		if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
			return node.quasis[0]?.value?.raw || "";
		}
		if (node.type === "JSXExpressionContainer") {
			return this.getStringValue(node.expression);
		}

		return "[복잡한 표현식]";
	}
}
