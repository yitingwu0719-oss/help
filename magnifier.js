export function setupMagnifier(img, zoomLevel = 3, glassSize = 200) {
  if (!img) return;

  let oldGlass = document.querySelector('.img-magnifier-glass');
  if (oldGlass) oldGlass.remove();

  const magnifierGlass = document.createElement('div');
  magnifierGlass.className = 'img-magnifier-glass';
  document.body.appendChild(magnifierGlass);

  // 放大鏡外觀
  magnifierGlass.style.width = `${glassSize}px`;
  magnifierGlass.style.height = `${glassSize}px`;
  magnifierGlass.style.border = '1px solid #000';
  magnifierGlass.style.position = 'absolute';
  magnifierGlass.style.right = '20px'; // 固定在圖片右邊
  magnifierGlass.style.top = img.getBoundingClientRect().top + 'px';
  magnifierGlass.style.backgroundImage = `url('${img.src}')`;
  magnifierGlass.style.backgroundRepeat = 'no-repeat';
  magnifierGlass.style.backgroundSize = `${img.width * zoomLevel}px ${img.height * zoomLevel}px`;
  magnifierGlass.style.display = 'none'; // 預設隱藏

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

    if (x < 0 || y < 0 || x > img.width || y > img.height) {
      magnifierGlass.style.display = 'none';
      return;
    }

    magnifierGlass.style.display = 'block';
    magnifierGlass.style.backgroundPosition = `-${x * zoomLevel - glassSize / 2}px -${y * zoomLevel - glassSize / 2}px`;
  }

  img.addEventListener('mousemove', moveMagnifier);
  img.addEventListener('mouseenter', () => {
    magnifierGlass.style.display = 'block';
  });
  img.addEventListener('mouseleave', () => {
    magnifierGlass.style.display = 'none';
  });
}
