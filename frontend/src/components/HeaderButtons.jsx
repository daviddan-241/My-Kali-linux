import React from 'react';

export default function HeaderButtons({ onOpenMenu, onNewSession }) {
  return (
    <>
      <div id="menubtn" onClick={onOpenMenu} title="Menu">
        &#9776;
      </div>
      <div id="newbtn" onClick={onNewSession} title="New Terminal">
        +
      </div>
    </>
  );
}
