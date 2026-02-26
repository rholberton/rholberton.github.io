// ARCHIVE_IMAGES is provided by js/archive-data.js as a global.
const ARCHIVE_IMAGES = window.ARCHIVE_IMAGES || [];

function $(id){ return document.getElementById(id); }

const grid = $('archive_grid');
const filterInput = $('archive_filter');
const countEl = $('archive_count');

const lightbox = $('lightbox');
const lightboxImg = $('lightbox_img');
const lightboxCaption = $('lightbox_caption');

const PAGE_SIZE = 60;
let filtered = [...ARCHIVE_IMAGES];
let rendered = 0;

function normalizeQuery(q){
  return (q || '').trim().toLowerCase();
}

function applyFilter(){
  const q = normalizeQuery(filterInput.value);
  if (!q) {
    filtered = [...ARCHIVE_IMAGES];
  } else {
    filtered = ARCHIVE_IMAGES.filter((f) => f.toLowerCase().includes(q));
  }
  rendered = 0;
  grid.innerHTML = '';
  renderMore();
}

function openLightbox(file){
  lightboxImg.src = `assets/uploads/${file}`;
  lightboxCaption.textContent = file;
  lightbox.showModal();
}

function renderMore(){
  const next = filtered.slice(rendered, rendered + PAGE_SIZE);
  next.forEach((file) => {
    const card = document.createElement('div');
    card.className = 'archive-card';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = file;
    img.src = `assets/uploads/${file}`;

    card.appendChild(img);
    card.addEventListener('click', () => openLightbox(file));
    grid.appendChild(card);
  });

  rendered += next.length;
  countEl.textContent = `${filtered.length.toLocaleString()} image(s) · showing ${Math.min(rendered, filtered.length).toLocaleString()}`;
}

filterInput.addEventListener('input', () => applyFilter());

$('btn_random')?.addEventListener('click', () => {
  if (!filtered.length) return;
  const file = filtered[Math.floor(Math.random() * filtered.length)];
  openLightbox(file);
});

window.addEventListener('scroll', () => {
  const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 800;
  if (nearBottom && rendered < filtered.length) renderMore();
});

applyFilter();
