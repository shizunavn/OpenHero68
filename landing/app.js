import {content} from './content.mjs';

const translations = {
  en: {...content.en, navigationLabel:'Main navigation', projectLinks:'Project links', screenshotLabel:'Product screenshot', appAlt:'OpenHero68 configurator showing the HERO68 keyboard, Quick Settings and configuration sidebar', rgbAlt:'Rhythm Sync settings with a colorful HERO68 keyboard preview and system-audio controls'},
  vi: {...content.vi, navigationLabel:'Điều hướng chính', projectLinks:'Liên kết dự án', screenshotLabel:'Ảnh giao diện sản phẩm', appAlt:'Giao diện OpenHero68 với bàn phím HERO68, thiết lập nhanh và thanh điều hướng cấu hình', rgbAlt:'Thiết lập Rhythm Sync với bàn phím HERO68 nhiều màu và điều khiển âm thanh hệ thống'}
};
const storageKey = 'openhero68.landing.language';
export function storedLanguage(storage) {
  try {return storage.getItem(storageKey) === 'vi' ? 'vi' : 'en';} catch {return 'en';}
}
export function setLanguage(language) {
  const lang = language === 'vi' ? 'vi' : 'en';
  const strings = translations[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(element => {element.textContent = strings[element.dataset.i18n];});
  document.querySelectorAll('[data-i18n-aria]').forEach(element => {element.setAttribute('aria-label', strings[element.dataset.i18nAria]);});
  document.querySelectorAll('[data-i18n-alt]').forEach(element => {element.alt = strings[element.dataset.i18nAlt];});
  document.querySelectorAll('[data-language]').forEach(button => {button.setAttribute('aria-pressed', String(button.dataset.language === lang));});
  document.querySelectorAll('.visual-label').forEach((label, index) => {label.textContent = strings[index === 0 ? 'visualAudio' : 'visualGamepad'];});
  document.title = strings.pageTitle;
  document.querySelector('meta[name="description"]').content = strings.pageDescription;
  const activeImage = document.querySelector('.lightbox img');
  const sourceImage = document.querySelector(`[data-lightbox][href="${activeImage.dataset.source ?? ''}"] img`);
  if (sourceImage) activeImage.alt = sourceImage.alt;
  try {localStorage.setItem(storageKey, lang);} catch { /* Storage is optional. */ }
}

document.documentElement.classList.add('js');
let saved = 'en';
try {saved = storedLanguage(localStorage);} catch { /* Access to storage itself may be denied. */ }
setLanguage(saved);
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language)));

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
function closeMenu() {menuButton.setAttribute('aria-expanded', 'false');navigation.classList.remove('is-open');}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('is-open', open);
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {if (event.key === 'Escape') {if (menuButton.getAttribute('aria-expanded') === 'true') menuButton.focus();closeMenu();}});
matchMedia('(min-width: 561px)').addEventListener('change', closeMenu);

const dialog = document.querySelector('.lightbox');
let imageTrigger;
if (typeof dialog.showModal === 'function') {
  document.querySelectorAll('[data-lightbox]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    imageTrigger = link;
    const image = dialog.querySelector('img');
    image.src = link.href;
    image.dataset.source = link.getAttribute('href');
    image.alt = link.querySelector('img').alt;
    dialog.showModal();
    document.body.classList.add('lightbox-open');
  }));
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', event => {pressedBackdrop = event.target === dialog;});
  dialog.addEventListener('click', event => {
    if (event.target === dialog && pressedBackdrop) dialog.close();
    pressedBackdrop = false;
  });
  dialog.addEventListener('close', () => {document.body.classList.remove('lightbox-open');imageTrigger?.focus({preventScroll:true});});
}
