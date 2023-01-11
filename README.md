This package implements inline suggestions for the CodeMirror code editor.

## Install

```bash
npm install codemirror-extension-inline-suggestion --save
```

## Usage

```tsx
import CodeMirror from '@uiw/react-codemirror';
import { inlineSuggestion } from 'codemirror-extension-inline-suggestion';

const fetchSuggestion = async (state) => {
  // or make an async API call here based on editor state
  return 'hello';
};

function App() {
  return (
    <CodeMirror
      value=""
      height="200px"
      extensions={[
        inlineSuggestion({
          fetchFn: inlineSuggestion,
          delay: 1000,
        }),
      ]}
    />
  );
}

export default App;
```

## License

MIT
