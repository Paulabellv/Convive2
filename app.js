const caseEl = document.querySelector('.home-screen') || document.querySelector('.bookcase');
const colors = ['#642226', '#273751', '#704D39', '#66768D', '#8b5a36', '#2b4360'];
const categoryNames = { stories: 'Historias & Cartas', images: 'Imágenes & Fotos', research: 'Investigación & Curiosidades' };
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const SUPABASE_URL = window.CONVIVE_SUPABASE_URL || 'https://ffnepppmsoojjicjcvcl.supabase.co';
const SUPABASE_ANON_KEY = window.CONVIVE_SUPABASE_ANON_KEY || 'sb_publishable_B6eBg_TTuamWtynTeGMjog_Rt-hunXb';

let supabaseClient = null;
if (window.supabase) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[Convive] Cliente de Supabase inicializado correctamente con:', SUPABASE_URL);
  } catch (err) {
    console.error('[Convive] Error al inicializar cliente de Supabase:', err);
  }
} else {
  console.error('[Convive] No se encontró la librería window.supabase desde CDN.');
}

const dialog = document.querySelector('#archive-dialog');
const imagePreview = document.querySelector('#image-preview');
const documentPreview = document.querySelector('#document-preview');
const previewUnavailable = document.querySelector('#preview-unavailable');
const actionDialog = document.querySelector('#action-dialog');
const toast = document.querySelector('#toast');
const homeScreen = document.querySelector('.home-screen');
const categoryPage = document.querySelector('#category-page');
const categoryBooks = document.querySelector('#category-books');
const countEl = document.querySelector('.count');
let currentBook = null;
let selectedCategory = 'research';
let activeShelf = null;
let homeIndex = 0;
let bookPage = 0;
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

function openAction({ eyebrow = '', title, description = '', fields = [], actions = [] }) {
  const titleEl = document.querySelector('#action-title');
  const descriptionEl = document.querySelector('#action-description');
  const fieldsEl = document.querySelector('#action-fields');
  const buttonsEl = document.querySelector('#action-buttons');
  document.querySelector('#action-eyebrow').textContent = eyebrow;
  titleEl.textContent = title;
  descriptionEl.textContent = description;
  descriptionEl.hidden = !description;
  fieldsEl.replaceChildren();
  buttonsEl.replaceChildren();
  fields.forEach(field => {
    const control = document.createElement(field.type === 'textarea' ? 'textarea' : field.type === 'select' ? 'select' : 'input');
    control.name = field.name;
    control.placeholder = field.placeholder || '';
    if (field.type === 'select') {
      field.options.forEach(option => control.add(new Option(option.label, option.value, false, option.value === field.value)));
    } else {
      if (field.type !== 'textarea') control.type = field.type || 'text';
      control.value = field.value || '';
    }
    fieldsEl.append(control);
  });
  return new Promise(resolve => {
    let resolved = false;
    const finish = action => {
      if (resolved) return;
      resolved = true;
      const values = Object.fromEntries([...fieldsEl.querySelectorAll('[name]')].map(input => [input.name, input.value]));
      if (actionDialog.open) actionDialog.close();
      resolve({ action, values });
    };
    actions.forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.className = action.className || '';
      button.addEventListener('click', () => finish(action.value));
      buttonsEl.append(button);
    });
    actionDialog.onclose = () => finish('cancel');
    actionDialog.showModal();
    fieldsEl.querySelector('input, textarea, select')?.focus();
  });
}

const cancelAction = { label: 'Cancelar', value: 'cancel' };
const saveAction = { label: 'Guardar', value: 'save', className: 'primary' };

function updateModalState() {
  const hasOpenDialog = !!document.querySelector('dialog[open], .swal2-container, .category-page.open');
  document.body.classList.toggle('modal-open', hasOpenDialog);
  if (hasOpenDialog) {
    document.querySelector('#owl-bubble')?.classList.remove('visible');
  }
}

// Escuchar aperturas/cierres de diálogos HTML y SweetAlert
document.addEventListener('close', updateModalState, true);
document.addEventListener('cancel', updateModalState, true);
// Observar solo el estado 'open' en diálogos y clases de modal
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.attributeName === 'open' || m.attributeName === 'class') {
      updateModalState();
      break;
    }
  }
});
observer.observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });

function updateCount() {
  const amount = document.querySelectorAll('.book').length;
  const countEl = document.querySelector('#book-count') || document.querySelector('.count');
  if (countEl) {
    countEl.textContent = `${amount} ${amount === 1 ? 'tesoro en la biblioteca' : 'tesoros en la biblioteca'}`;
  }
}

function renumberShelves() {
  homeShelves().forEach((shelf, index) => {
    const label = shelf.querySelector('.shelf-label');
    if (label) {
      label.textContent = `${String(index + 1).padStart(2, '0')} — ${categoryNames[shelf.dataset.category] || shelf.dataset.category}`;
    }
  });
}

function showArchive(book) {
  currentBook = book;
  document.querySelector('#modal-title').textContent = book.dataset.title;
  document.querySelector('#modal-kind').textContent = book.dataset.kind;
  document.querySelector('#modal-desc').textContent = book.dataset.desc || 'Sin descripción por el momento.';
  document.querySelector('#modal-year').textContent = book.dataset.year || '';
  document.querySelector('#modal-category').textContent = categoryNames[book.dataset.cat] || book.dataset.cat;
  imagePreview.classList.remove('visible');
  documentPreview.classList.remove('visible');
  previewUnavailable.classList.remove('visible');
  imagePreview.removeAttribute('src');
  documentPreview.removeAttribute('src');
  if (book.dataset.url) {
    const type = book.dataset.mime || '';
    if (type.startsWith('image/')) { imagePreview.src = book.dataset.url; imagePreview.classList.add('visible'); }
    else if (type === 'application/pdf' || type.startsWith('text/')) { documentPreview.src = book.dataset.url; documentPreview.classList.add('visible'); }
    else previewUnavailable.classList.add('visible');
  }
  dialog.showModal();
  updateModalState();
}

async function confirmDelete(item, type) {
  const answer = await openAction({
    eyebrow: 'Confirmación', title: `¿Eliminar este ${type}?`, description: 'Esta acción no se puede deshacer.',
    actions: [cancelAction, { label: 'Eliminar', value: 'delete', className: 'danger' }]
  });
  if (answer.action !== 'delete') return;
  if (item === currentBook) dialog.close();
  
  if (item.dataset.remoteId || item.dataset.filePath) {
    removeLocalArchive(item.dataset.remoteId, item.dataset.filePath);
  }
  
  if (item.dataset.remoteId && supabaseClient) {
    try {
      if (item.dataset.filePath) await supabaseClient.storage.from('archives').remove([item.dataset.filePath]);
      await supabaseClient.from('archives').delete().eq('id', item.dataset.remoteId);
    } catch (e) {
      console.warn('[Convive] Advertencia al eliminar de Supabase:', e);
    }
  }
  if (item.dataset.url?.startsWith('blob:')) URL.revokeObjectURL(item.dataset.url);
  const wasVisible = item.parentElement === categoryBooks;
  item.remove();
  if (wasVisible) renderBookPage();
  updateCount();
  notify(`${type[0].toUpperCase() + type.slice(1)} eliminado.`);
}

function prepareBook(book) {
  const extension = book.dataset.extension || 'ARCH';
  if (!book.querySelector('.extension')) {
    const label = document.createElement('span');
    label.className = 'extension';
    label.textContent = extension;
    book.append(label);
  }
  book.addEventListener('click', () => showArchive(book));
}

document.querySelectorAll('.book').forEach(prepareBook);

function prepareShelf(shelf) {
  if (!shelf || shelf.dataset.prepared) return;
  shelf.dataset.prepared = 'true';
  attachCategoryNavigation(shelf);
  const moreBtn = shelf.querySelector('.shelf-more');
  if (moreBtn) activateAddBookButton(moreBtn);
  const editBtn = shelf.querySelector('.category-edit');
  if (editBtn) {
    editBtn.addEventListener('click', event => {
      event.stopPropagation();
      editCategory(editBtn);
    });
  }
}

// Helper para convertir archivos a Data URL (Base64) garantizando sincronización entre diferentes dispositivos
function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || file.size > 3 * 1024 * 1024) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// Capa de Persistencia Local (LocalStorage Cache)
function getLocalArchives() {
  try {
    return JSON.parse(localStorage.getItem('convive_archives') || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalArchive(archive) {
  try {
    const list = getLocalArchives();
    const existingIndex = list.findIndex(item => item.id === archive.id || (item.file_path && item.file_path === archive.file_path));
    if (existingIndex >= 0) {
      list[existingIndex] = archive;
    } else {
      list.push(archive);
    }
    localStorage.setItem('convive_archives', JSON.stringify(list));
  } catch (e) {
    console.warn('[Convive] Error en localStorage:', e);
  }
}

function removeLocalArchive(id, filePath) {
  try {
    const list = getLocalArchives().filter(item => item.id !== id && item.file_path !== filePath);
    localStorage.setItem('convive_archives', JSON.stringify(list));
  } catch (e) {
    console.warn('[Convive] Error al eliminar de localStorage:', e);
  }
}

function shelfFor(categoryKey) {
  if (!categoryKey) return null;
  return [...document.querySelectorAll('.shelf')].find(s => s.dataset.category === categoryKey) || null;
}

async function loadRemoteArchives() {
  let archives = [];
  
  // 1. Consultar la base de datos de Supabase desde cualquier dispositivo
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('archives').select('*').order('created_at', { ascending: true });
      if (!error && Array.isArray(data)) {
        archives = data;
        console.log(`[Convive] Sincronizados ${data.length} tesoros desde Supabase Cloud DB.`);
      } else if (error) {
        console.warn('[Convive] Nota sobre Supabase DB:', error.message);
      }
    } catch (e) {
      console.warn('[Convive] Error al conectar con Supabase DB:', e);
    }
  }

  // 2. Fusionar con caché local
  const localList = getLocalArchives();
  localList.forEach(localItem => {
    if (!archives.some(a => a.id === localItem.id || a.file_path === localItem.file_path)) {
      archives.push(localItem);
    }
  });

  console.log(`[Convive] Renderizando ${archives.length} tesoros en la biblioteca.`);

  archives.forEach(archive => {
    if (document.querySelector(`.book[data-remote-id="${archive.id}"]`)) return;

    let shelf = shelfFor(archive.category);
    if (!shelf) {
      let fallbackCat = 'research';
      if (archive.mime_type && archive.mime_type.startsWith('image/')) fallbackCat = 'images';
      else if (archive.mime_type && (archive.mime_type.startsWith('text/') || archive.mime_type === 'application/pdf')) fallbackCat = 'stories';
      shelf = shelfFor(fallbackCat) || document.querySelector('.shelf');
    }
    if (!shelf) return;

    // Extraer descripción limpia y Data URL incrustado si existe
    let cleanDesc = archive.description || 'Sin descripción.';
    let embeddedUrl = null;
    if (archive.description && archive.description.startsWith('{')) {
      try {
        const parsed = JSON.parse(archive.description);
        cleanDesc = parsed.desc || cleanDesc;
        embeddedUrl = parsed.dataUrl || null;
      } catch (e) {}
    }

    // Determinar la URL pública
    let publicUrl = embeddedUrl || archive.url;
    if (!publicUrl && supabaseClient && archive.file_path) {
      publicUrl = supabaseClient.storage.from('archives').getPublicUrl(archive.file_path).data?.publicUrl;
    }

    const book = document.createElement('button');
    book.className = 'book';
    book.style.setProperty('--book', colors[Math.floor(Math.random() * colors.length)]);
    book.style.setProperty('--height', `${125 + Math.floor(Math.random() * 35)}px`);
    
    const catKey = shelf.dataset.category;
    const catName = categoryNames[catKey] || catKey;
    const ext = (archive.title.split('.').pop() || 'ARCH').toUpperCase();

    Object.assign(book.dataset, {
      cat: catKey,
      title: archive.title,
      year: new Date(archive.created_at || Date.now()).getFullYear(),
      kind: `${(archive.mime_type || 'archivo').split('/').pop().toUpperCase()} · ${catName}`,
      extension: ext,
      desc: cleanDesc,
      mime: archive.mime_type || '',
      url: publicUrl || '',
      remoteId: archive.id,
      filePath: archive.file_path
    });

    book.innerHTML = '<span class="title"></span><span class="year"></span>';
    book.querySelector('.title').textContent = archive.title;
    book.querySelector('.year').textContent = book.dataset.year;

    const shelfMore = shelf.querySelector('.shelf-more');
    if (shelfMore) {
      shelf.insertBefore(book, shelfMore);
    } else {
      shelf.appendChild(book);
    }
    prepareBook(book);
  });

  updateCount();
  renumberShelves();
  renderHomeCarousel();
}

const searchInput = document.querySelector('#archive-search');
const searchResults = document.querySelector('#search-results');
searchInput?.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  searchResults.replaceChildren();
  if (!query) { searchResults.classList.remove('open'); return; }
  const matches = [...document.querySelectorAll('.book')].filter(book => `${book.dataset.title} ${book.dataset.desc} ${book.dataset.kind}`.toLowerCase().includes(query)).slice(0, 6);
  matches.forEach(book => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const meta = document.createElement('small');
    button.append(book.dataset.title, meta);
    meta.textContent = categoryNames[book.dataset.cat] || book.dataset.cat;
    button.addEventListener('click', () => { searchResults.classList.remove('open'); searchInput.value = ''; showArchive(book); });
    item.append(button); searchResults.append(item);
  });
  if (!matches.length) { const item = document.createElement('li'); item.textContent = 'No se encontraron resultados'; item.style.cssText = 'padding:9px;font-size:.7rem;opacity:.65'; searchResults.append(item); }
  searchResults.classList.add('open');
});
document.addEventListener('click', event => { if (!event.target.closest('.search-wrap')) searchResults?.classList.remove('open'); });

function applyFilter(button) {
  document.querySelector('.filters .active')?.classList.remove('active');
  button.classList.add('active');
  const filter = button.dataset.filter;
  caseEl.classList.toggle('filtered', filter !== 'all');
  document.querySelectorAll('.book').forEach(book => book.classList.toggle('shown', book.dataset.cat === filter));
}
document.querySelectorAll('.filters button').forEach(button => button.addEventListener('click', () => applyFilter(button)));

function categoryOptions() {
  return Object.entries(categoryNames).map(([value, label]) => ({ value, label }));
}
function shelfFor(category) { return document.querySelector(`.shelf[data-category="${category}"]`); }

function deleteNote(note) {
  const wasVisible = note.parentElement === categoryBooks;
  note.remove();
  if (wasVisible) renderBookPage();
  updateCount();
  notify('Nota eliminada.');
}

async function editNote(note) {
  const textEl = note.querySelector('.note-text') || note;
  const currentText = textEl.textContent.trim();
  const choice = await openAction({
    eyebrow: 'Nota de papel',
    title: 'Editar nota',
    fields: [{ name: 'text', type: 'textarea', value: currentText }],
    actions: [cancelAction, { label: 'Eliminar nota', value: 'delete', className: 'danger' }, saveAction]
  });
  if (choice.action === 'delete') {
    deleteNote(note);
    return;
  }
  if (choice.action === 'save' && choice.values.text.trim()) {
    if (textEl !== note) textEl.textContent = choice.values.text.trim();
    else note.textContent = choice.values.text.trim();
    notify('Nota actualizada.');
  }
}

function attachNote(note) {
  const deleteBtn = note.querySelector('.note-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', event => {
      event.stopPropagation();
      deleteNote(note);
    });
  }
  note.addEventListener('click', event => {
    if (event.target.closest('.note-delete')) return;
    event.stopPropagation();
    editNote(note);
  });
}
document.querySelectorAll('.note').forEach(attachNote);

const addDialog = document.querySelector('#add-dialog');
const stepChoice = document.querySelector('#add-step-choice');
const stepFile = document.querySelector('#add-step-file');
const stepNote = document.querySelector('#add-step-note');
const customNoteForm = document.querySelector('#custom-note-form');
const customFileForm = document.querySelector('#custom-file-form');

function populateCategorySelect(selectEl) {
  if (!selectEl) return;
  selectEl.replaceChildren(...categoryOptions().map(opt => new Option(opt.label, opt.value, false, opt.value === selectedCategory)));
}

function showAddStep(step) {
  stepChoice.style.display = step === 'choice' ? 'block' : 'none';
  stepFile.style.display = step === 'file' ? 'block' : 'none';
  stepNote.style.display = step === 'note' ? 'block' : 'none';
}

function openAddDialog() {
  showAddStep('choice');
  addDialog.showModal();
  updateModalState();
}

document.querySelector('#add-item')?.addEventListener('click', openAddDialog);
document.querySelector('#category-upload')?.addEventListener('click', openAddDialog);
document.querySelector('#add-dialog-close')?.addEventListener('click', () => addDialog.close());

document.querySelector('#choose-file')?.addEventListener('click', () => {
  populateCategorySelect(document.querySelector('#custom-file-category'));
  document.querySelector('#custom-file-input').value = '';
  document.querySelector('#custom-file-desc').value = '';
  showAddStep('file');
});

document.querySelector('#choose-note')?.addEventListener('click', () => {
  populateCategorySelect(document.querySelector('#custom-note-category'));
  document.querySelector('#custom-note-text').value = '';
  showAddStep('note');
});

document.querySelector('#file-back-btn')?.addEventListener('click', () => showAddStep('choice'));
document.querySelector('#note-back-btn')?.addEventListener('click', () => showAddStep('choice'));

customFileForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const fileInput = document.querySelector('#custom-file-input');
  const file = fileInput.files[0];
  const category = document.querySelector('#custom-file-category').value;
  const description = document.querySelector('#custom-file-desc').value.trim();
  if (!file) return;
  addDialog.close();
  await processFileUpload(file, category, description);
});

customNoteForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const text = document.querySelector('#custom-note-text').value.trim();
  const category = document.querySelector('#custom-note-category').value;
  if (!text) return;
  addDialog.close();

  // Convertir la nota a un archivo de texto para persistir en Supabase
  const safeTitle = text.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '-');
  const noteFile = new File([text], `Nota-${safeTitle || 'nota'}.txt`, { type: 'text/plain' });
  await processFileUpload(noteFile, category, text);
});

const taskDialog = document.querySelector('#task-dialog');
const taskForm = document.querySelector('#task-form');
let editingTask = null;
function attachTask(task) {
  task.querySelector('.task-check').addEventListener('click', () => { task.classList.toggle('done'); task.querySelector('.task-check').textContent = task.classList.contains('done') ? '✓' : '□'; });
  task.querySelector('.task-delete').addEventListener('click', () => task.remove());
  task.querySelector('.task-edit').addEventListener('click', () => openTaskDialog(task));
}
function openTaskDialog(task = null) { editingTask = task; document.querySelector('#task-dialog-title').textContent = task ? 'Editar tarea' : 'Agregar tarea'; document.querySelector('#task-text').value = task ? task.querySelector('span').textContent : ''; taskDialog.showModal(); }
document.querySelectorAll('#task-items li').forEach(attachTask);
document.querySelector('#task-add')?.addEventListener('click', () => openTaskDialog());
document.querySelector('#task-dialog-close')?.addEventListener('click', () => taskDialog.close());
taskForm?.addEventListener('submit', event => {
  event.preventDefault(); const text = document.querySelector('#task-text').value.trim(); if (!text) return;
  if (editingTask) editingTask.querySelector('span').textContent = text;
  else { const task = document.createElement('li'); task.innerHTML = '<button class="task-check" aria-label="Completar tarea">□</button><span></span><button class="task-edit" aria-label="Editar tarea">✎</button><button class="task-delete" aria-label="Eliminar tarea">×</button>'; task.querySelector('span').textContent = text; document.querySelector('#task-items').append(task); attachTask(task); }
  taskDialog.close();
});

function homeShelves() { return [...homeScreen.querySelectorAll(':scope > .shelf, :scope > .add-shelf-card')]; }
function renderHomeCarousel() {
  const items = homeShelves();
  const perPage = 6;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  if (!items.length) return;
  homeIndex = (homeIndex + pages) % pages;
  items.forEach((item, index) => item.classList.toggle('home-active', index >= homeIndex * perPage && index < (homeIndex + 1) * perPage));
  const counter = document.querySelector('#home-counter');
  if (counter) counter.textContent = `${homeIndex + 1} / ${pages}`;
  const prevBtn = document.querySelector('#home-previous');
  const nextBtn = document.querySelector('#home-next');
  if (prevBtn) prevBtn.style.display = pages > 1 ? 'flex' : 'none';
  if (nextBtn) nextBtn.style.display = pages > 1 ? 'flex' : 'none';
}
function renderBookPage() {
  const books = [...categoryBooks.querySelectorAll(':scope > .book')];
  const booksPerPage = Math.max(1, Math.floor(((categoryBooks.clientWidth || 760) - 160) / 120));
  const pages = Math.max(1, Math.ceil(books.length / booksPerPage));
  bookPage = (bookPage + pages) % pages;
  books.forEach((book, index) => book.classList.toggle('book-hidden', Math.floor(index / booksPerPage) !== bookPage));
  const hasPages = pages > 1;
  const label = document.querySelector('#book-page-label');
  if (label) label.textContent = hasPages ? `${bookPage + 1} / ${pages}` : '';
  const prevBtn = document.querySelector('#previous-books');
  const nextBtn = document.querySelector('#next-books');
  if (prevBtn) prevBtn.style.display = hasPages ? 'block' : 'none';
  if (nextBtn) nextBtn.style.display = hasPages ? 'block' : 'none';
}
function storeActiveItems() { if (activeShelf) [...categoryBooks.querySelectorAll(':scope > .book, :scope > .note')].forEach(item => activeShelf.insertBefore(item, activeShelf.querySelector('.shelf-more'))); }
function openCategory(shelf) {
  if (activeShelf && activeShelf !== shelf) storeActiveItems();
  activeShelf = shelf; selectedCategory = shelf.dataset.category; bookPage = 0;
  document.querySelector('#category-title').textContent = categoryNames[selectedCategory] || selectedCategory;
  document.querySelector('.page').classList.add('category-open');
  document.body.classList.add('category-open');
  homeScreen.classList.add('is-opening'); shelf.classList.add('shelf-opening');
  updateModalState();
  setTimeout(() => { [...shelf.querySelectorAll(':scope > .book, :scope > .note')].forEach(item => categoryBooks.append(item)); homeScreen.style.display = 'none'; homeScreen.classList.remove('is-opening'); shelf.classList.remove('shelf-opening'); categoryPage.classList.add('open'); requestAnimationFrame(renderBookPage); }, 320);
}
function attachCategoryNavigation(shelf) { shelf.addEventListener('click', event => { if (!event.target.closest('.book,.note,.shelf-more,.category-edit')) openCategory(shelf); }); }
function activateAddBookButton(button) { button.addEventListener('click', () => { selectedCategory = button.dataset.shelf; openAddDialog(); }); }
async function editCategory(button) {
  const shelf = button.closest('.shelf'); const id = shelf.dataset.category; const name = categoryNames[id];
  const choice = await openAction({ eyebrow: 'Categoría', title: name, description: 'Renombrar o eliminar esta estantería.', actions: [cancelAction, { label: 'Eliminar', value: 'delete', className: 'danger' }, { label: 'Renombrar', value: 'rename', className: 'primary' }] });
  if (choice.action === 'rename') {
    const result = await openAction({ eyebrow: 'Categoría', title: 'Renombrar categoría', fields: [{ name: 'name', value: name }], actions: [cancelAction, saveAction] });
    if (result.action === 'save' && result.values.name.trim()) { categoryNames[id] = result.values.name.trim(); renumberShelves(); const filterBtn = document.querySelector(`.filters button[data-filter="${id}"]`); if (filterBtn) filterBtn.textContent = categoryNames[id]; }
  }
  if (choice.action === 'delete') {
    if (shelf.querySelector('.book, .note')) { notify('Quita o mueve los libros antes de borrar este estante.'); return; }
    shelf.remove(); delete categoryNames[id]; document.querySelector(`.filters button[data-filter="${id}"]`)?.remove(); renumberShelves(); renderHomeCarousel(); notify('Estante eliminado.');
  }
}
function addCategory(name) {
  const id = `category-${Date.now()}`; categoryNames[id] = name;
  const shelf = document.createElement('div'); shelf.className = 'shelf'; shelf.dataset.category = id;
  shelf.innerHTML = `<span class="shelf-label"></span><button class="category-edit" data-shelf="${id}" aria-label="Editar categoría">✎</button><button class="shelf-more" data-shelf="${id}" aria-label="Añadir libro">+</button>`;
  const addCard = document.querySelector('#add-category');
  if (addCard) caseEl.insertBefore(shelf, addCard); else caseEl.append(shelf);
  attachCategoryNavigation(shelf); activateAddBookButton(shelf.querySelector('.shelf-more')); shelf.querySelector('.category-edit').addEventListener('click', () => editCategory(shelf.querySelector('.category-edit')));
  const filterContainer = document.querySelector('.filters');
  if (filterContainer) { const filter = document.createElement('button'); filter.dataset.filter = id; filter.textContent = name; filter.addEventListener('click', () => applyFilter(filter)); filterContainer.append(filter); }
  renumberShelves();
  const items = homeShelves();
  const perPage = 6;
  homeIndex = Math.floor((items.length - 1) / perPage);
  renderHomeCarousel(); notify('Nuevo estante creado.');
}

function closeCategoryDrawer() {
  storeActiveItems();
  categoryPage.classList.remove('open');
  document.querySelector('.page')?.classList.remove('category-open');
  document.body.classList.remove('category-open');
  updateModalState();
  homeScreen.style.display = 'grid';
  activeShelf = null;
}

document.querySelectorAll('.shelf').forEach(prepareShelf);
document.querySelector('#add-category')?.addEventListener('click', async () => { const result = await openAction({ eyebrow: 'Nuevo estante', title: 'Crear categoría', fields: [{ name: 'name', placeholder: 'Nombre de la categoría' }], actions: [cancelAction, { label: 'Crear', value: 'create', className: 'primary' }] }); if (result.action === 'create' && result.values.name.trim()) addCategory(result.values.name.trim()); });
document.querySelector('#home-previous')?.addEventListener('click', () => { homeIndex--; renderHomeCarousel(); });
document.querySelector('#home-next')?.addEventListener('click', () => { homeIndex++; renderHomeCarousel(); });
document.querySelector('#back-home')?.addEventListener('click', closeCategoryDrawer);
document.querySelector('#close-category')?.addEventListener('click', closeCategoryDrawer);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && categoryPage.classList.contains('open')) {
    closeCategoryDrawer();
  }
});

document.addEventListener('click', event => {
  if (categoryPage.classList.contains('open') &&
      !categoryPage.contains(event.target) &&
      !event.target.closest('.shelf') &&
      !event.target.closest('dialog')) {
    closeCategoryDrawer();
  }
});

document.querySelector('#previous-shelf')?.addEventListener('click', () => { const shelves = homeShelves(); openCategory(shelves[(shelves.indexOf(activeShelf) - 1 + shelves.length) % shelves.length]); });
document.querySelector('#next-shelf')?.addEventListener('click', () => { const shelves = homeShelves(); openCategory(shelves[(shelves.indexOf(activeShelf) + 1) % shelves.length]); });
document.querySelector('#previous-books')?.addEventListener('click', () => { bookPage--; renderBookPage(); });
document.querySelector('#next-books')?.addEventListener('click', () => { bookPage++; renderBookPage(); });
window.addEventListener('resize', () => { if (categoryPage.classList.contains('open')) renderBookPage(); });

document.querySelector('.close')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.querySelector('#delete-book')?.addEventListener('click', () => { if (currentBook) confirmDelete(currentBook, 'libro'); });
document.querySelector('#edit-description')?.addEventListener('click', async () => {
  if (!currentBook) return;
  const result = await openAction({ eyebrow: 'Libro', title: 'Editar descripción', fields: [{ name: 'description', type: 'textarea', value: currentBook.dataset.desc || '', placeholder: 'Describe este libro' }], actions: [cancelAction, saveAction] });
  if (result.action !== 'save') return;
  currentBook.dataset.desc = result.values.description.trim() || 'Sin descripción.';
  if (currentBook.dataset.remoteId && supabaseClient) { const { error } = await supabaseClient.from('archives').update({ description: currentBook.dataset.desc }).eq('id', currentBook.dataset.remoteId); if (error) { notify(`No se pudo actualizar: ${error.message}`); return; } }
  showArchive(currentBook); notify('Descripción guardada.');
});

/* ==========================================================================
   NUEVAS INTERACCIONES: RELOJ DIGITAL, SWATCHES, BÚHO, LÁMPARA, DRAG&DROP
   ========================================================================== */

/* Reloj Digital LED de Pared (10:35 SUN) */
function updateClock() {
  const clockEl = document.querySelector('#digital-clock');
  if (!clockEl) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const dayStr = days[now.getDay()];
  clockEl.textContent = `${timeStr} ${dayStr}`;
}
updateClock();
setInterval(updateClock, 1000);

/* Selector de Paletas / Ambientes (Theme Swatches) */
document.querySelectorAll('.swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    const theme = swatch.dataset.theme;
    document.body.className = theme;
    notify(`Ambiente seleccionado: ${swatch.title}`);
  });
});

/* Lámpara Interactiva (Encender/Apagar Resplandor) */
const roomLamp = document.querySelector('#room-lamp');
if (roomLamp) {
  roomLamp.addEventListener('click', () => {
    const isOn = roomLamp.classList.toggle('lamp-on');
    roomLamp.classList.toggle('lamp-off', !isOn);
    notify(isOn ? 'Lámpara encendida 💡' : 'Lámpara apagada 🌙');
  });
}

/* Mascota "Barnaby el Búho Sabio" */
const owlMascot = document.querySelector('#owl-mascot');
const owlBubble = document.querySelector('#owl-bubble');
const owlTips = [
  "¡Hola! Soy Barnaby 🦉. Puedes arrastrar archivos directamente a tus estantes.",
  "Un libro es un refugio de conocimiento... 📖",
  "Cambia el ambiente del cuarto con los círculos de colores de arriba. 🎨",
  "Haz clic en la lámpara para ajustar la iluminación de la biblioteca. 💡",
  "Anota tus pendientes en la pizarra de corcho a la izquierda. 📌",
  "Haz clic en cualquier libro para abrirlo y ver su contenido."
];
let owlTipIndex = 0;

if (owlMascot && owlBubble) {
  owlMascot.addEventListener('click', () => {
    owlTipIndex = (owlTipIndex + 1) % owlTips.length;
    owlBubble.textContent = owlTips[owlTipIndex];
    owlBubble.classList.add('visible');
    clearTimeout(owlBubble._timer);
    owlBubble._timer = setTimeout(() => owlBubble.classList.remove('visible'), 4500);
  });
}

/* Botón de Perfil de Usuario */
document.querySelector('#user-profile')?.addEventListener('click', () => {
  openAction({
    eyebrow: 'Perfil de Usuario',
    title: 'Biblioteca Convive',
    description: 'Estás navegando en tu archivo personal interactivo estilo acuarela.',
    actions: [{ label: 'Excelente', value: 'ok', className: 'primary' }]
  });
});

/* Procesador común de archivos subidos (Manual o Drag & Drop) */
async function processFileUpload(file, category, description = '') {
  const extension = (file.name.split('.').pop() || 'ARCH').toUpperCase();
  const title = file.name.replace(/\.[^/.]+$/, '') || 'Archivo sin título';
  const book = document.createElement('button');
  book.className = 'book';
  book.style.setProperty('--book', colors[Math.floor(Math.random() * colors.length)]);
  book.style.setProperty('--height', `${125 + Math.floor(Math.random() * 35)}px`);
  
  const archiveId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const filePath = `${category}/${archiveId}-${safeName}`;
  const dataUrl = await fileToDataUrl(file);
  const tempUrl = dataUrl || URL.createObjectURL(file);

  let finalDescription = description || title;
  if (dataUrl) {
    finalDescription = JSON.stringify({
      desc: description || title,
      dataUrl: dataUrl
    });
  }

  const localRecord = {
    id: archiveId,
    category,
    title,
    description: finalDescription,
    file_path: filePath,
    mime_type: file.type || 'text/plain',
    size_bytes: file.size || 0,
    created_at: new Date().toISOString(),
    url: tempUrl
  };

  saveLocalArchive(localRecord);

  Object.assign(book.dataset, {
    cat: category,
    title,
    year: new Date().getFullYear(),
    kind: `${extension} · ${categoryNames[category] || category}`,
    extension,
    desc: description || `${file.name} · ${(file.size / 1024).toFixed(1)} KB`,
    url: tempUrl,
    mime: file.type || 'text/plain',
    remoteId: archiveId,
    filePath
  });
  
  book.innerHTML = `<span class="title"></span><span class="year">${new Date().getFullYear()}</span>`;
  book.querySelector('.title').textContent = title;

  if (supabaseClient) {
    let publicFileUrl = null;
    try {
      const { error: storageError } = await supabaseClient.storage.from('archives').upload(filePath, file, { contentType: file.type || 'application/octet-stream', upsert: true });
      if (!storageError) {
        publicFileUrl = supabaseClient.storage.from('archives').getPublicUrl(filePath).data?.publicUrl;
      }
    } catch (e) {}

    if (publicFileUrl) {
      localRecord.url = publicFileUrl;
      book.dataset.url = publicFileUrl;
    }

    const { data: archive, error: dbError } = await supabaseClient.from('archives').insert({
      id: archiveId,
      category,
      title,
      description: finalDescription,
      file_path: filePath,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size || 0
    }).select();

    if (dbError) {
      console.warn('[Convive] Error o nota al insertar en Supabase DB:', dbError.message);
    } else if (archive && archive[0]) {
      console.log('[Convive] Archivo guardado exitosamente en Supabase Cloud DB:', archive[0]);
      saveLocalArchive(localRecord);
    }
  }

  const shelf = shelfFor(category) || document.querySelector('.shelf');
  if (activeShelf === shelf) {
    categoryBooks.append(book);
    renderBookPage();
  } else if (shelf) {
    const shelfMore = shelf.querySelector('.shelf-more');
    if (shelfMore) shelf.insertBefore(book, shelfMore);
    else shelf.appendChild(book);
  }
  
  prepareBook(book);
  updateCount();
  notify(`"${title}" guardado en la biblioteca ✨`);
}

/* Manejo de Drag and Drop (Arrastrar archivos desde el escritorio) */
const dragOverlay = document.querySelector('#drag-drop-overlay');
if (dragOverlay) {
  window.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragOverlay.classList.contains('active')) {
      dragOverlay.classList.add('active');
    }
  });

  window.addEventListener('dragleave', e => {
    if (e.relatedTarget === null) {
      dragOverlay.classList.remove('active');
    }
  });

  window.addEventListener('drop', async e => {
    e.preventDefault();
    dragOverlay.classList.remove('active');
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;

    for (const file of files) {
      await processFileUpload(file, selectedCategory || 'stories', 'Archivo colocado mediante Drag & Drop');
    }
  });
}

// Integración con SweetAlert para subir archivos manualmente
document.querySelector('#upload-button')?.addEventListener('click', async () => {
  const { value: form } = await Swal.fire({
    title: 'Añadir un libro / archivo',
    html: `<input id="swal-file" class="swal2-file" type="file" accept="*/*"><select id="swal-category" class="swal2-select">${categoryOptions().map(option => `<option value="${option.value}" ${option.value === selectedCategory ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select><textarea id="swal-description" class="swal2-textarea" placeholder="Escribe una descripción (opcional)"></textarea>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Colocar libro',
    confirmButtonColor: '#4a2e1b',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      const file = document.querySelector('#swal-file').files[0];
      if (!file) { Swal.showValidationMessage('Selecciona un archivo primero'); return false; }
      return { file, category: document.querySelector('#swal-category').value, description: document.querySelector('#swal-description').value.trim() };
    }
  });
  if (!form) return;
  await processFileUpload(form.file, form.category, form.description);
});

renderHomeCarousel();
renumberShelves();
updateCount();
loadRemoteArchives();
