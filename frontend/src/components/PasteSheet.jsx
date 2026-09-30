import React, { useState, useEffect, useRef } from 'react';

export default function PasteSheet({ isOpen, onClose, onSendPaste }) {
  const [pasteText, setPasteText] = useState('');
  const txtRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        try {
          txtRef.current?.focus();
        } catch (_) {}
      }, 60);
    } else {
      setPasteText('');
    }
  }, [isOpen]);

  const handlePasteEvent = (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text');
    if (text) {
      e.preventDefault();
      setPasteText('');
      onClose();
      onSendPaste(text);
    }
  };

  const handleSend = () => {
    const text = pasteText;
    setPasteText('');
    onClose();
    if (text) {
      onSendPaste(text);
    }
  };

  return (
    <>
      <div id="pmask" className={isOpen ? 'open' : ''} onClick={onClose} />
      <div id="psheet" className={isOpen ? 'open' : ''}>
        <div id="phead">
          <span>Paste</span>
          <span id="pclose" onClick={onClose}>
            &#x2715;
          </span>
        </div>
        <textarea
          ref={txtRef}
          id="ptxt"
          rows={5}
          placeholder="Long-press here, then tap Paste"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          onPaste={handlePasteEvent}
        />
        <div id="psend" onClick={handleSend}>
          PASTE INTO TERMINAL
        </div>
      </div>
    </>
  );
}
