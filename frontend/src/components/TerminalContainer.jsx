import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const THEMES = {
  kali: {
    background: 'rgba(0,0,0,0.92)',
    foreground: '#f8f8f2',
    cursor: '#00ff41',
    cursorAccent: '#000',
    selectionBackground: 'rgba(85,255,85,0.25)',
    black: '#21222c',
    red: '#ff5555',
    green: '#55ff55',
    yellow: '#f1fa8c',
    blue: '#6272a4',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff47',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  matrix: {
    background: 'rgba(0,0,0,0.96)',
    foreground: '#00ff41',
    cursor: '#00ff41',
    cursorAccent: '#000',
    selectionBackground: 'rgba(0,255,65,0.2)',
    black: '#0d0d0d',
    red: '#cc0000',
    green: '#00ff41',
    yellow: '#aaff00',
    blue: '#007700',
    magenta: '#00aa44',
    cyan: '#00ffaa',
    white: '#aaffaa',
    brightBlack: '#005500',
    brightRed: '#ff4444',
    brightGreen: '#55ff55',
    brightYellow: '#ddff55',
    brightBlue: '#00aa22',
    brightMagenta: '#00cc66',
    brightCyan: '#55ffaa',
    brightWhite: '#ccffcc',
  },
  dracula: {
    background: 'rgba(40,42,54,0.96)',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#282a36',
    selectionBackground: 'rgba(248,248,242,0.2)',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff47',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
};

const ZWS = '\u200b';

export default function TerminalContainer({
  fontSize,
  curTheme,
  ctrlOn,
  altOn,
  setCtrl,
  setAlt,
  onSendInput,
  onOpenMenu,
  onToggleRail,
  isRailOpen,
  isLive,
  termRef,
  fitAddonRef,
  pinnedRef,
  kbFocusRef,
}) {
  const tinnerRef = useRef(null);
  const kbRef = useRef(null);
  const [showGobot, setShowGobot] = useState(false);

  const focusKb = useCallback(() => {
    const isDesktop = !!(
      window.matchMedia &&
      window.matchMedia('(pointer:fine) and (hover:hover)').matches
    );
    if (isDesktop) {
      try {
        termRef.current?.focus();
      } catch (_) {}
      return;
    }
    try {
      kbRef.current?.focus();
    } catch (_) {}
    setTimeout(() => {
      try {
        kbRef.current?.focus();
      } catch (_) {}
    }, 40);
  }, [termRef]);

  useEffect(() => {
    kbFocusRef.current = focusKb;
  }, [focusKb, kbFocusRef]);

  // Init xterm instance
  useEffect(() => {
    if (!tinnerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: fontSize,
      fontFamily: 'ui-monospace,SFMono-Regular,Menlo,"Courier New",monospace',
      lineHeight: 1.2,
      scrollback: 50000,
      allowTransparency: true,
      theme: THEMES[curTheme] || THEMES.kali,
      disableStdin: false,
      convertEol: false,
      scrollOnUserInput: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(tinnerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Pinned tracking
    const updatePinned = () => {
      try {
        const b = term.buffer.active;
        const pinned = b.viewportY >= b.length - term.rows - 2;
        pinnedRef.current = pinned;
        setShowGobot(!pinned);
      } catch (_) {}
    };

    term.onScroll(updatePinned);

    // Desktop key handler
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard
            .readText()
            .then((t) => {
              if (t) onSendInput(String(t).replace(/\r\n|\r/g, '\n'));
            })
            .catch(() => {});
        }
        return false;
      }
      if (ctrlOn && e.key.length === 1) {
        const c = e.key.toUpperCase().charCodeAt(0) - 64;
        onSendInput(c >= 1 && c <= 26 ? String.fromCharCode(c) : e.key);
        setCtrl(false);
        return false;
      }
      if (altOn && e.key.length === 1) {
        onSendInput('\x1b' + e.key);
        setAlt(false);
        return false;
      }
      return true;
    });

    term.onData((data) => {
      onSendInput(data);
    });

    // Resize observer for fitting
    const observer = new ResizeObserver(() => {
      setTimeout(() => {
        try {
          fitAddon.fit();
        } catch (_) {}
      }, 40);
    });
    observer.observe(tinnerRef.current);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []); // Run once on mount

  // Update theme & font size on change
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      termRef.current.options.theme = THEMES[curTheme] || THEMES.kali;
      try {
        fitAddonRef.current?.fit();
      } catch (_) {}
    }
  }, [fontSize, curTheme, termRef, fitAddonRef]);

  // Touch & momentum scrolling on hidden textarea #kb
  useEffect(() => {
    const kb = kbRef.current;
    if (!kb) return;

    let tx0 = 0,
      ty0 = 0,
      ty1 = 0,
      swp = false,
      vel = 0,
      sacc = 0;

    const lineH = () => Math.max(10, fontSize * 1.2);
    const atBotV = () => {
      try {
        const term = termRef.current;
        if (!term) return true;
        const b = term.buffer.active;
        return b.viewportY >= b.length - term.rows;
      } catch (_) {
        return true;
      }
    };

    const handleTouchStart = (e) => {
      tx0 = e.touches[0].clientX;
      ty0 = ty1 = e.touches[0].clientY;
      swp = false;
      sacc = 0;
    };

    const handleTouchMove = (e) => {
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dy = ty1 - y;
      ty1 = y;
      vel = dy;
      sacc += dy;

      const lh = lineH();
      const lines = Math.trunc(sacc / lh);
      if (lines) {
        try {
          termRef.current?.scrollLines(lines);
        } catch (_) {}
        sacc -= lines * lh;
        if (lines > 0 && atBotV()) {
          try {
            termRef.current?.scrollToBottom();
          } catch (_) {}
          sacc = 0;
          vel = 0;
        }
      }

      if (!swp && tx0 < 32 && x - tx0 > 55 && Math.abs(y - ty0) < 70) {
        swp = true;
        onOpenMenu();
      }
    };

    const handleTouchEnd = () => {
      let v = vel;
      vel = 0;
      const lh = lineH();
      let fl = 0;

      const mom = () => {
        if (Math.abs(v) < 0.6) return;
        fl += v;
        const lines = Math.trunc(fl / lh);
        if (lines) {
          try {
            termRef.current?.scrollLines(lines);
          } catch (_) {
            return;
          }
          fl -= lines * lh;
          if (lines > 0 && atBotV()) {
            try {
              termRef.current?.scrollToBottom();
            } catch (_) {}
            return;
          }
        }
        v *= 0.92;
        requestAnimationFrame(mom);
      };

      requestAnimationFrame(mom);
    };

    kb.addEventListener('touchstart', handleTouchStart, { passive: true });
    kb.addEventListener('touchmove', handleTouchMove, { passive: true });
    kb.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      kb.removeEventListener('touchstart', handleTouchStart);
      kb.removeEventListener('touchmove', handleTouchMove);
      kb.removeEventListener('touchend', handleTouchEnd);
    };
  }, [fontSize, onOpenMenu, termRef]);

  // Reset kb input value helper
  const kbReset = () => {
    try {
      if (kbRef.current) kbRef.current.value = ZWS;
    } catch (_) {}
  };

  const handleKbKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSendInput('\r');
      kbReset();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onSendInput('\t');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onSendInput('\x1b');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onSendInput('\x1b[A');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onSendInput('\x1b[B');
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSendInput('\x1b[D');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSendInput('\x1b[C');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      onSendInput('\x7f');
    }
  };

  const handleKbInput = () => {
    const kb = kbRef.current;
    if (!kb) return;
    const v = kb.value;
    if (!v || v === ZWS) {
      kbReset();
      return;
    }
    const typed = v.replace(ZWS, '');
    if (!typed) {
      kbReset();
      return;
    }

    if (ctrlOn) {
      const c = typed[0].toUpperCase().charCodeAt(0) - 64;
      onSendInput(c >= 1 && c <= 26 ? String.fromCharCode(c) : typed[0]);
      if (typed.length > 1) onSendInput(typed.slice(1));
      setCtrl(false);
    } else if (altOn) {
      onSendInput('\x1b' + typed[0]);
      if (typed.length > 1) onSendInput(typed.slice(1));
      setAlt(false);
    } else {
      onSendInput(typed.replace(/\r\n|\r/g, '\n'));
    }
    kbReset();
  };

  const handleKbPaste = (e) => {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData)?.getData('text');
    if (t) {
      onSendInput(t.replace(/\r\n|\r/g, '\n'));
      kbReset();
    }
  };

  const handleGobotClick = () => {
    try {
      termRef.current?.scrollToBottom();
    } catch (_) {}
    setShowGobot(false);
    focusKb();
  };

  return (
    <div
      id="term-area"
      onClick={() => {
        try {
          termRef.current?.focus();
        } catch (_) {}
      }}
    >
      <div id="tinner" ref={tinnerRef} />
      <textarea
        ref={kbRef}
        id="kb"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        inputMode="text"
        enterKeyHint="send"
        tabIndex={0}
        aria-hidden="true"
        onFocus={kbReset}
        onKeyDown={handleKbKeyDown}
        onInput={handleKbInput}
        onPaste={handleKbPaste}
      />
      <div
        id="gobot"
        className={showGobot ? 'show' : ''}
        onClick={handleGobotClick}
      >
        &#x25BC;
      </div>
      <div
        id="rail"
        className={isRailOpen ? 'on' : ''}
        onClick={onToggleRail}
      >
        {isRailOpen ? '✕' : '⌨'}
      </div>
      <div id="badge" className={isLive ? 'on' : 'off'}>
        {isLive ? '● LIVE' : '● OFF'}
      </div>
    </div>
  );
}
