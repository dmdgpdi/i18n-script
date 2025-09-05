#!/usr/bin/env node

import chalk from "chalk";
import EnhancedToastChecker from "./enhanced-toast-checker.mjs";
import JSXHardcodedChecker from "./jsx-hardcoded-checker.mjs";

class IntegratedHardcodingChecker {
	constructor(targetPath = "src") {
		this.targetPath = targetPath;
		this.jsxChecker = new JSXHardcodedChecker();
		this.toastChecker = new EnhancedToastChecker({
			// 프로젝트에 맞는 설정 커스터마이징
			toastFunctions: [
				// Ant Design message
				"message.error",
				"message.success",
				"message.warning",
				"message.info",
				"message.loading",

				// Kosmos message (프로젝트 고유)
				"Message.error",
				"Message.success",
				"Message.warning",
				"Message.info",

				// 기본 브라우저 API
				"alert",
				"confirm",
				"prompt",

				// 기타 가능한 알림 함수들
				"toast.error",
				"toast.success",
				"toast.warning",
				"toast.info",
				"notification.error",
				"notification.success",
				"notification.warning",
				"notification.info",
				"showMessage",
				"showError",
				"showSuccess",
				"showWarning",
			],
			objectProperties: [
				"title",
				"message",
				"description",
				"content",
				"label",
				"placeholder",
				"tooltip",
				"helpText",
				"errorMessage",
				"successMessage",
				"warningMessage",
				"text",
				"body",
				"detail",
			],
			allowPatterns: [
				/^t\(['"]/, // i18n 함수
				/^i18n\./, // i18n 객체
				/^\$\{.*\}$/, // 템플릿 변수
				/^(true|false|null|undefined)$/, // 기본값들
				/^\d+$/, // 숫자
				/^['"]?\s*['"]?$/, // 빈 문자열
				/^console\./, // console 로그 허용 (개발용)
				/^process\.env\./, // 환경변수 허용
				/^import\(/, // 동적 import
				/^require\(/, // require 함수
			],
		});

		this.startTime = null;
		this.stats = {
			filesScanned: 0,
			jsxErrors: 0,
			toastErrors: 0,
			totalErrors: 0,
		};
	}

	async runAllChecks(patterns = ["src/**/*.{js,jsx,ts,tsx}"]) {
		this.startTime = Date.now();

		// 패턴에서 디렉토리 부분만 추출하여 표시
		const displayPatterns = patterns.map((p) => {
			if (p.startsWith("!")) {
				return `!${p.replace("/**/*.{js,jsx,ts,tsx}", "").replace("!", "")}`;
			}
			return p.replace("/**/*.{js,jsx,ts,tsx}", "") || "src";
		});

		console.log(chalk.cyan.bold("🚀 통합 하드코딩 검사 시작\n"));
		console.log(chalk.gray(`검사 대상: ${displayPatterns.join(" ")}`));
		console.log(chalk.gray("검사 범위: JSX 컴포넌트 + Toast/알림 함수"));
		console.log(chalk.gray("=" * 60));

		const results = {
			jsx: false,
			toast: false,
			overall: false,
		};

		try {
			// 1. JSX 하드코딩 검사
			console.log(chalk.blue("\n📋 1단계: JSX 컴포넌트 하드코딩 검사"));
			console.log(chalk.gray("검사 대상: React/JSX 컴포넌트의 텍스트 및 속성"));
			results.jsx = await this.jsxChecker.checkJSXHardcoding(patterns);

			// 2. Toast/알림 하드코딩 검사
			console.log(chalk.blue("\n📋 2단계: Toast/알림 하드코딩 검사"));
			console.log(chalk.gray("검사 대상: message.error, alert, 객체 속성 등"));
			results.toast = await this.toastChecker.checkFiles(patterns);

			// 결과 요약
			results.overall = results.jsx && results.toast;
			this.printSummary(results);

			if (!results.overall) {
				process.exit(1);
			}
		} catch (error) {
			console.error(chalk.red("\n❌ 검사 중 오류 발생:"), error);
			console.error(chalk.gray(error.stack));
			process.exit(1);
		}
	}

	printSummary(results) {
		const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);

		console.log(chalk.gray("\n" + "=".repeat(60)));
		console.log(chalk.cyan.bold("📊 검사 결과 요약"));
		console.log(chalk.gray("-".repeat(30)));

		const jsxStatus = results.jsx
			? chalk.green("✅ 통과")
			: chalk.red("❌ 실패");
		const toastStatus = results.toast
			? chalk.green("✅ 통과")
			: chalk.red("❌ 실패");

		console.log(`${chalk.blue("JSX 하드코딩 검사:")}      ${jsxStatus}`);
		console.log(`${chalk.blue("Toast/알림 검사:")}       ${toastStatus}`);
		console.log(chalk.gray("-".repeat(30)));
		console.log(`${chalk.blue("검사 소요 시간:")}        ${duration}초`);
		console.log(chalk.gray("-".repeat(30)));

		if (results.overall) {
			console.log(chalk.green.bold("🎉 모든 하드코딩 검사 통과!"));
			console.log(chalk.green("국제화(i18n) 준비가 잘 되어있습니다."));
		} else {
			console.log(chalk.red.bold("🚨 하드코딩이 발견되었습니다!"));
			console.log(chalk.yellow("위의 에러들을 수정한 후 다시 실행해주세요."));
		}

		console.log(chalk.gray("=".repeat(60)));
	}

	// CLI 명령어 처리
	static async handleCLI() {
		const args = process.argv.slice(2);

		// 경로 패턴 파싱 (여러 패턴 지원)
		let targetPatterns = [];
		const options = [];

		// 기본값은 인수가 없을 때만 사용
		if (args.length === 0) {
			targetPatterns = ["src/**/*.{js,jsx,ts,tsx}"];
		}

		for (const arg of args) {
			if (arg.startsWith("--") || arg.startsWith("-")) {
				options.push(arg);
			} else {
				// 모든 비옵션 인수를 패턴으로 추가
				let pattern = arg;

				// 자동 패턴 추가 (제외 패턴이 아닌 경우만)
				if (!pattern.startsWith("!") && !pattern.includes("**/*")) {
					pattern = `${pattern}/**/*.{js,jsx,ts,tsx}`;
				}

				targetPatterns.push(pattern);
			}
		}

		// 디버깅 로그 추가
		console.log(chalk.gray(`🔍 파싱된 패턴: [${targetPatterns.join(", ")}]`));
		console.log(chalk.gray(`🔍 옵션: [${options.join(", ")}]`));

		const checker = new IntegratedHardcodingChecker();

		if (options.includes("--help") || options.includes("-h")) {
			console.log(
				chalk.cyan(`
🔍 하드코딩 검사 도구 (ESM 버전)

사용법:
  node i18n_script/check-all-hardcoding.mjs [경로패턴...] [옵션]

인수:
  경로패턴           검사할 경로 패턴 (여러 개 가능)
  !경로패턴          제외할 경로 패턴

옵션:
  --help, -h        도움말 표시
  --jsx-only        JSX 검사만 실행
  --toast-only      Toast/알림 검사만 실행
  --verbose, -v     상세한 로그 출력

예시:
  node i18n_script/check-all-hardcoding.mjs                                    # src 검사
  node i18n_script/check-all-hardcoding.mjs src !src/test                     # src 검사하되 test 제외
  node i18n_script/check-all-hardcoding.mjs components !components/legacy     # components 검사하되 legacy 제외
        `),
			);
			return;
		}

		if (options.includes("--jsx-only")) {
			console.log(chalk.blue(`🔍 JSX 하드코딩 검사만 실행\n`));
			console.log(chalk.gray(`패턴: ${targetPatterns.join(" ")}`));
			const result =
				await checker.jsxChecker.checkJSXHardcoding(targetPatterns);
			process.exit(result ? 0 : 1);
			return;
		}

		if (options.includes("--toast-only")) {
			console.log(chalk.blue(`🔍 Toast/알림 하드코딩 검사만 실행\n`));
			console.log(chalk.gray(`패턴: ${targetPatterns.join(" ")}`));
			const result = await checker.toastChecker.checkFiles(targetPatterns);
			process.exit(result ? 0 : 1);
			return;
		}

		// 기본: 모든 검사 실행
		await checker.runAllChecks(targetPatterns);
	}
}

// CLI 실행
if (import.meta.url === `file://${process.argv[1]}`) {
	IntegratedHardcodingChecker.handleCLI().catch((error) => {
		console.error(chalk.red("❌ 예상치 못한 오류:"), error);
		process.exit(1);
	});
}

export default IntegratedHardcodingChecker;
