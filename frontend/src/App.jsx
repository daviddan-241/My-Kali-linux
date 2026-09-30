import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

import HeaderButtons from './components/HeaderButtons.jsx';
import TerminalContainer from './components/TerminalContainer.jsx';
import ExpandableKeys from './components/ExpandableKeys.jsx';
import Keybar from './components/Keybar.jsx';
import SideMenu from './components/SideMenu.jsx';
import SettingsSheet from './components/SettingsSheet.jsx';
import PasteSheet from './components/PasteSheet.jsx';
import InAppBrowser from './components/InAppBrowser.jsx';
import Toast from './components/Toast.jsx';

function saveTokens(sessList) {
  try {
    const list = sessList.map((s) => ({ token: s.token, name: s.name }));
    localStorage.setItem('kali_tokens', JSON.stringify(list));
  } catch (_) {}
}

export default function App() {
  // Saved tokens & preferences
  const [fontSize, setFontSize] = useState(() => {
    return +(localStorage.getItem('kali_fs') || 14);
  });
  const [curTheme, setCurTheme] = useState(() => {
    return localStorage.getItem('kali_theme') || 'kali';
  });

  // UI state
  const [ctrlOn, setCtrlOn] = useState(false);
  const [altOn, setAltOn] = useState(false);
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [notifShow, setNotifShow] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // Refs for non-react closures in event listeners
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const pinnedRef = useRef(true);
  const kbFocusRef = useRef(() => {});
  const activeIdRef = useRef(null);
  const sessionsRef = useRef([]);
  const snRef = useRef(0);
  const toastTimerRef = useRef(null);

  // Sync activeIdRef and sessionsRef
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Toast trigger
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg('');
    }, 1700);
  }, []);

  // Set CTRL / ALT modifier handlers
  const handleSetCtrl = useCallback((val) => {
    setCtrlOn(val);
    if (val) setAltOn(false);
  }, []);

  const handleSetAlt = useCallback((val) => {
    setAltOn(val);
    if (val) setCtrlOn(false);
  }, []);

  // Force re-render helper for session updates
  const updateSessionsState = useCallback(() => {
    setSessions([...sessionsRef.current]);
  }, []);

  // Notification helper
  const bgNotify = useCallback((name, raw) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) {
      return;
    }
    try {
      const n = new Notification('Kali — ' + name, {
        body: raw.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 80),
        icon: 'kali-bg.jpeg',
        tag: 'kali-out',
        renotify: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (_) {}
  }, []);

  // Send data to active session
  const sendToActive = useCallback((str) => {
    const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
    if (s && s.sock && s.sock.connected) {
      s.sock.emit('input', str);
    }
  }, []);

  // Session switching
  const switchToSession = useCallback(
    (id) => {
      setActiveId(id);
      activeIdRef.current = id;

      const s = sessionsRef.current.find((x) => x.id === id);
      if (!s) return;

      s.unread = false;

      if (termRef.current) {
        termRef.current.reset();
        if (s.buf) {
          termRef.current.write(s.buf);
        }
        pinnedRef.current = true;
        try {
          termRef.current.scrollToBottom();
        } catch (_) {}
      }

      updateSessionsState();

      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          if (s.alive && termRef.current) {
            s.sock.emit('resize', {
              cols: termRef.current.cols,
              rows: termRef.current.rows,
            });
          }
        } catch (_) {}
        kbFocusRef.current();
      }, 60);
    },
    [updateSessionsState]
  );

  // New session creation
  const createNewSession = useCallback(
    (existToken, existName) => {
      snRef.current += 1;
      const id = 'S' + snRef.current;
      const name = existName || '#' + snRef.current;

      const sock = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 600,
        reconnectionDelayMax: 5000,
        auth: { token: existToken || null },
      });

      const s = {
        id,
        name,
        token: null,
        sock,
        alive: false,
        unread: false,
        buf: '',
        offT: null,
      };

      sock.on('session_token', (t) => {
        s.token = t;
        saveTokens(sessionsRef.current);
      });

      sock.on('output', (d) => {
        s.buf += d;
        if (s.buf.length > 131072) s.buf = s.buf.slice(-65536);

        if (activeIdRef.current === id) {
          if (termRef.current) {
            termRef.current.write(d);
            if (pinnedRef.current) {
              try {
                termRef.current.scrollToBottom();
              } catch (_) {}
            }
          }
        } else {
          s.unread = true;
          updateSessionsState();
          bgNotify(s.name, d);
        }
      });

      sock.on('snotice', (d) => {
        s.buf += d;
        if (s.buf.length > 131072) s.buf = s.buf.slice(-65536);

        if (activeIdRef.current === id) {
          if (termRef.current) {
            termRef.current.write(d);
            if (pinnedRef.current) {
              try {
                termRef.current.scrollToBottom();
              } catch (_) {}
            }
          }
        } else {
          s.unread = true;
          updateSessionsState();
        }
        bgNotify(
          'Share',
          String(d)
            .replace(/\x1b\[[0-9;]*m/g, '')
            .replace(/\r|\n/g, ' ')
            .trim()
        );
      });

      sock.on('connect', () => {
        s.alive = true;
        clearTimeout(s.offT);
        s.buf = ''; // Drop stale copy on connect; server replays session buffer

        if (activeIdRef.current === id) {
          try {
            termRef.current?.reset();
          } catch (_) {}
        }
        updateSessionsState();

        if (activeIdRef.current === id) {
          try {
            fitAddonRef.current?.fit();
            if (termRef.current) {
              sock.emit('resize', {
                cols: termRef.current.cols,
                rows: termRef.current.rows,
              });
            }
          } catch (_) {}
        }
        kbFocusRef.current();
      });

      const offlineSoon = () => {
        clearTimeout(s.offT);
        s.offT = setTimeout(() => {
          if (!s.sock.connected) {
            s.alive = false;
            updateSessionsState();
          }
        }, 4000);
      };

      sock.on('connect_error', () => {
        if (activeIdRef.current === id) offlineSoon();
      });

      sock.on('disconnect', () => {
        s.alive = false;
        if (activeIdRef.current === id) offlineSoon();
        updateSessionsState();
      });

      sessionsRef.current.push(s);
      setSessions([...sessionsRef.current]);
      switchToSession(id);
    },
    [bgNotify, switchToSession, updateSessionsState]
  );

  // Kill session
  const killSession = useCallback(
    (id) => {
      const list = sessionsRef.current;
      if (list.length <= 1) return;

      const idx = list.findIndex((s) => s.id === id);
      if (idx < 0) return;

      try {
        list[idx].sock.disconnect();
      } catch (_) {}

      list.splice(idx, 1);
      sessionsRef.current = list;
      setSessions([...list]);
      saveTokens(list);

      if (activeIdRef.current === id) {
        const nextId = list[Math.max(0, idx - 1)].id;
        switchToSession(nextId);
      }
    },
    [switchToSession]
  );

  // Boot sessions from localStorage or create new
  useEffect(() => {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem('kali_tokens') || '[]');
    } catch (_) {}

    if (saved.length) {
      saved.forEach((t) => createNewSession(t.token, t.name));
    } else {
      createNewSession();
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
    }
  }, [createNewSession]);

  // visualViewport & window resize listener
  useEffect(() => {
    const appEl = document.getElementById('app');

    const doFit = () => {
      try {
        fitAddonRef.current?.fit();
        const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
        if (s && s.sock && s.sock.connected && termRef.current) {
          s.sock.emit('resize', {
            cols: termRef.current.cols,
            rows: termRef.current.rows,
          });
        }
      } catch (_) {}
    };

    const resizeToVV = () => {
      const vv = window.visualViewport;
      if (appEl) {
        if (vv) {
          appEl.style.top = vv.offsetTop + 'px';
          appEl.style.height = vv.height + 'px';
        } else {
          appEl.style.top = '0px';
          appEl.style.height = window.innerHeight + 'px';
        }
      }
      try {
        window.scrollTo(0, 0);
      } catch (_) {}
      setTimeout(doFit, 30);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resizeToVV);
    }
    window.addEventListener('resize', resizeToVV);
    resizeToVV();

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', resizeToVV);
      }
      window.removeEventListener('resize', resizeToVV);
    };
  }, []);

  // Visibility change handling (iOS backgrounding recovery)
  useEffect(() => {
    let hidAt = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hidAt = Date.now();
        return;
      }
      const wasLong = hidAt && Date.now() - hidAt > 15000;
      sessionsRef.current.forEach((s) => {
        try {
          if (!s.sock.connected) {
            s.sock.connect();
          } else if (wasLong && s.sock.io && s.sock.io.engine) {
            s.sock.io.engine.close();
          }
        } catch (_) {}
      });

      const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
      if (s) {
        s.unread = false;
        updateSessionsState();
      }

      if (typeof Notification !== 'undefined') {
        setNotifShow(Notification.permission === 'default');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [updateSessionsState]);

  // Check notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifShow(Notification.permission === 'default');
    }
  }, []);

  // Font size handler
  const handleSetFs = useCallback((val) => {
    const newFs = Math.max(8, Math.min(26, val));
    setFontSize(newFs);
    localStorage.setItem('kali_fs', newFs);
  }, []);

  // Theme handler
  const handleSetTheme = useCallback((theme) => {
    setCurTheme(theme);
    localStorage.setItem('kali_theme', theme);
  }, []);

  // Notification request handler
  const handleRequestNotif = useCallback(() => {
    if (typeof Notification !== 'undefined') {
      Notification.requestPermission().then((permission) => {
        setNotifShow(permission === 'default');
      });
    }
  }, []);

  // Clipboard reading
  const handleTryClipboardRead = useCallback(() => {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard
        .readText()
        .then((t) => {
          if (t) {
            sendToActive(String(t).replace(/\r\n|\r/g, '\n'));
            kbFocusRef.current();
          } else {
            showToast('Clipboard is empty');
          }
        })
        .catch(() => {
          setIsPasteOpen(true);
        });
    } else {
      setIsPasteOpen(true);
    }
  }, [sendToActive, showToast]);

  // Copy selection from terminal
  const handleCopySelection = useCallback(() => {
    let sel = '';
    try {
      sel = termRef.current?.getSelection();
    } catch (_) {}

    if (sel) {
      const p =
        navigator.clipboard && navigator.clipboard.writeText
          ? navigator.clipboard.writeText(sel)
          : Promise.reject();
      p.then(() => showToast('Copied')).catch(() => showToast('Copy failed'));
    } else {
      showToast('Nothing selected');
    }
    kbFocusRef.current();
  }, [showToast]);

  // Clear screen
  const handleClearScreen = useCallback(() => {
    const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
    if (s) s.buf = '';
    termRef.current?.clear();
    setIsSettingsOpen(false);
    kbFocusRef.current();
  }, []);

  const activeSession = sessions.find((x) => x.id === activeId);
  const isLive = activeSession ? activeSession.alive : false;

  return (
    <div id="app">
      <HeaderButtons
        onOpenMenu={() => setIsMenuOpen(true)}
        onNewSession={() => {
          createNewSession();
          showToast('New terminal');
        }}
      />

      <TerminalContainer
        fontSize={fontSize}
        curTheme={curTheme}
        ctrlOn={ctrlOn}
        altOn={altOn}
        setCtrl={handleSetCtrl}
        setAlt={handleSetAlt}
        onSendInput={handleSendInput}
        onOpenMenu={() => setIsMenuOpen(true)}
        onToggleRail={() => setIsRailOpen((prev) => !prev)}
        isRailOpen={isRailOpen}
        isLive={isLive}
        termRef={termRef}
        fitAddonRef={fitAddonRef}
        pinnedRef={pinnedRef}
        kbFocusRef={kbFocusRef}
      />

      <ExpandableKeys
        isOpen={isRailOpen}
        onSend={sendToActive}
        onPaste={handleTryClipboardRead}
        onSendLine={() => sendToActive('\r')}
        onFocusKb={() => kbFocusRef.current()}
      />

      <Keybar
        ctrlOn={ctrlOn}
        altOn={altOn}
        setCtrl={handleSetCtrl}
        setAlt={handleSetAlt}
        onSend={sendToActive}
        onFocusKb={() => kbFocusRef.current()}
      />

      <SideMenu
        isOpen={isMenuOpen}
        sessions={sessions}
        activeId={activeId}
        onClose={() => setIsMenuOpen(false)}
        onSwitchSession={switchToSession}
        onKillSession={killSession}
        onNewSession={() => createNewSession()}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <SettingsSheet
        isOpen={isSettingsOpen}
        fontSize={fontSize}
        curTheme={curTheme}
        notifShow={notifShow}
        onClose={() => {
          setIsSettingsOpen(false);
          kbFocusRef.current();
        }}
        onChangeFontSize={handleSetFs}
        onChangeTheme={handleSetTheme}
        onRequestNotification={handleRequestNotif}
        onOpenBrowser={() => setIsBrowserOpen(true)}
        onPasteClipboard={handleTryClipboardRead}
        onCopySelection={handleCopySelection}
        onClearScreen={handleClearScreen}
      />

      <PasteSheet
        isOpen={isPasteOpen}
        onClose={() => {
          setIsPasteOpen(false);
          kbFocusRef.current();
        }}
        onSendPaste={(text) => {
          sendToActive(String(text).replace(/\r\n|\r/g, '\n'));
          kbFocusRef.current();
        }}
      />

      <InAppBrowser
        isOpen={isBrowserOpen}
        onClose={() => {
          setIsBrowserOpen(false);
          kbFocusRef.current();
        }}
      />

      <input
        type="file"
        ref={fileInputRef}
        accept="video/*,image/*,*"
        style={{ display: none }}
        onChange={handleFileChange}
      />
      <Toast message={toastMsg} />
    </div>
  );
}
