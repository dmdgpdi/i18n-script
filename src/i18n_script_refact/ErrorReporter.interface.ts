export interface CodeError {

  /**
   * 에러가 발생한 줄
   */
  line: number;

  /**
   * 에러가 발생한 열
   */
  column: number;

  /**
  * 에러 메시지
  */
  message: string;

  /**
   * 에러 타입
   */
  type: string;
  
  /**
   * 에러 값
   */
  value: string;

  /**
   * 코드 스니펫 (에러 위치 표시)
   */
  codeSnippet: string;
}


export interface IErrorReporter {
  addCodeError(filePath: string, error: CodeError): void;
  printReport(): void;
}

