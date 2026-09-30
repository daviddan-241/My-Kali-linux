import React from 'react';

export default function SettingsSheet({
  isOpen,
  fontSize,
  curTheme,
  notifShow,
  onClose,
  onChangeFontSize,
  onChangeTheme,
  onRequestNotification,
  onOpenBrowser,
  onPasteClipboard,
  onCopySelection,
  onClearScreen,
}) {
  return (
    <>
      <div id="smask" className={isOpen ? 'open' : ''} onClick={onClose} />
      <div id="ssheet" className={isOpen ? 'open' : ''}>
        <div id="shead">
          <span>Settings</span>
          <span id="sclose" onClick={onClose}>
            &#x2715;
          </span>
        </div>

        {notifShow && (
          <div id="s-notif" className="show" onClick={onRequestNotification}>
            <span className="mi">&#x1F514;</span>
            <span className="ml">Enable notifications</span>
          </div>
        )}

        <div className="ssec">Display</div>
        <div className="mrow" style={{ cursor: 'default' }}>
          <span className="mi">A</span>
          <span className="ml">Font Size</span>
          <div className="fsrow">
            <div
              className="fsbtn"
              onClick={() => onChangeFontSize(fontSize - 1)}
            >
              &#8722;
            </div>
            <div id="fsval">{fontSize}</div>
            <div
              className="fsbtn"
              onClick={() => onChangeFontSize(fontSize + 1)}
            >
              +
            </div>
          </div>
        </div>

        <div className="themes">
          {['kali', 'matrix', 'dracula'].map((t) => (
            <div
              key={t}
              className={`topt ${curTheme === t ? 'on' : ''}`}
              onClick={() => onChangeTheme(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        <div className="ssec">Browser</div>
        <div
          id="mbrowser"
          className="sbtn"
          onClick={() => {
            onClose();
            onOpenBrowser();
          }}
        >
          <span className="mi">&#127760;</span>
          <span className="ml">Open Browser</span>
        </div>

        <div className="ssec">Session</div>
        <div
          className="mrow"
          id="mpaste"
          onClick={() => {
            onClose();
            onPasteClipboard();
          }}
        >
          <span className="mi">&#9112;</span>
          <span className="ml">Paste from Clipboard</span>
        </div>
        <div
          className="mrow"
          id="mcopy"
          onClick={() => {
            onClose();
            onCopySelection();
          }}
        >
          <span className="mi">&#x2398;</span>
          <span className="ml">Copy Selection</span>
        </div>
        <div
          className="mrow"
          id="mclear"
          onClick={() => {
            onClose();
            onClearScreen();
          }}
        >
          <span className="mi">&#x239A;</span>
          <span className="ml">Clear Screen</span>
        </div>
      </div>
    </>
  );
}
