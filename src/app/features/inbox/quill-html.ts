// Quill expresses several formats as its own CSS classes rather than as tags or inline
// styles, which works in the composer because Quill's stylesheet is loaded there. A message
// leaves that page: the recipient's client has no `ql-*` rules, and it cannot be given any -
// the API's sanitizer strips <style> outright (FORBID_TAGS in sanitize.ts), and every mail
// client worth the name drops it too. So whatever Quill expressed as a class has to be
// rewritten as an inline style before the HTML goes on the wire.
//
// The values here are read off Quill 2.0.3's own quill.core.css, so the recipient sees what
// the writer saw.

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
  'margin:0;padding:0;font-family:Monaco,"Courier New",monospace;white-space:pre-wrap';

const CODE_CONTAINER_STYLE =
  'padding:0.7em 0.9em;border-radius:10px;background:#f4f4f5;' +
  'font-family:Monaco,"Courier New",monospace;font-size:0.92em;white-space:pre-wrap';

function appendStyle(element: Element, declaration: string): void {
  const existing = element.getAttribute('style')?.trim().replace(/;$/, '') ?? '';

  element.setAttribute('style', existing === '' ? declaration : `${existing};${declaration}`);
}

// Quill 2 renders a bulleted list as <ol> too, with the marker drawn by a CSS counter on a
// <span class="ql-ui"> that is empty in the markup. Left alone, a bulleted list arrives at
// the recipient numbered, because <ol> is what the tag says.
function rewriteList(list: Element, doc: Document): void {
  const items = [...list.children].filter((child) => child.tagName === 'LI');
  const bulleted = items.some((item) => item.getAttribute('data-list') === 'bullet');

  // A checklist has no honest plain-HTML equivalent; a bullet is the closest thing that
  // still reads as a list rather than as mis-numbered prose.
  const marker = bulleted ? 'disc' : 'decimal';
  const target = bulleted ? 'ul' : 'ol';

  const replacement = doc.createElement(target);

  for (const attribute of list.attributes) {
    replacement.setAttribute(attribute.name, attribute.value);
  }

  appendStyle(replacement, `padding-left:1.5em;list-style-type:${marker}`);

  while (list.firstChild !== null) {
    replacement.appendChild(list.firstChild);
  }

  list.replaceWith(replacement);

  for (const item of [...replacement.children]) {
    item.removeAttribute('data-list');
    // The counter markers live in these and render as nothing without Quill's CSS.
    for (const ui of [...item.querySelectorAll('.ql-ui')]) {
      ui.remove();
    }
  }
}

// <div class="ql-code-block-container"><div class="ql-code-block">…</div></div> is a code
// block only while Quill's CSS is loaded. As <pre> it is one anywhere.
function rewriteCodeBlock(container: Element, doc: Document): void {
  const pre = doc.createElement('pre');

  appendStyle(pre, CODE_CONTAINER_STYLE);

  const lines = [...container.querySelectorAll('.ql-code-block')];

  if (lines.length === 0) {
    pre.textContent = container.textContent;
  } else {
    pre.textContent = lines.map((line) => line.textContent ?? '').join('\n');
  }

  // A lone <pre> keeps the whitespace; the per-line divs would each add a break on top.
  appendStyle(pre, CODE_BLOCK_STYLE);
  container.replaceWith(pre);
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

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const root = doc.body;

  // Containers first: rewriting a list replaces the node, so collecting afterwards would
  // walk elements that are no longer attached.
  for (const container of [...root.querySelectorAll('.ql-code-block-container')]) {
    rewriteCodeBlock(container, doc);
  }

  for (const list of [...root.querySelectorAll('ol, ul')]) {
    rewriteList(list, doc);
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
