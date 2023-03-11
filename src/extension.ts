import {
  ViewPlugin,
  DecorationSet,
  EditorView,
  ViewUpdate,
  Decoration,
  WidgetType,
  keymap,
} from '@codemirror/view';
import {
  StateEffect,
  Text,
  Prec,
  StateField,
  EditorState,
  EditorSelection,
  TransactionSpec,
} from '@codemirror/state';
import { debouncePromise } from './lib/utils';

// Splitting this up to allow  someone to display a whole sentence as a suggestion
// while only letting the tab key insert the next word etc.
type Suggestion = {
  complete_suggestion: string;
  display_suggestion: string;
};

// Current state of the autosuggestion
const InlineSuggestionState = StateField.define<{ suggestion: null | Suggestion }>({
  create() {
    return { suggestion: null };
  },
  update(__, tr) {
    const inlineSuggestion = tr.effects.find((e) =>
      e.is(InlineSuggestionEffect)
    );
    if (tr.state.doc)
      if (inlineSuggestion && tr.state.doc == inlineSuggestion.value.doc) {
        return { suggestion: inlineSuggestion.value.text };
      }
    return { suggestion: null };
  },
});

const InlineSuggestionEffect = StateEffect.define<{
  text: Suggestion | null;
  doc: Text;
}>();

/**
 * Provides a suggestion for the next word
 */
function inlineSuggestionDecoration(view: EditorView, prefix: string) {
  const pos = view.state.selection.main.head;
  const widgets = [];
  const w = Decoration.widget({
    widget: new InlineSuggestionWidget(prefix),
    side: 1,
  });
  widgets.push(w.range(pos));
  return Decoration.set(widgets);
}

class InlineSuggestionWidget extends WidgetType {
  suggestion: string;
  constructor(suggestion: string) {
    super();
    this.suggestion = suggestion;
  }
  toDOM() {
    const div = document.createElement('span');
    div.style.opacity = '0.4';
    div.className = 'cm-inline-suggestion';
    div.textContent = this.suggestion;
    return div;
  }
}


type InlineFetchFn = (state: EditorState) => Promise<Suggestion>;

export const fetchSuggestion = (fetchFn: InlineFetchFn) =>
  ViewPlugin.fromClass(
    class Plugin {
      async update(update: ViewUpdate) {
        const doc = update.state.doc;
        // Only fetch if the document has changed
        if (!update.docChanged) {
          return;
        }
        const result = await fetchFn(update.state);
        update.view.dispatch({
          effects: InlineSuggestionEffect.of({ text: result, doc: doc }),
        });
      }
    }
  );

const renderInlineSuggestionPlugin = ViewPlugin.fromClass(
  class Plugin {
    decorations: DecorationSet;
    constructor() {
      // Empty decorations
      this.decorations = Decoration.none;
    }
    update(update: ViewUpdate) {
      const suggestion: Suggestion | null = update.state.field(
        InlineSuggestionState
      )?.suggestion;
      if (!suggestion) {
        this.decorations = Decoration.none;
        return;
      }
      this.decorations = inlineSuggestionDecoration(
        update.view,
        suggestion.display_suggestion
      );
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

const inlineSuggestionKeymap = Prec.highest(
  keymap.of([
    {
      key: 'Tab',
      run: (view) => {
        const suggestion: Suggestion | null = view.state.field(
          InlineSuggestionState
        )?.suggestion;

        // If there is no suggestion, do nothing and let the default keymap handle it
        if (!suggestion) {
          return false;
        }

        view.dispatch({
          ...insertCompletionText(
            view.state,
            suggestion.complete_suggestion,
            view.state.selection.main.head,
            view.state.selection.main.head
          ),
        });
        return true;
      },
    },
  ])
);

function insertCompletionText(
  state: EditorState,
  text: string,
  from: number,
  to: number
): TransactionSpec {
  return {
    ...state.changeByRange((range) => {
      if (range == state.selection.main)
        return {
          changes: { from: from, to: to, insert: text },
          range: EditorSelection.cursor(from + text.length),
        };
      const len = to - from;
      if (
        !range.empty ||
        (len &&
          state.sliceDoc(range.from - len, range.from) !=
            state.sliceDoc(from, to))
      )
        return { range };
      return {
        changes: { from: range.from - len, to: range.from, insert: text },
        range: EditorSelection.cursor(range.from - len + text.length),
      };
    }),
    userEvent: 'input.complete',
  };
}

type InlineSuggestionOptions = {
  fetchFn: (state: EditorState) => Promise<string | Suggestion>;
  delay?: number;
};

// This is for backwards compatibility
function toSuggestion(suggestion: string | Suggestion): Suggestion {
  if (typeof suggestion === 'string') {
    return {
      complete_suggestion: suggestion,
      display_suggestion: suggestion,
    };
  }
  return suggestion;
}

function toSuggestionFn(
  fetchFn: (state: EditorState) => Promise<string | Suggestion>
): InlineFetchFn {
  return async (state: EditorState) => {
    const suggestion = await fetchFn(state);
    return toSuggestion(suggestion);
  };
}

export function inlineSuggestion(options: InlineSuggestionOptions) {
  const { delay = 500 } = options;
  const fetchFn = debouncePromise(toSuggestionFn(options.fetchFn), delay);
  return [
    InlineSuggestionState,
    fetchSuggestion(fetchFn),
    renderInlineSuggestionPlugin,
    inlineSuggestionKeymap,
  ];
}
