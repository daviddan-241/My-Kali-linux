import React from 'react';

const XSEQ = {
  cc: '\x03',
  cx: '\x18',
  cz: '\x1a',
  cd: '\x04',
  cl: '\x0c',
  cu: '\x15',
};

export default function ExpandableKeys({ isOpen, onSend, onPaste, onSendLine, onFocusKb }) {
  const handleKeyTap = (e, val, keyType) => {
    if (e.cancelable) e.preventDefault();
    const target = e.currentTarget;
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 110);

    if (keyType && XSEQ[keyType]) {
      onSend(XSEQ[keyType]);
    } else if (val) {
      onSend(val);
    }
    onFocusKb();
  };

  const handlePasteTap = (e) => {
    if (e.cancelable) e.preventDefault();
    const target = e.currentTarget;
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 110);
    onPaste();
  };

  const handleSendTap = (e) => {
    if (e.cancelable) e.preventDefault();
    const target = e.currentTarget;
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 110);
    onSendLine();
    onFocusKb();
  };

  return (
    <div id="xkeys" className={isOpen ? 'open' : ''}>
      <div className="xkrow">
        {['~', '/', '.', ':', ';', '|', '-', '!', '?', '&', '@', '#'].map((char) => (
          <div
            key={char}
            className="xk"
            onTouchStart={(e) => handleKeyTap(e, char, null)}
            onMouseDown={(e) => handleKeyTap(e, char, null)}
          >
            {char}
          </div>
        ))}
      </div>
      <div className="xkrow">
        {['{', '}', '(', ')', '[', ']', '<', '>', '$', '"', "'", '`'].map((char) => (
          <div
            key={char}
            className="xk"
            onTouchStart={(e) => handleKeyTap(e, char, null)}
            onMouseDown={(e) => handleKeyTap(e, char, null)}
          >
            {char}
          </div>
        ))}
      </div>
      <div className="xkrow">
        <div
          className="xk tool"
          onTouchStart={(e) => handleKeyTap(e, null, 'cc')}
          onMouseDown={(e) => handleKeyTap(e, null, 'cc')}
        >
          ^C
        </div>
        <div
          className="xk tool"
          onTouchStart={(e) => handleKeyTap(e, null, 'cx')}
          onMouseDown={(e) => handleKeyTap(e, null, 'cx')}
        >
          ^X
        </div>
        <div
          className="xk tool"
          onTouchStart={(e) => handleKeyTap(e, null, 'cz')}
          onMouseDown={(e) => handleKeyTap(e, null, 'cz')}
        >
          ^Z
        </div>
        <div
          className="xk tool"
          onTouchStart={(e) => handleKeyTap(e, null, 'cd')}
          onMouseDown={(e) => handleKeyTap(e, null, 'cd')}
        >
          ^D
        </div>
        <div
          className="xk tool"
          onTouchStart={(e) => handleKeyTap(e, null, 'cl')}
          onMouseDown={(e) => handleKeyTap(e, null, 'cl')}
        >
          ^L
        </div>
        <div
          className="xk tool"
          onTouchStart={(e) => handleKeyTap(e, null, 'cu')}
          onMouseDown={(e) => handleKeyTap(e, null, 'cu')}
        >
          ^U
        </div>
        <div
          className="xk tool"
          id="xpaste"
          onTouchStart={handlePasteTap}
          onMouseDown={handlePasteTap}
        >
          PASTE
        </div>
        <div
          className="xk tool"
          id="xsend"
          onTouchStart={handleSendTap}
          onMouseDown={handleSendTap}
        >
          SEND
        </div>
      </div>
    </div>
  );
}
