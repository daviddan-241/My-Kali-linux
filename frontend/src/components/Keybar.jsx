import React from 'react';

export default function Keybar({ ctrlOn, altOn, setCtrl, setAlt, onSend, onFocusKb }) {
  const handleKey = (e, seq, isModifier, modType) => {
    if (e.cancelable) e.preventDefault();
    const target = e.currentTarget;

    if (isModifier) {
      if (modType === 'ctrl') {
        setCtrl(!ctrlOn);
      } else if (modType === 'alt') {
        setAlt(!altOn);
      }
    } else {
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 120);
      onSend(seq);
    }
    onFocusKb();
  };

  return (
    <div id="keybar">
      <div className="trow">
        <div
          className="k"
          id="kesc"
          onTouchStart={(e) => handleKey(e, '\x1b', false)}
          onMouseDown={(e) => handleKey(e, '\x1b', false)}
        >
          ESC
        </div>
        <div
          className="k"
          id="kslash"
          onTouchStart={(e) => handleKey(e, '/', false)}
          onMouseDown={(e) => handleKey(e, '/', false)}
        >
          /
        </div>
        <div
          className="k"
          id="kdash"
          onTouchStart={(e) => handleKey(e, '-', false)}
          onMouseDown={(e) => handleKey(e, '-', false)}
        >
          -
        </div>
        <div
          className="k"
          id="khome"
          onTouchStart={(e) => handleKey(e, '\x1b[H', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[H', false)}
        >
          HOME
        </div>
        <div
          className="k"
          id="kup"
          onTouchStart={(e) => handleKey(e, '\x1b[A', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[A', false)}
        >
          &#x25B2;
        </div>
        <div
          className="k"
          id="kend"
          onTouchStart={(e) => handleKey(e, '\x1b[F', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[F', false)}
        >
          END
        </div>
        <div
          className="k"
          id="kpgup"
          onTouchStart={(e) => handleKey(e, '\x1b[5~', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[5~', false)}
        >
          PGUP
        </div>
      </div>

      <div className="trow">
        <div
          className="k"
          id="ktab"
          onTouchStart={(e) => handleKey(e, '\t', false)}
          onMouseDown={(e) => handleKey(e, '\t', false)}
        >
          TAB
        </div>
        <div
          className={`k mod ${ctrlOn ? 'on' : ''}`}
          id="kctrl"
          onTouchStart={(e) => handleKey(e, null, true, 'ctrl')}
          onMouseDown={(e) => handleKey(e, null, true, 'ctrl')}
        >
          CTRL
        </div>
        <div
          className={`k mod ${altOn ? 'on' : ''}`}
          id="kalt"
          onTouchStart={(e) => handleKey(e, null, true, 'alt')}
          onMouseDown={(e) => handleKey(e, null, true, 'alt')}
        >
          ALT
        </div>
        <div
          className="k"
          id="kleft"
          onTouchStart={(e) => handleKey(e, '\x1b[D', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[D', false)}
        >
          &#x25C0;
        </div>
        <div
          className="k"
          id="kdown"
          onTouchStart={(e) => handleKey(e, '\x1b[B', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[B', false)}
        >
          &#x25BC;
        </div>
        <div
          className="k"
          id="kright"
          onTouchStart={(e) => handleKey(e, '\x1b[C', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[C', false)}
        >
          &#x25B6;
        </div>
        <div
          className="k"
          id="kpgdn"
          onTouchStart={(e) => handleKey(e, '\x1b[6~', false)}
          onMouseDown={(e) => handleKey(e, '\x1b[6~', false)}
        >
          PGDN
        </div>
      </div>
    </div>
  );
}
