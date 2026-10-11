// views/wishes.js: the "Wishes" tab.
//
// Lists every open feature wish from the Ideas category of the project's
// GitHub Discussions with its vote count, most votes first. Each row opens its
// discussion, where the upvote arrow is the vote. The list comes from the
// website (st-reborn.de/ideas.json, rebuilt daily) via the Go side, so the app
// never talks to GitHub itself. When it cannot be fetched, the tab still offers
// the two buttons that matter: vote on GitHub and suggest a new wish.

import { $, escapeHtml, escapeAttr, showError } from '../utils.js';
import { t, getLocale } from '../i18n/index.js';
import { BrowserOpenURL, FeatureWishes } from '../api.js';

// Used only when the Go call itself fails; the Go side always fills them in.
const VOTE_URL = 'https://github.com/JRpersonal/streborn/discussions/categories/ideas?discussions_q=category%3AIdeas+sort%3Atop';
const SUGGEST_URL = 'https://github.com/JRpersonal/streborn/discussions/new?category=ideas';

let cached = null;
// The search text survives a repaint (the list refreshes in the background
// while the tab is open), so typing is never thrown away.
let filterText = '';

// The website translates each title once per build into its own languages
// (titles: { de, fr, 'zh-tw', ... }); the app reads them from the same
// ideas.json, so no translation service is ever contacted from here. The app's
// zh-Hant is the site's zh-tw. A missing language falls back to the English
// original.
const SITE_LANG = { 'zh-Hant': 'zh-tw' };

// foldSearch lowercases and drops accents, so "musica" finds "Música".
function foldSearch(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// wishMatches is the search box's rule: every word typed must appear in the
// wish's title in the app language, its English original, or its number. An
// empty search matches everything.
export function wishMatches(w, lang, query) {
  const words = foldSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldSearch(`${wishTitle(w, lang)} ${(w && w.title) || ''} #${(w && w.number) || ''}`);
  return words.every((word) => hay.includes(word));
}

export function wishTitle(w, lang) {
  const titles = (w && w.titles) || {};
  const key = SITE_LANG[lang] || String(lang || '').toLowerCase();
  const tr = typeof titles[key] === 'string' ? titles[key].trim() : '';
  return tr || (w && w.title) || '';
}

export function initWishesView() {}

// wishesHTML builds the tab body. Pure, so it is testable without a DOM.
// list: { ok, updatedAt, voteUrl, suggestUrl, wishes: [{ number, title, titles, url, votes }] }
// or null while loading.
export function wishesHTML(list, tr, lang, query = '') {
  const head = `
    <h2 class="wishes-title">${escapeHtml(tr('wishes.title'))}</h2>
    <p class="wishes-lead">${escapeHtml(tr('wishes.lead'))}</p>
    <div class="wishes-actions">
      <button class="btn btn-primary" data-wish-open="${escapeAttr((list && list.suggestUrl) || SUGGEST_URL)}" id="wishesSuggestBtn">${escapeHtml(tr('wishes.suggestBtn'))}</button>
      <button class="btn btn-secondary" data-wish-open="${escapeAttr((list && list.voteUrl) || VOTE_URL)}" id="wishesAllBtn">${escapeHtml(tr('wishes.allBtn'))}</button>
    </div>
    <p class="muted small">${escapeHtml(tr('wishes.howToVote'))}</p>`;
  if (!list) return `<div class="wishes">${head}<p class="muted">${escapeHtml(tr('wishes.loading'))}</p></div>`;
  if (!list.ok) return `<div class="wishes">${head}<p class="muted">${escapeHtml(tr('wishes.unavailable'))}</p></div>`;
  const wishes = list.wishes || [];
  if (wishes.length === 0) return `<div class="wishes">${head}<p class="muted">${escapeHtml(tr('wishes.empty'))}</p></div>`;
  const rows = wishes.map((w) => `
      <li class="wish-row" data-wish-num="${escapeAttr(String(w.number))}"${wishMatches(w, lang, query) ? '' : ' hidden'}>
        <span class="wish-votes" title="${escapeAttr(tr('wishes.votesTitle', { count: w.votes }))}"><span class="wish-arrow" aria-hidden="true">&#9650;</span>${escapeHtml(String(w.votes))}</span>
        <span class="wish-title">${escapeHtml(wishTitle(w, lang))}</span>
        <button class="btn btn-mini btn-secondary" data-wish-open="${escapeAttr(w.url)}">${escapeHtml(tr('wishes.voteBtn'))}</button>
      </li>`).join('');
  let asOf = '';
  const d = list.updatedAt ? new Date(list.updatedAt) : null;
  if (d && !isNaN(d)) {
    let when = list.updatedAt;
    try { when = d.toLocaleDateString(lang || undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch {}
    asOf = `<p class="muted small wishes-asof">${escapeHtml(tr('wishes.asOf', { date: when }))}</p>`;
  }
  const anyMatch = wishes.some((w) => wishMatches(w, lang, query));
  const search = `
    <div class="wishes-search-row">
      <input type="search" class="wishes-search" id="wishesSearch" placeholder="${escapeAttr(tr('wishes.searchPlaceholder'))}" aria-label="${escapeAttr(tr('wishes.searchPlaceholder'))}" value="${escapeAttr(query)}">
    </div>
    <p class="muted wishes-nomatch" id="wishesNoMatch"${anyMatch ? ' hidden' : ''}>${escapeHtml(tr('wishes.noMatch'))}</p>`;
  return `<div class="wishes">${head}${search}<ol class="wish-list">${rows}</ol>${asOf}</div>`;
}

function paint(list) {
  const root = $('view-wishes');
  if (!root) return;
  let lang = '';
  try { lang = getLocale(); } catch {}
  root.innerHTML = wishesHTML(list, t, lang, filterText);
  wireSearch(root, list, lang);
  root.querySelectorAll('[data-wish-open]').forEach((el) => {
    const url = el.getAttribute('data-wish-open');
    if (!url) { el.disabled = true; return; }
    el.onclick = () => { try { BrowserOpenURL(url); } catch (e) { showError(e); } };
  });
}

// wireSearch filters the rows in place instead of repainting, so the box keeps
// its focus and cursor while the user types.
function wireSearch(root, list, lang) {
  const box = root.querySelector('#wishesSearch');
  if (!box) return;
  const byNum = new Map(((list && list.wishes) || []).map((w) => [String(w.number), w]));
  box.oninput = () => {
    filterText = box.value;
    let any = false;
    root.querySelectorAll('.wish-row').forEach((row) => {
      const hit = wishMatches(byNum.get(row.getAttribute('data-wish-num')), lang, filterText);
      row.hidden = !hit;
      if (hit) any = true;
    });
    const none = root.querySelector('#wishesNoMatch');
    if (none) none.hidden = any;
  };
}

// renderWishes paints the tab and refreshes the list. The last list stays on
// screen while a new one is fetched, so reopening the tab does not flash.
export async function renderWishes() {
  paint(cached || null);
  let list = null;
  try { list = await FeatureWishes(); } catch {}
  if (!list) list = { ok: false, voteUrl: VOTE_URL, suggestUrl: SUGGEST_URL };
  if (list.ok || !cached) cached = list;
  paint(cached);
}
