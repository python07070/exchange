import { useEffect, useRef, useState } from 'react';
import { IconSearch, IconClose, IconSparkle } from './ui.jsx';

const EXAMPLES = [
  'Where can I get vegan food that is open now?',
  'Best rated coffee near me',
  'Somewhere fun for the kids this weekend',
  'A pharmacy that is open late',
  'Cheap dinner nearby',
  'Fresh bread this morning',
];

/**
 * Plain-language search. The examples are the teaching device — they show
 * customers immediately that they can just ask for what they want.
 */
export default function SearchBar({ value, onSearch, placeholder = 'Ask for anything nearby…' }) {
  const [text, setText] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => setText(value ?? ''), [value]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const submit = (query) => {
    setFocused(false);
    onSearch(query.trim());
  };

  return (
    <div className="searchbar" ref={boxRef}>
      <form
        className="searchbar__field"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        role="search"
      >
        <span className="searchbar__icon">
          <IconSearch size={17} />
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          aria-label="Search for businesses in your own words"
          enterKeyHint="search"
        />
        {text && (
          <button
            type="button"
            className="btn btn--icon btn--sm"
            style={{ background: 'transparent' }}
            aria-label="Clear search"
            onClick={() => {
              setText('');
              submit('');
            }}
          >
            <IconClose size={15} />
          </button>
        )}
        <button type="submit" className="btn btn--primary btn--sm">
          Search
        </button>
      </form>

      {focused && (
        <div className="suggestions">
          <div className="suggestions__title row" style={{ gap: 6 }}>
            <IconSparkle size={12} /> Try asking
          </div>
          {EXAMPLES.filter((e) => !text || e.toLowerCase().includes(text.toLowerCase().slice(0, 4)))
            .slice(0, 5)
            .map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setText(example);
                  submit(example);
                }}
              >
                {example}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
