// An iPhone, iPod or iPad, an iPad asking for the desktop site included (it says it's a Mac, with a touch screen).
export const onIOS = () => typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);
