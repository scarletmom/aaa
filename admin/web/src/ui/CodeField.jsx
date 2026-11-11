import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, MatchDecorator, ViewPlugin } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "var(--text)", fontSize: "12px" },
    "&.cm-focused": { outline: "none" },
    ".cm-content": { fontFamily: "var(--mono)", padding: "0", caretColor: "var(--text)" },
    ".cm-line": { padding: "0" },
    ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "20px" },
    ".cm-cursor": { borderLeftColor: "var(--text)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgb(237 237 237 / 0.14) !important" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--text-3)", paddingRight: "8px" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 4px 0 0", minWidth: "24px" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-placeholder": { color: "var(--text-3)" },
    ".cm-matchingBracket": { backgroundColor: "rgb(237 237 237 / 0.1)", outline: "none" },
    ".cm-tooltip": { backgroundColor: "var(--raised)", border: "1px solid var(--line-strong)", borderRadius: "8px" },
  },
  { dark: true }
);

const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "#d4a5c9" },
    { tag: [t.string, t.special(t.string)], color: "var(--json-str)" },
    { tag: [t.number, t.bool, t.null], color: "var(--json-num)" },
    { tag: [t.propertyName], color: "var(--json-key)" },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#e6e6e6" },
    { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--text-3)" },
    { tag: [t.variableName, t.definition(t.variableName)], color: "var(--text)" },
    { tag: [t.punctuation, t.bracket, t.operator], color: "var(--text-2)" },
  ])
);

const expressionMarks = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.matcher = new MatchDecorator({ regexp: /\{\{[\s\S]*?\}\}/g, decoration: Decoration.mark({ class: "cm-expr" }) });
      this.decorations = this.matcher.createDeco(view);
    }
    update(update) {
      this.decorations = this.matcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

// Dragged data keys carry their bare path too: JavaScript wants `$json.x`, not the `{{ $json.x }}` other fields take.
export const PATH_MIME = "application/x-studio-path";

const dropBarePath = EditorView.domEventHandlers({
  drop(event, view) {
    const path = event.dataTransfer?.getData(PATH_MIME);
    if (!path) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
    event.preventDefault();
    view.dispatch({ changes: { from: pos, insert: path }, selection: { anchor: pos + path.length } });
    view.focus();
    return true;
  },
});

// Keeps one-line fields on one line by cleaning typed or pasted text, instead of rejecting it:
// edge line breaks are dropped (a copied URL often ends with one) and inner ones become a space.
const singleLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.newDoc.lines === 1 || !tr.isUserEvent("input")) return tr;
  const changes = [];
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    const text = inserted.toString().replace(/^[\r\n]+|[\r\n]+$/g, "").replace(/[ \t]*\r?\n[ \t]*/g, " ");
    changes.push({ from, to, insert: text });
  });
  const changeSet = tr.startState.changes(changes);
  return { changes: changeSet, selection: { anchor: changeSet.mapPos(tr.startState.selection.main.to, 1) }, userEvent: "input", scrollIntoView: true };
});

const minimal = { lineNumbers: false, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false, searchKeymap: false };
const full = { foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false };

const VARIANTS = {
  expression: { setup: minimal, extensions: () => [singleLine, expressionMarks] },
  text: { setup: minimal, extensions: () => [EditorView.lineWrapping, highlight, expressionMarks] },
  javascript: { setup: full, extensions: () => [javascript(), highlight, dropBarePath] },
  json: { setup: full, extensions: () => [json(), highlight] },
};

export function CodeField({ value, onChange, variant = "expression", placeholder, minHeight, className = "" }) {
  const config = VARIANTS[variant];
  const extensions = useMemo(() => [theme, ...config.extensions()], [config]);
  const isExpr = (variant === "expression" || variant === "text") && String(value ?? "").includes("{{");
  return (
    <div className={`field-box code-field code-${variant}${isExpr ? " is-expr" : ""} ${className}`}>
      <CodeMirror
        value={value ?? ""}
        onChange={onChange}
        theme="none"
        basicSetup={config.setup}
        extensions={extensions}
        placeholder={placeholder}
        minHeight={minHeight}
        indentWithTab={variant === "javascript" || variant === "json"}
      />
    </div>
  );
}
