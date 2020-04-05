import { TextRange } from '@emmetio/action-utils';
import { getOptions, getTagContext, ContextTag, expand } from '../lib/emmet';
import { getCaret, narrowToNonSpace, replaceWithSnippet, substr } from '../lib/utils';
import { docSyntax, isXML } from '../lib/syntax';
import { lineIndent } from '../lib/output';

const baseClass = 'emmet-panel';

export default function wrapWithAbbreviation(editor: CodeMirror.Editor) {
    const syntax = docSyntax(editor);
    const caret = getCaret(editor);
    const context = getTagContext(editor, caret, isXML(syntax));
    const wrapRange = getWrapRange(editor, getSelection(editor), context);
    const options = getOptions(editor, caret);
    options.text = getContent(editor, wrapRange, true);

    let panel = createInputPanel();
    let input = panel.querySelector('input')!;
    let updated = false;

    function onInput(evt: InputEvent) {
        evt.stopPropagation();
        undo();
        try {
            const snippet = expand(editor, input.value, options);
            replaceWithSnippet(editor, wrapRange, snippet);
            updated = true;
        } catch (err) {
            updated = false;
            // TODO handle error in panel
            console.error(err);
        }
    };

    function onKeyDown(evt: KeyboardEvent) {
        if (evt.keyCode === 27 /* ESC */) {
            evt.stopPropagation();
            evt.preventDefault();
            cancel();
        } else if (evt.keyCode === 13 /* Enter */) {
            evt.stopPropagation();
            evt.preventDefault();
            submit();
        }
    };

    function undo() {
        if (updated) {
            editor.undo();
        }
    }

    function cancel() {
        undo();
        dispose();
        editor.focus();
    }

    function submit() {
        // Changes should already be applied to editor
        dispose();
        editor.focus();
    }

    function dispose() {
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onKeyDown);
        input.removeEventListener('blur', cancel);
        panel.remove();
        // @ts-ignore Dispose element references
        panel = input = null;
    }

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('blur', cancel);
    editor.getWrapperElement().appendChild(panel);
    input.focus();
}

function createInputPanel(): HTMLElement {
    const elem = document.createElement('div');
    elem.className = baseClass;
    elem.innerHTML = `<div class="${baseClass}-wrapper"><input type="text" placeholder="Enter abbreviation" autofocus /></div>`;
    return elem;
}

function getWrapRange(editor: CodeMirror.Editor, range: TextRange, context?: ContextTag): TextRange {
    if (range[0] === range[1] && context) {
        // No selection means user wants to wrap current tag container
        const { open, close } = context;
        const pos = range[0];

        // Check how given point relates to matched tag:
        // if it's in either open or close tag, we should wrap tag itself,
        // otherwise we should wrap its contents

        if (inRange(open, pos) || (close && inRange(close, pos))) {
            return [open[0], close ? close[1] : open[1]];
        }

        if (close) {
            return narrowToNonSpace(editor, [open[1], close[0]]);
        }
    }

    return range;
}

/**
 * Returns contents of given region, properly de-indented
 */
function getContent(editor: CodeMirror.Editor, range: TextRange, lines = false): string | string[] {
    const pos = editor.posFromIndex(range[0]);
    const baseIndent = lineIndent(editor, pos.line);
    const srcLines = substr(editor, range).split('\n');
    const destLines = srcLines.map(line => {
        return line.startsWith(baseIndent)
            ? line.slice(baseIndent.length)
            : line;
    });

    return lines ? destLines : destLines.join('\n');
}

function inRange(range: TextRange, pt: number): boolean {
    return range[0] < pt && pt < range[1];
}

function getSelection(editor: CodeMirror.Editor): TextRange {
    const sel = editor.listSelections()[0];
    const head = editor.indexFromPos(sel.head);
    const anchor = editor.indexFromPos(sel.anchor);
    return [
        Math.min(head, anchor),
        Math.max(head, anchor)
    ];
}
