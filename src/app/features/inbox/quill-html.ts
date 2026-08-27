const ALIGNMENT: Readonly<Record<string, string>> = {
  'ql-align-center': 'center',
  'ql-align-right': 'right',
  'ql-align-justify': 'justify',
};

const SIZES: Readonly<Record<string, string>> = {
  'ql-size-small': '0.75em',
  'ql-size-large': '1.5em',
  'ql-size-huge': '2.5em',
};

const FONTS: Readonly<Record<string, string>> = {
  'ql-font-serif': 'Georgia, "Times New Roman", serif',
  'ql-font-monospace': 'Monaco, "Courier New", monospace',
};

const INDENT_STEP_EM = 3;
const LIST_ITEM_BASE_EM = 1.5;

const CODE_BLOCK_STYLE =
  'padding:0.7em 0.9em;border-radius:10px;background:#f4f4f5;' +
  'font-family:Monaco,"Courier New",monospace;font-size:0.92em;white-space:pre-wrap';

function appendStyle(element: Element, declaration: string): void {
  const existing = element.getAttribute('style')?.trim().replace(/;$/, '') ?? '';

  element.setAttribute('style', existing === '' ? declaration : `${existing};${declaration}`);
}

function hardenList(list: Element): void {
  appendStyle(
    list,
    `padding-left:1.5em;list-style-type:${list.tagName === 'UL' ? 'disc' : 'decimal'}`,
  );

  for (const item of [...list.children]) {
    item.removeAttribute('data-list');
    for (const ui of [...item.querySelectorAll('.ql-ui')]) {
      ui.remove();
    }
  }
}

function hardenCodeBlock(pre: Element): void {
  appendStyle(pre, CODE_BLOCK_STYLE);
}

function inlineClasses(element: Element): void {
  const classes = [...element.classList];

  for (const name of classes) {
    const alignment = ALIGNMENT[name];

    if (alignment !== undefined) {
      appendStyle(element, `text-align:${alignment}`);
      continue;
    }

    const size = SIZES[name];

    if (size !== undefined) {
      appendStyle(element, `font-size:${size}`);
      continue;
    }

    const font = FONTS[name];

    if (font !== undefined) {
      appendStyle(element, `font-family:${font}`);
      continue;
    }

    const indent = /^ql-indent-([1-9])$/.exec(name);

    if (indent !== null) {
      const steps = Number(indent[1]);
      const base = element.tagName === 'LI' ? LIST_ITEM_BASE_EM : 0;

      appendStyle(element, `padding-left:${String(steps * INDENT_STEP_EM + base)}em`);
    }
  }

  for (const name of classes) {
    if (name.startsWith('ql-')) {
      element.classList.remove(name);
    }
  }

  if (element.classList.length === 0) {
    element.removeAttribute('class');
  }
}

export function inlineQuillFormatting(html: string): string {
  if (html.trim() === '') {
    return '';
  }

  const root = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

  for (const pre of [...root.querySelectorAll('pre')]) {
    hardenCodeBlock(pre);
  }

  for (const list of [...root.querySelectorAll('ol, ul')]) {
    hardenList(list);
  }

  for (const element of [...root.querySelectorAll('*')]) {
    inlineClasses(element);
  }

  for (const element of [...root.querySelectorAll('.ql-cursor')]) {
    element.remove();
  }

  return root.innerHTML;
}

export function hasFormatting(html: string): boolean {
  const stripped = html
    .replaceAll(/<\/?(?:p|div|br)\b[^>]*>/gi, '')
    .replaceAll(/&nbsp;/gi, ' ')
    .trim();

  return stripped !== '' && /<[a-z]/i.test(stripped);
}
