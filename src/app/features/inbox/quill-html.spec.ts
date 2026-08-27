import { describe, expect, it } from 'vitest';

import { hasFormatting, inlineQuillFormatting } from './quill-html';

describe('inlineQuillFormatting', () => {
  it('turns alignment classes into the style the recipient can actually read', () => {
    const html = inlineQuillFormatting('<p class="ql-align-center">centred</p>');

    expect(html).toContain('text-align:center');
    expect(html).not.toContain('ql-align-center');
  });

  // Quill 2 renders a bulleted list as <ol> with the marker drawn by a CSS counter. Sent as
  // it stands, the recipient sees a numbered list where the writer typed bullets.
  it('rewrites a bulleted list as a real <ul> rather than a numbered <ol>', () => {
    const html = inlineQuillFormatting(
      '<ol><li data-list="bullet"><span class="ql-ui"></span>one</li>' +
        '<li data-list="bullet"><span class="ql-ui"></span>two</li></ol>',
    );

    expect(html).toContain('<ul');
    expect(html).toContain('list-style-type:disc');
    expect(html).not.toContain('<ol');
    expect(html).not.toContain('data-list');
    expect(html).not.toContain('ql-ui');
    expect(html).toContain('one');
    expect(html).toContain('two');
  });

  it('keeps a numbered list numbered', () => {
    const html = inlineQuillFormatting(
      '<ol><li data-list="ordered"><span class="ql-ui"></span>first</li></ol>',
    );

    expect(html).toContain('<ol');
    expect(html).toContain('list-style-type:decimal');
    expect(html).not.toContain('<ul');
  });

  it('turns a code block container into a <pre>, which needs no stylesheet to be a code block', () => {
    const html = inlineQuillFormatting(
      '<div class="ql-code-block-container">' +
        '<div class="ql-code-block">const a = 1;</div>' +
        '<div class="ql-code-block">const b = 2;</div>' +
        '</div>',
    );

    expect(html).toContain('<pre');
    expect(html).toContain('const a = 1;\nconst b = 2;');
    expect(html).not.toContain('ql-code-block');
  });

  it('converts indent steps to the padding Quill draws them with', () => {
    const block = inlineQuillFormatting('<p class="ql-indent-2">deep</p>');
    const item = inlineQuillFormatting(
      '<ol><li data-list="ordered" class="ql-indent-1">x</li></ol>',
    );

    expect(block).toContain('padding-left:6em');
    // A list item keeps the 1.5em it already had, so one step is 4.5em rather than 3em.
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
