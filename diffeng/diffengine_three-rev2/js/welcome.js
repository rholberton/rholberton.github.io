const FEEDS = [
  'assets/img/welcome.jpg',
  'assets/img/welcome.jpg',
  'assets/img/welcome.jpg'
];

let idx = 0;
const player = document.getElementById('Player');
const selectors = [
  document.getElementById('webcam-selector-1'),
  document.getElementById('webcam-selector-2'),
  document.getElementById('webcam-selector-3'),
];

function setActive(i){
  idx = (i + FEEDS.length) % FEEDS.length;
  player.src = FEEDS[idx];
  selectors.forEach((el, j) => el.classList.toggle('webcam-active', j === idx));
}

selectors.forEach((el, i) => {
  el.addEventListener('click', () => setActive(i));
});

document.getElementById('webcam-control-arrow-left')?.addEventListener('click', () => setActive(idx - 1));
document.getElementById('webcam-control-arrow-right')?.addEventListener('click', () => setActive(idx + 1));

setActive(0);
