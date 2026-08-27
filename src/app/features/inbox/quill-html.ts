// What p-editor hands over as htmlValue is Quill 2's getSemanticHTML(), not the editor's own
// innerHTML, and the two differ in ways that matter here. getSemanticHTML already emits real
// <ul>/<ol> for lists (core/editor.js getListType) and a real <pre> for code blocks
// (formats/code.js CodeBlockContainer.html), so neither needs rescuing.
//
// What it does NOT resolve is anything held by a class attributor: quill.js registers
// 'formats/align' as AlignClass and indent as a ClassAttributor, and the block path in
// convertHTML copies the DOM node's outerHTML verbatim - classes and all. Only code blocks
// override html(), so a <p class="ql-align-center"> arrives with its class intact.
//
// Those classes mean nothing once the message leaves this page. The recipient's client has
// no ql-* rules and cannot be given any: the API's sanitizer strips <style> outright
// (FORBID_TAGS in sanitize.ts), and mail clients drop it too. So alignment and indent get
// rewritten as inline styles, with the values read off Quill 2.0.3's own quill.core.css.
//
// The list and <pre> handling below is not a fix for a broken tag - it is email hardening:
// clients disagree about default list markers and padding, so both are stated outright.

// .ql-editor .ql-align-center { text-align: center }, and so on.
const ALIGNMENT: Readonly<Record<string, string>> = {
  'ql-align-center': 'center',
  'ql-align-right': 'right',
  'ql-align-justify': 'justify',
};

// .ql-editor .ql-size-large { font-size: 1.5em }, etc. Not on the toolbar, but a paste can
// carry one in.
const SIZES: Readonly<Record<string, string>> = {
  'ql-size-small': '0.75em',
  'ql-size-large': '1.5em',
  'ql-size-huge': '2.5em',
};

const FONTS: Readonly<Record<string, string>> = {
  'ql-font-serif': 'Georgia, "Times New Roman", serif',
  'ql-font-monospace': 'Monaco, "Courier New", monospace',
};

// One indent step is 3em of padding, and a list item carries the 1.5em it already had.
const INDENT_STEP_EM = 3;
const LIST_ITEM_BASE_EM = 1.5;

const CODE_BLOCK_STYLE =
  'padding:0.7em 0.9em;border-radius:10px;background:#f4f4f5;' +
  'font-family:Monaco,"Courier New",monospace;font-size:0.92em;white-space:pre-wrap';

function appendStyle(element: Element, declaration: string): void {
  const existing = element.getAttribute('style')?.trim().replace(/;$/, '') ?? '';

  element.setAttribute('style', existing === '' ? declaration : `${existing};${declaration}`);
}

// The tag is already right; this only states the marker and padding that clients otherwise
// each pick for themselves. data-list survives semantic HTML for checklists, where it is the
// only trace of a format plain HTML cannot express.
function hardenList(list: Element): void {
  appendStyle(
    list,
    `padding-left:1.5em;list-style-type:${list.tagName === 'UL' ? 'disc' : 'decimal'}`,
  );

  for (const item of [...list.children]) {
    item.removeAttribute('data-list');
    // Quill draws the marker with a CSS counter on these; they are empty without its CSS.
    for (const ui of [...item.querySelectorAll('.ql-ui')]) {
      ui.remove();
    }
  }
}

// getSemanticHTML already gives a bare <pre>; it just carries no styling of its own.
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

  // Every ql-* class has now either been inlined or has no meaning outside the composer.
  for (const name of classes) {
    if (name.startsWith('ql-')) {
      element.classList.remove(name);
    }
  }

  if (element.classList.length === 0) {
    element.removeAttribute('class');
  }
}

/**
 * Rewrites Quill's class-based formatting as inline styles, so a sent message renders the
 * same in a client that has never heard of Quill. Returns the HTML unchanged when it carries
 * no Quill markup, which is what a plain typed note looks like.
 */
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

  // Quill's own empty-line filler. Harmless, but it is noise in a quoted reply.
  for (const element of [...root.querySelectorAll('.ql-cursor')]) {
    element.remove();
  }

  return root.innerHTML;
}

/**
 * True when the body carries formatting worth sending as HTML. A note with no markup should
 * stay a plain-text message rather than arriving as a one-line <p>.
 */
export function hasFormatting(html: string): boolean {
  const stripped = html
    .replaceAll(/<\/?(?:p|div|br)\b[^>]*>/gi, '')
    .replaceAll(/&nbsp;/gi, ' ')
    .trim();

  return stripped !== '' && /<[a-z]/i.test(stripped);
}
