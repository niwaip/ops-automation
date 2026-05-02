/**
 * Carbone Engine - Marker Tokenizer
 * 词法分析器，用于解析Carbone标记表达式
 * 支持复杂格式化参数、嵌套函数、转义字符
 */

export enum TokenType {
  // 结构标记
  MARKER_START = 'MARKER_START',       // {
  MARKER_END = 'MARKER_END',           // }
  LOOP_START = 'LOOP_START',           // {#
  LOOP_END = 'LOOP_END',               // {/

  // 路径元素
  CONTEXT_PREFIX = 'CONTEXT_PREFIX',   // d. c. t.
  IDENTIFIER = 'IDENTIFIER',           // name, items
  DOT = 'DOT',                         // .
  ARRAY_INDEX = 'ARRAY_INDEX',         // [i], [i+1], [0]

  // 格式化器
  COLON = 'COLON',                     // :
  FORMATTER_NAME = 'FORMATTER_NAME',   // formatNumber
  LPAREN = 'LPAREN',                   // (
  RPAREN = 'RPAREN',                   // )
  COMMA = 'COMMA',                     // ,
  STRING = 'STRING',                   // "value", 'value'
  NUMBER = 'NUMBER',                   // 123, 3.14

  // 其他
  TEXT = 'TEXT',                       // 纯文本
  EOF = 'EOF',
  ERROR = 'ERROR'
}

export interface Token {
  type: TokenType;
  value: string;
  position: { start: number; end: number };
}

export interface LexerState {
  position: number;
  currentChar: string | null;
  inMarker: boolean;
  braceDepth: number;
  parenDepth: number;
}

/**
 * Tokenizer类 - 词法分析器
 */
export class MarkerTokenizer {
  private state: LexerState;
  private input: string;
  private tokens: Token[];

  constructor() {
    this.state = {
      position: 0,
      currentChar: null,
      inMarker: false,
      braceDepth: 0,
      parenDepth: 0
    };
    this.input = '';
    this.tokens = [];
  }

  /**
   * 标记化输入字符串
   */
  tokenize(input: string): Token[] {
    this.input = input;
    this.tokens = [];
    this.state = {
      position: 0,
      currentChar: input[0] || null,
      inMarker: false,
      braceDepth: 0,
      parenDepth: 0
    };

    while (this.state.currentChar !== null) {
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      position: { start: this.state.position, end: this.state.position }
    });

    return this.tokens;
  }

  /**
   * 扫描下一个token
   */
  private scanToken(): void {
    const char = this.state.currentChar;

    // 检查标记开始
    if (char === '{') {
      this.handleBraceStart();
      return;
    }

    // 检查标记结束
    if (char === '}' && this.state.inMarker) {
      this.handleBraceEnd();
      return;
    }

    // 在标记内部
    if (this.state.inMarker) {
      this.scanMarkerContent();
      return;
    }

    // 纯文本
    this.scanText();
  }

  /**
   * 处理花括号开始
   */
  private handleBraceStart(): void {
    const startPos = this.state.position;
    const nextChar = this.peek(1);

    // 检查循环开始 {#
    if (nextChar === '#') {
      this.addToken(TokenType.LOOP_START, '{#', startPos, startPos + 2);
      this.advance(2);
      this.state.inMarker = true;
      this.state.braceDepth = 1;
      return;
    }

    // 检查循环结束 {/
    if (nextChar === '/') {
      this.addToken(TokenType.LOOP_END, '{/', startPos, startPos + 2);
      this.advance(2);
      this.state.inMarker = true;
      this.state.braceDepth = 1;
      return;
    }

    // 普通标记开始
    this.addToken(TokenType.MARKER_START, '{', startPos, startPos + 1);
    this.advance(1);
    this.state.inMarker = true;
    this.state.braceDepth = 1;
  }

  /**
   * 处理花括号结束
   */
  private handleBraceEnd(): void {
    const startPos = this.state.position;
    this.addToken(TokenType.MARKER_END, '}', startPos, startPos + 1);
    this.advance(1);
    this.state.inMarker = false;
    this.state.braceDepth = 0;
  }

  /**
   * 扫描标记内容
   */
  private scanMarkerContent(): void {
    const char = this.state.currentChar;

    if (!char) return;

    // 上下文前缀 d. c. t.
    if (/[dct]/.test(char) && this.peek(1) === '.') {
      const startPos = this.state.position;
      this.addToken(TokenType.CONTEXT_PREFIX, char + '.', startPos, startPos + 2);
      this.advance(2);
      return;
    }

    // 点号
    if (char === '.') {
      this.addToken(TokenType.DOT, '.', this.state.position, this.state.position + 1);
      this.advance(1);
      return;
    }

    // 冒号（格式化器分隔符）
    if (char === ':') {
      this.addToken(TokenType.COLON, ':', this.state.position, this.state.position + 1);
      this.advance(1);
      return;
    }

    // 左括号
    if (char === '(') {
      this.addToken(TokenType.LPAREN, '(', this.state.position, this.state.position + 1);
      this.advance(1);
      this.state.parenDepth++;
      return;
    }

    // 右括号
    if (char === ')') {
      this.addToken(TokenType.RPAREN, ')', this.state.position, this.state.position + 1);
      this.advance(1);
      this.state.parenDepth--;
      return;
    }

    // 逗号
    if (char === ',') {
      this.addToken(TokenType.COMMA, ',', this.state.position, this.state.position + 1);
      this.advance(1);
      return;
    }

    // 数组索引 [i], [i+1], [0]
    if (char === '[') {
      this.scanArrayIndex();
      return;
    }

    // 字符串
    if (char === '"' || char === "'") {
      this.scanString();
      return;
    }

    // 数字
    if (/[0-9]/.test(char)) {
      this.scanNumber();
      return;
    }

    // 标识符
    if (/[a-zA-Z_]/.test(char)) {
      this.scanIdentifier();
      return;
    }

    // 空白字符跳过
    if (/\s/.test(char)) {
      this.advance(1);
      return;
    }

    // 未知字符
    this.addToken(TokenType.ERROR, char, this.state.position, this.state.position + 1);
    this.advance(1);
  }

  /**
   * 扫描数组索引
   */
  private scanArrayIndex(): void {
    const startPos = this.state.position;
    let value = '';
    this.advance(1); // 跳过 [

    while (this.state.currentChar !== null && this.state.currentChar !== ']') {
      value += this.state.currentChar;
      this.advance(1);
    }

    if (this.state.currentChar === ']') {
      value += ']';
      this.advance(1);
      this.addToken(TokenType.ARRAY_INDEX, value, startPos, this.state.position);
    } else {
      this.addToken(TokenType.ERROR, '[' + value, startPos, this.state.position);
    }
  }

  /**
   * 扫描字符串
   */
  private scanString(): void {
    const startPos = this.state.position;
    const quote = this.state.currentChar;
    let value = '';
    this.advance(1); // 跳过开始引号

    while (this.state.currentChar !== null && this.state.currentChar !== quote) {
      if (this.state.currentChar === '\\' && this.peek(1) !== null) {
        // 转义字符
        this.advance(1);
        value += this.state.currentChar;
      } else {
        value += this.state.currentChar;
      }
      this.advance(1);
    }

    if (this.state.currentChar === quote) {
      this.advance(1); // 跳过结束引号
      this.addToken(TokenType.STRING, value, startPos, this.state.position);
    } else {
      this.addToken(TokenType.ERROR, quote + value, startPos, this.state.position);
    }
  }

  /**
   * 扫描数字
   */
  private scanNumber(): void {
    const startPos = this.state.position;
    let value = '';

    while (this.state.currentChar !== null && /[0-9.]/.test(this.state.currentChar)) {
      value += this.state.currentChar;
      this.advance(1);
    }

    this.addToken(TokenType.NUMBER, value, startPos, this.state.position);
  }

  /**
   * 扫描标识符
   */
  private scanIdentifier(): void {
    const startPos = this.state.position;
    let value = '';

    while (this.state.currentChar !== null && /[a-zA-Z0-9_]/.test(this.state.currentChar)) {
      value += this.state.currentChar;
      this.advance(1);
    }

    // 判断是格式化器名称还是普通标识符
    const nextChar = this.state.currentChar;
    if (nextChar === '(' || this.tokens[this.tokens.length - 1]?.type === TokenType.COLON) {
      this.addToken(TokenType.FORMATTER_NAME, value, startPos, this.state.position);
    } else {
      this.addToken(TokenType.IDENTIFIER, value, startPos, this.state.position);
    }
  }

  /**
   * 扫描纯文本
   */
  private scanText(): void {
    const startPos = this.state.position;
    let value = '';

    while (this.state.currentChar !== null && this.state.currentChar !== '{') {
      value += this.state.currentChar;
      this.advance(1);
    }

    if (value) {
      this.addToken(TokenType.TEXT, value, startPos, this.state.position);
    }
  }

  /**
   * 添加token
   */
  private addToken(type: TokenType, value: string, start: number, end: number): void {
    this.tokens.push({
      type,
      value,
      position: { start, end }
    });
  }

  /**
   * 前进n个字符
   */
  private advance(n: number): void {
    this.state.position += n;
    this.state.currentChar = this.input[this.state.position] || null;
  }

  /**
   * 查看前方的字符
   */
  private peek(offset: number): string | null {
    return this.input[this.state.position + offset] || null;
  }
}

/**
 * Parser类 - 使用Token流解析标记表达式
 */
export class MarkerParser {
  private tokens: Token[];
  private position: number;

  constructor() {
    this.tokens = [];
    this.position = 0;
  }

  /**
   * 解析标记表达式
   */
  parse(input: string): ParsedMarker | null {
    const tokenizer = new MarkerTokenizer();
    this.tokens = tokenizer.tokenize(input);
    this.position = 0;

    return this.parseMarker();
  }

  /**
   * 解析标记
   */
  private parseMarker(): ParsedMarker | null {
    const firstToken = this.current();

    if (!firstToken) return null;

    // 循环开始标记
    if (firstToken.type === TokenType.LOOP_START) {
      return this.parseLoopMarker('start');
    }

    // 循环结束标记
    if (firstToken.type === TokenType.LOOP_END) {
      return this.parseLoopMarker('end');
    }

    // 普通变量标记
    if (firstToken.type === TokenType.MARKER_START) {
      return this.parseVariableMarker();
    }

    return null;
  }

  /**
   * 解析循环标记
   */
  private parseLoopMarker(loopType: 'start' | 'end'): ParsedMarker {
    this.advance(); // 跳过 {# 或 {/

    const contextToken = this.expect(TokenType.CONTEXT_PREFIX);
    const identifierToken = this.expect(TokenType.IDENTIFIER);

    this.expect(TokenType.MARKER_END);

    return {
      type: loopType === 'start' ? 'loopStart' : 'loopEnd',
      context: contextToken?.value[0] || 'd',
      path: identifierToken?.value || '',
      formatters: [],
      arrayPath: identifierToken?.value || ''
    };
  }

  /**
   * 解析变量标记
   */
  private parseVariableMarker(): ParsedMarker | null {
    this.advance(); // 跳过 {

    const contextToken = this.expect(TokenType.CONTEXT_PREFIX);
    if (!contextToken) return null;

    const path: string[] = [];
    let arrayIndex: string | undefined;
    const formatters: FormatterInfo[] = [];

    // 解析路径
    while (this.current()?.type === TokenType.IDENTIFIER) {
      path.push(this.current()!.value);
      this.advance();

      if (this.current()?.type === TokenType.ARRAY_INDEX) {
        arrayIndex = this.current()!.value;
        this.advance();
      }

      if (this.current()?.type === TokenType.DOT) {
        this.advance();
      }
    }

    // 解析格式化器
    while (this.current()?.type === TokenType.COLON) {
      this.advance(); // 跳过 :
      const formatter = this.parseFormatter();
      if (formatter) {
        formatters.push(formatter);
      }
    }

    this.expect(TokenType.MARKER_END);

    return {
      type: 'variable',
      context: contextToken.value[0],
      path: path.join('.'),
      arrayIndex,
      formatters
    };
  }

  /**
   * 解析格式化器
   */
  private parseFormatter(): FormatterInfo | null {
    const nameToken = this.expect(TokenType.FORMATTER_NAME);
    if (!nameToken) return null;

    const args: (string | number)[] = [];

    // 检查是否有参数
    if (this.current()?.type === TokenType.LPAREN) {
      this.advance(); // 跳过 (

      while (this.current()?.type !== TokenType.RPAREN && this.current()?.type !== TokenType.EOF) {
        if (this.current()?.type === TokenType.STRING) {
          args.push(this.current()!.value);
          this.advance();
        } else if (this.current()?.type === TokenType.NUMBER) {
          args.push(parseFloat(this.current()!.value));
          this.advance();
        } else if (this.current()?.type === TokenType.COMMA) {
          this.advance();
        } else {
          this.advance();
        }
      }

      this.expect(TokenType.RPAREN);
    }

    return {
      name: nameToken.value,
      args
    };
  }

  /**
   * 获取当前token
   */
  private current(): Token | undefined {
    return this.tokens[this.position];
  }

  /**
   * 前进
   */
  private advance(): void {
    this.position++;
  }

  /**
   * 期望特定类型的token
   */
  private expect(type: TokenType): Token | undefined {
    const token = this.current();
    if (token?.type === type) {
      this.advance();
      return token;
    }
    return undefined;
  }
}

/**
 * 解析后的标记
 */
export interface ParsedMarker {
  type: 'variable' | 'loopStart' | 'loopEnd';
  context: string;           // d, c, t
  path: string;              // items.name
  arrayIndex?: string;       // [i], [i+1]
  arrayPath?: string;        // items
  formatters: FormatterInfo[];
}

/**
 * 格式化器信息
 */
export interface FormatterInfo {
  name: string;
  args: (string | number)[];
}