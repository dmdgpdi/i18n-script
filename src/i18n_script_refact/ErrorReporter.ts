import { codeFrameColumns } from "@babel/code-frame";
import chalk from "chalk";
import fs from "fs";
import type { CodeError, IErrorReporter } from "./ErrorReporter.interface";

export class ErrorReporter implements IErrorReporter {
	private fileCache: Map<string, string>;
	private fileErrors: Map<string, CodeError[]>;

	private codeErrors: CodeError[];

	constructor() {
		this.fileCache = new Map();
		this.fileErrors = new Map();
		this.codeErrors = [];
	}

	private getFileLines(filePath: string) {
		if (!this.fileCache.has(filePath)) {
			try {
				const content = fs.readFileSync(filePath, "utf8");
				this.fileCache.set(filePath, content);
			} catch {
				console.warn(chalk.yellow(`⚠️  파일을 읽을 수 없습니다: ${filePath}`));
				this.fileCache.set(filePath, "");
			}
		}
		return this.fileCache.get(filePath) || "";
	}

	private generateCodeSnippet(
		filePath: string,
		line: number,
		column: number,
	): string {
		try {
			const content = this.getFileLines(filePath);
			return codeFrameColumns(
				content,
				{
					start: { line, column },
				},
				{
					highlightCode: true,
					linesAbove: 2,
					linesBelow: 2,
				},
			);
		} catch {
			return chalk.red(`⚠️  코드 스니펫을 생성할 수 없습니다: ${filePath}`);
		}
	}

	private formatError(error: CodeError, filePath: string): CodeError {
		const codeSnippet = this.generateCodeSnippet(
			filePath,
			error.line,
			error.column,
		);

		return {
			...error,
			codeSnippet,
		};
	}

	public addCodeError(filePath: string, error: CodeError): void {
		if (!this.fileErrors.has(filePath)) {
			this.fileErrors.set(filePath, []);
		}

		// formatError를 호출하여 코드 스니펫과 컨텍스트 생성
		const formattedError = this.formatError(error, filePath);

		const newErrors = this.fileErrors.get(filePath) || [];
		newErrors.push(formattedError);
		this.codeErrors.push(formattedError);
		this.fileErrors.set(filePath, newErrors);
	}

	private generateErrorReport(): string {
		const totalErrorCount = this.fileErrors.size;
		const report: string[] = [];

		report.push(
			chalk.red.bold(`🚨 총 ${totalErrorCount}개의 하드코딩 발견!\n`),
		);

		Object.entries(this.fileErrors).forEach(([filePath, fileErrors]) => {
			report.push(
				chalk.yellow.bold(`📁 ${filePath} (${fileErrors.length}개 에러)`),
			);
			report.push(chalk.gray("─".repeat(80)));

			fileErrors.forEach((error: CodeError, index: number) => {
				report.push(
					`\n${chalk.red("Error " + (index + 1) + ":")} ${error.message}`,
				);

				report.push(error.codeSnippet);

				if (index < fileErrors.length - 1) {
					report.push(""); // 에러간 공백
				}
			});

			report.push("\n" + chalk.gray("─".repeat(80)) + "\n");
		});

		return report.join("\n");
	}

	public printReport() {
		if (this.codeErrors.length === 0) {
			console.log(chalk.green("✅ 하드코딩된 콘텐츠가 발견되지 않았습니다!"));
			return;
		}

		const errorReport = this.generateErrorReport();
		console.log(errorReport);
	}

	public hasErrors(): boolean {
		return this.codeErrors.length > 0;
	}
}
