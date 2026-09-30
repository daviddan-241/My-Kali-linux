import React from 'react';

export default function SideMenu({
  isOpen,
  sessions,
  activeId,
  onClose,
  onSwitchSession,
  onKillSession,
  onNewSession,
  onOpenSettings,
}) {
  return (
    <>
      <div id="mmask" className={isOpen ? 'open' : ''} onClick={onClose} />
      <div id="menu" className={isOpen ? 'open' : ''}>
        <div id="mhead">
          <span>Kali</span>
          <span id="mclose" onClick={onClose}>
            &#x2715;
          </span>
        </div>

        <div className="mgroup" id="sgroup">
          <div className="msec">Sessions</div>
          <div
            className="mrow"
            id="mnew"
            onClick={() => {
              onNewSession();
              onClose();
            }}
          >
            <span className="mi">+</span>
            <span className="ml">New Terminal</span>
          </div>

          <div id="stabs">
            {sessions.map((s) => {
              const isCur = s.id === activeId;
              const statusClass = s.alive ? ' live' : ' dead';
              const unreadClass = s.unread ? ' unread' : '';
              return (
                <div
                  key={s.id}
                  className={`tab${isCur ? ' cur' : ''}${statusClass}${unreadClass}`}
                  onClick={(e) => {
                    if (e.target.classList.contains('tx')) return;
                    if (s.id !== activeId) onSwitchSession(s.id);
                  }}
                >
                  <div className="tdot" />
                  <div className="tname">{s.name}</div>
                  {sessions.length > 1 && (
                    <div
                      className="tx"
                      data-id={s.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onKillSession(s.id);
                      }}
                    >
                      &#x2715;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          id="msettingsrow"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <span className="mi">&#9881;&#xFE0F;</span>
          <span className="ml">Settings</span>
        </div>
      </div>
    </>
  );
}
