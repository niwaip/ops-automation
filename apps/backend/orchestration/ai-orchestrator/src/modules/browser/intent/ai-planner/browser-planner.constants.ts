export interface BrowserToolDefinition {
  name: string;
  description: string;
  params: Record<string, unknown>;
}

export const BROWSER_TOOLS: BrowserToolDefinition[] = [
  {
    name: 'navigate',
    description: 'Navigate to a URL',
    params: { url: { type: 'string', required: true, description: 'URL to navigate to' } },
  },
  {
    name: 'click',
    description: 'Click on an element',
    params: {
      selector: {
        type: 'string',
        required: true,
        description: 'CSS selector or text to find element',
      },
      text: { type: 'string', required: false, description: 'Text content to find element' },
      rawTarget: {
        type: 'string',
        required: false,
        description: 'User-mentioned target text before runtime candidate resolution',
      },
      candidateId: {
        type: 'string',
        required: false,
        description: 'Structured candidate id from current page observation',
      },
      roleHint: {
        type: 'string',
        required: false,
        description: 'Optional role hint such as button or link',
      },
      semanticHint: {
        type: 'string',
        required: false,
        description: 'Optional semantic hint such as submit/open/confirm/back',
      },
    },
  },
  {
    name: 'list_search_results',
    description: 'List ranked search result candidates from the current page before clicking',
    params: {
      limit: {
        type: 'number',
        required: false,
        description: 'Maximum number of results to return',
      },
    },
  },
  {
    name: 'click_result',
    description: 'Click on the Nth search result (use when user says "点击第一个结果" or similar)',
    params: {
      index: {
        type: 'number',
        required: true,
        description: 'Result index (1 for first, 2 for second, etc.)',
      },
    },
  },
  {
    name: 'switch_latest_tab',
    description: 'Switch focus to the latest opened tab/page in the current browser session',
    params: {},
  },
  {
    name: 'fill',
    description: 'Fill text into an input field',
    params: {
      selector: { type: 'string', required: true, description: 'CSS selector for input field' },
      value: { type: 'string', required: true, description: 'Text to fill' },
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page',
    params: {},
  },
  {
    name: 'snapshot',
    description: 'Take accessibility snapshot of the page (get element UIDs for reliable clicking)',
    params: {},
  },
  {
    name: 'read_page',
    description: 'Read page content (text, headings, links)',
    params: {
      selector: {
        type: 'string',
        required: false,
        description: 'CSS selector to read specific element',
      },
      max_length: { type: 'number', required: false, description: 'Max text length to return' },
    },
  },
  {
    name: 'get_text',
    description: 'Get all visible text content from the page',
    params: {},
  },
  {
    name: 'scroll',
    description: 'Scroll the page (up, down, top, bottom)',
    params: {
      direction: {
        type: 'string',
        required: false,
        description: 'Direction: up, down, top, bottom',
      },
      amount: { type: 'number', required: false, description: 'Pixels to scroll' },
    },
  },
  {
    name: 'type_text',
    description: 'Type text using keyboard (use for typing into focused input)',
    params: {
      text: { type: 'string', required: true, description: 'Text to type' },
      submit_key: {
        type: 'string',
        required: false,
        description: 'Key to press after typing (e.g., Enter)',
      },
    },
  },
  {
    name: 'drag',
    description: 'Drag element from source to destination',
    params: {
      src: { type: 'string', required: true, description: 'Source element selector' },
      dst: { type: 'string', required: true, description: 'Destination element selector' },
    },
  },
  {
    name: 'wait',
    description: 'Wait for an element or time',
    params: {
      selector: { type: 'string', required: false, description: 'CSS selector to wait for' },
      duration: { type: 'number', required: false, description: 'Time to wait in ms' },
    },
  },
  {
    name: 'hover',
    description: 'Hover over an element',
    params: {
      selector: { type: 'string', required: true, description: 'CSS selector for element' },
    },
  },
  {
    name: 'press_key',
    description: 'Press a key or key combination',
    params: {
      key: {
        type: 'string',
        required: true,
        description: 'Key to press (e.g., Enter, Tab, Escape)',
      },
    },
  },
  {
    name: 'search',
    description:
      'Search using the current page search entry when the user explicitly chose search mode',
    params: {
      query: { type: 'string', required: true, description: 'Search query text' },
    },
  },
  {
    name: 'smart_search',
    description:
      'Heuristic search on current page - auto-detects a likely search input and submits query',
    params: {
      query: { type: 'string', required: true, description: 'Search query text' },
    },
  },
  {
    name: 'evaluate',
    description: 'Execute JavaScript in the browser',
    params: {
      script: { type: 'string', required: true, description: 'JavaScript code to execute' },
    },
  },
];
