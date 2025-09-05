// Jest 설정 파일
// 테스트 환경에서 console.log를 모킹하지 않도록 설정
global.console = {
	...console,
	// console.log는 그대로 유지
	log: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
};
