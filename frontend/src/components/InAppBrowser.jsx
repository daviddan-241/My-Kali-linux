import React, { useState, useRef, useEffect } from 'react';

export default function InAppBrowser({ isOpen, onClose }) {
  const [url, setUrl] = useState('');
  const [iframeSrc, setIframeSrc] = useState('about:blank');
  const urlInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        try {
          urlInputRef.current?.focus();
        } catch (_) {}
      }, 60);
    } else {
      setIframeSrc('about:blank');
    }
  }, [isOpen]);

  const loadUrl = (inputUrl) => {
    let u = (inputUrl || url).trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) {
      u = 'https://' + u;
    }
    setUrl(u);
    setIframeSrc(u);
    try {
      urlInputRef.current?.blur();
    } catch (_) {}
  };

  const openExternal = () => {
    let u = url.trim();
    if (u) {
      if (!/^https?:\/\//i.test(u)) {
        u = 'https://' + u;
      }
      window.open(u, '_blank');
    }
  };

  return (
    <div id="bwrap" className={isOpen ? 'open' : ''}>
      <div id="bbar">
        <div id="bclose" onClick={onClose}>
          &#x2715;
        </div>
        <input
          ref={urlInputRef}
          id="burl"
          type="url"
          placeholder="Search or enter address"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              loadUrl();
            }
          }}
        />
        <div id="bgo" onClick={() => loadUrl()}>
          Go
        </div>
        <div id="bext" onClick={openExternal}>
          &#x2197;
        </div>
      </div>
      <iframe
        id="bframe"
        src={iframeSrc}
        referrerPolicy="no-referrer"
        title="In-App Browser"
      />
      <div id="bhint">
        Some sites (Google, Facebook, banks) refuse to be embedded — tap &#x2197; to open them outside.
      </div>
    </div>
  );
}
