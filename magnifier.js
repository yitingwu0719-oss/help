export function setupMagnifier(img, zoomLevel = 3) {
  if (!img) return;

  let oldGlass = img.parentElement.querySelector('.img-magnifier-glass');
  if (oldGlass) oldGlass.remove();

  const magnifierGlass = document.createElement('div');
  magnifierGlass.className = 'img-magnifier-glass';

  const container = img.parentElement;
  container.insertBefore(magnifierGlass, img);

  magnifierGlass.style.backgroundImage = `url('${img.src}')`;
  magnifierGlass.style.backgroundRepeat = 'no-repeat';
  magnifierGlass.style.backgroundSize = `${img.width * zoomLevel}px ${img.height * zoomLevel}px`;

  const bw = 2;
  const w = magnifierGlass.offsetWidth / 2;
  const h = magnifierGlass.offsetHeight / 2;

  function getCursorPos(e) {
    const a = img.getBoundingClientRect();
    let x = e.pageX - a.left - window.pageXOffset;
    let y = e.pageY - a.top - window.pageYOffset;
    return { x, y };
  }

  function moveMagnifier(e) {
    e.preventDefault();
    const pos = getCursorPos(e);
    let x = pos.x;
    let y = pos.y;

    if (x > img.width - (w / zoomLevel)) x = img.width - (w / zoomLevel);
    if (x < w / zoomLevel) x = w / zoomLevel;
    if (y > img.height - (h / zoomLevel)) y = img.height - (h / zoomLevel);
    if (y < h / zoomLevel) y = h / zoomLevel;

    magnifierGlass.style.left = `${x - w}px`;
    magnifierGlass.style.top = `${y - h}px`;
    magnifierGlass.style.backgroundPosition = `-${(x * zoomLevel) - w + bw}px -${(y * zoomLevel) - h + bw}px`;
  }

  magnifierGlass.addEventListener('mousemove', moveMagnifier);
  img.addEventListener('mousemove', moveMagnifier);

  magnifierGlass.addEventListener('touchmove', e => moveMagnifier(e.touches[0]));
  img.addEventListener('touchmove', e => moveMagnifier(e.touches[0]));
}
