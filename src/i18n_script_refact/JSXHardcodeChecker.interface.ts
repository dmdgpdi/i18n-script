import type {
	Expression,
	JSXEmptyExpression,
	JSXExpressionContainer,
	JSXFragment,
	JSXSpreadChild,
	JSXText,
	Literal,
	TemplateLiteral,
} from "@babel/types";

export interface Options {
	allowStrings: boolean;
	allowNumbers: boolean;
	checkProps: string[];
	dom: {
		[key: string]: {
			checkProps: string[];
		};
	};
	modules: {
		[key: string]: {
			[key: string]: {
				allowStrings: boolean;
				checkProps: string[];
			};
		};
	};
}

export type JSXNode =
	| Expression
	| JSXEmptyExpression
	| JSXText
	| JSXExpressionContainer
	| JSXSpreadChild
	| JSXFragment
	| Literal
	| TemplateLiteral
	| undefined
	| null;

export interface IJSXHardcodeChecker {
	checkJSXHardcode(patterns: string[]): void;
}
