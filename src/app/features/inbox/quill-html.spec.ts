import { describe, expect, it } from 'vitest';

import { hasFormatting, inlineQuillFormatting } from './quill-html';

describe('inlineQuillFormatting', () => {
  it('turns alignment classes into the style the recipient can actually read', () => {
    const html = inlineQuillFormatting('<p class="ql-align-center">centred</p>');

    expect(html).toContain('text-align:center');
    expect(html).not.toContain('ql-align-center');
  });

  it('states the marker and padding on a bulleted list', () => {
    const html = inlineQuillFormatting('<ul><li>one</li><li>two</li></ul>');

    expect(html).toContain('list-style-type:disc');
    expect(html).toContain('padding-left:1.5em');
    expect(html).toContain('one');
  });

  it('states decimal on a numbered list', () => {
    const html = inlineQuillFormatting('<ol><li>first</li></ol>');

    expect(html).toContain('list-style-type:decimal');
  });

  it('drops the checklist marker plain HTML cannot express', () => {
    const html = inlineQuillFormatting(
      '<ul><li data-list="checked"><span class="ql-ui"></span>done</li></ul>',
    );

    expect(html).not.toContain('data-list');
    expect(html).not.toContain('ql-ui');
    expect(html).toContain('done');
  });

  it('gives the <pre> a code block needs styling it can carry on its own', () => {
    const html = inlineQuillFormatting('<pre>const a = 1;</pre>');

    expect(html).toContain('<pre');
    expect(html).toContain('font-family:Monaco');
    expect(html).toContain('const a = 1;');
  });

  it('converts indent steps to the padding Quill draws them with', () => {
    const block = inlineQuillFormatting('<p class="ql-indent-2">deep</p>');
    const item = inlineQuillFormatting(
      '<ol><li data-list="ordered" class="ql-indent-1">x</li></ol>',
    );

    expect(block).toContain('padding-left:6em');
    expect(item).toContain('padding-left:4.5em');
  });

  it('preserves a style the element already carried instead of overwriting it', () => {
    const html = inlineQuillFormatting('<p style="color:red" class="ql-align-right">x</p>');

    expect(html).toContain('color:red');
    expect(html).toContain('text-align:right');
  });

  it('drops every ql- class, including ones it has no inline equivalent for', () => {
    const html = inlineQuillFormatting('<p class="ql-direction-rtl ql-align-right">x</p>');

    expect(html).not.toContain('ql-');
  });

  it('leaves a class the writer did not get from Quill alone', () => {
    const html = inlineQuillFormatting('<p class="signature ql-align-center">x</p>');

    expect(html).toContain('signature');
    expect(html).not.toContain('ql-align-center');
  });

  it('returns plain markup untouched, so a note with no formatting is not rewritten', () => {
    expect(inlineQuillFormatting('<p>just a line</p>')).toBe('<p>just a line</p>');
    expect(inlineQuillFormatting('')).toBe('');
  });

  it('inlines every class-held format, which semantic HTML leaves as a class', () => {
    const html = inlineQuillFormatting(
      '<p class="ql-align-center ql-size-large ql-font-monospace ql-indent-1">x</p>',
    );

    expect(html).toContain('text-align:center');
    expect(html).toContain('font-size:1.5em');
    expect(html).toContain('font-family:Monaco');
    expect(html).toContain('padding-left:3em');
    expect(html).not.toContain('ql-');
  });
});

describe('hasFormatting', () => {
  it('does not call an unformatted note HTML, so it goes out as plain text', () => {
    expect(hasFormatting('<p>hello</p>')).toBe(false);
    expect(hasFormatting('<p><br></p>')).toBe(false);
    expect(hasFormatting('')).toBe(false);
  });

  it('recognises real markup', () => {
    expect(hasFormatting('<p><strong>hello</strong></p>')).toBe(true);
    expect(hasFormatting('<h1>title</h1>')).toBe(true);
    expect(hasFormatting('<ul><li>x</li></ul>')).toBe(true);
  });
});
