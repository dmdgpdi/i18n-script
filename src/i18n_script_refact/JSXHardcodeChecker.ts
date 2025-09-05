import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { JSXElement } from "@babel/types";
import chalk from "chalk";
import fs from "fs";
import { glob } from "glob";
import {
	errAsync,
	okAsync,
	ResultAsync,
} from "neverthrow";
import { ErrorReporter } from "./ErrorReporter";
import type { CodeError, IErrorReporter } from "./ErrorReporter.interface";
import type {
	IJSXHardcodeChecker,
	JSXNode,
	Options,
} from "./JSXHardcodeChecker.interface";

export default class JSXHardcodeChecker implements IJSXHardcodeChecker {
	private reporter: IErrorReporter;
	private options: Options;
	constructor(reporter = new ErrorReporter(), options: Options) {
		this.options = options;
		this.reporter = reporter;
	}
	
	public async checkJSXHardcode(patterns: string[]) {
		console.log(chalk.blue("🔍 JSX 하드코딩 검사 시작...\n"));

		const { includePatterns, excludePatterns } = this.getPatterns(patterns);
		console.log(chalk.gray(`📋 포함 패턴: [${includePatterns.join(", ")}]`));
		console.log(chalk.gray(`📋 제외 패턴: [${excludePatterns.join(", ")}]`));

		const filesResult = await this.getFiles({
			includePatterns,
			excludePatterns,
		});

		if (filesResult.isErr()) {
			console.error(
				chalk.red("❌ JSX 검사 중 오류 발생:"),
				filesResult.error.message,
			);
			return;
		}

		const files = filesResult.value;
		console.log(chalk.gray(`📊 검사 대상: ${files.length}개 파일`));

		const allErrors = [];

		for (const file of files) {
			const result = await this.checkFile(file);

			if (result.isErr()) {
				console.error(
					chalk.yellow(`⚠️  파싱 에러 in ${file}: ${result.error.message}`),
				);
				return;
			}

			const errors = result.value;
			allErrors.push(...errors);
			errors.forEach((error) => {
				this.reporter.addCodeError(file, error);
			});
		}

		if (allErrors.length === 0) {
			console.log(chalk.green("✅ JSX 하드코딩 검사 통과!"));
			return;
		} else {
			console.log(chalk.red("❌ JSX 하드코딩 검사 실패!"));
			this.reporter.printReport();
			return;
		}
	}

	/**
	 * @description 노드의 옵션을 가져옵니다.
	 */
	private getOptionsForNode(node: JSXElement) {
		const name = node.openingElement.name;

		if (name.type === "JSXIdentifier") {
			const tagName = name.name;

			// DOM 요소인지 확인 (소문자로 시작)
			if (tagName && tagName[0] === tagName[0].toLowerCase()) {
				return this.options.dom[tagName] || this.options;
			}

			// React 컴포넌트 - 간단하게 기본 옵션 사용
			return this.options;
		}

		// JSXMemberExpression인 경우 (예: <React.Fragment>, <MyComponent.SubComponent>)
		// 또는 다른 타입인 경우 기본 옵션 반환
		return this.options;
	}

	private checkChildren(node: JSXElement, options: Partial<Options>) {
		const errors: CodeError[] = [];
		const { allowStrings = false, allowNumbers = true } = options;

		node.children.forEach((child) => {
			if (this.isInvalidContent(child, { allowStrings, allowNumbers })) {
				const errorInfo: CodeError = {
					line: child.loc?.start.line || 0,
					column: child.loc?.start.column || 0,
					message: `하드코딩된 JSX 텍스트 콘텐츠`,
					type: "jsx-children",
					value: this.getStringValue(child),
					codeSnippet: "",
				};
				errors.push(errorInfo);
			}
		});

		return errors;
	}

	private isInvalidContent(node: JSXNode, options: Partial<Options>): boolean {
		if (!node) return false;

		const { allowStrings = false, allowNumbers = true } = options;

		if (node.type === "JSXText") {
			const value = node.value.trim();
			if (!value) return false;
			return !allowStrings;
		}

		if ("value" in node) {
			if (typeof node.value === "string") {
				const value = node.value.trim();
				if (!value) return false;
				return !allowStrings;
			}
			if (typeof node.value === "number") {
				return !allowNumbers;
			}
		}

		if (node.type === "TemplateLiteral") {
			return !allowStrings;
		}

		if (node.type === "JSXExpressionContainer") {
			return this.isInvalidContent(node.expression, {
				allowStrings,
				allowNumbers,
			});
		}

		return false;
	}

	private getStringValue(node: JSXNode): string {
		if (!node) return "";

		if (node.type === "JSXText") {
			return node.value;
		}

		if (node.type === "JSXExpressionContainer") {
			return this.getStringValue(node.expression);
		}

		if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
			return node.quasis[0]?.value?.raw || "";
		}
		if ("value" in node) {
			if (typeof node.value === "string") {
				return String(node.value);
			}

			return "[복잡한 표현식]";
		}

		return "[복잡한 표현식]";
	}

	private checkProps(node: JSXElement, options: Partial<Options>): CodeError[] {
		const errors: CodeError[] = [];
		const {
			checkProps = [],
			allowStrings = false,
			allowNumbers = true,
		} = options;

		if (node.openingElement.attributes.length === 0) {
			return [];
		}

		for(const attr of node.openingElement.attributes) {
			if (attr.type !== "JSXAttribute") {
				continue;
			}
			
			if (
				checkProps.includes(String(attr.name?.name ?? "")) &&
				this.isInvalidContent(attr.value, { allowStrings, allowNumbers })
			) {
				const errorInfo: CodeError = {
					line: attr.value?.loc?.start.line || attr.loc?.start.line || 0,
					column: attr.value?.loc?.start.column || attr.loc?.start.column || 0,
					message: `하드코딩된 JSX 속성 "${attr.name.name}"`,
					type: "jsx-prop",
					value: this.getStringValue(attr.value),
					codeSnippet: "",
				};

				errors.push(errorInfo);
			}
		}

		return errors;
	}

	private checkFile(filePath: string): ResultAsync<CodeError[], Error> {
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			return okAsync([]);
		}

		const code = fs.readFileSync(filePath, "utf8");
		const errors: CodeError[] = [];

		try {
			const ast = parse(code, {
				sourceType: "module",
				plugins: ["jsx", "typescript", "decorators-legacy"],
			});

			traverse(ast, {
				JSXElement: (path) => {
					const { node } = path;
					const options = this.getOptionsForNode(node);

					// children 검사
					const childrenErrors = this.checkChildren(node, options);
					errors.push(...childrenErrors);

					// props 검사
					const propErrors = this.checkProps(node, options);
					errors.push(...propErrors);
				},
			});
		} catch (error) {
			return errAsync(this.getError(error));
		}

		return okAsync(errors);
	}

	private getPatterns(patterns: string[]) {
		const includePatterns = patterns.filter((p) => !p.startsWith("!"));
		const excludePatterns = patterns
			.filter((p) => p.startsWith("!"))
			.map((p) => p.substring(1)); // ! 제거

		return { includePatterns, excludePatterns };
	}

	private getError(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}

		return new Error("Unknown error");
	}

	private getFiles({
		includePatterns: includePatternParam,
		excludePatterns: excludePatternParam = [],
	}: {
		includePatterns: string[];
		excludePatterns?: string[];
	}) {
		const { includePatterns, excludePatterns } =
			this.getPatterns(includePatternParam);
		const allIgnores = [...excludePatterns, ...excludePatternParam];

		return ResultAsync.fromPromise(
			glob(includePatterns, { ignore: allIgnores }),
			(error) => this.getError(error),
		);
	}
}
