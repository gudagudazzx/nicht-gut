'use strict';

/* ── IMAGE PATHS ──────────────────────────────────────────────
   All sprite file paths defined in one place.
   Filenames with spaces must be URL-encoded: %20
   Folder structure assumed:
     gut/
       imgs.js
       script.js
       style.css
       index.html
       img/
         chall1-calm talk.png
         chall1-calm.png
         ... etc.
────────────────────────────────────────────────────────────── */
const IMGS = {

  /* ── STERN INTERVIEWER (man at desk) ── */
  chall_neutral:      'img/chall1-calm.png',
  chall_neutral_talk: 'img/chall1-calm%20talk.png',
  chall_frown:        'img/chall1-frowning.png',
  chall_frown_talk:   'img/chall1-frowning%20talk.png',
  chall_smile:        'img/chall1-smile.png',
  chall_smile_talk:   'img/chall1-smile%20talk.png',

  /* ── FRIENDLY INTERVIEWER (girl at desk) ── */
  fi_calm:            'img/chall2-calm.png',
  fi_calm_talk:       'img/chall2-calm%20talk.png',
  fi_approve:         'img/chall2-approve.png',
  fi_approve_talk:    'img/chall2-approve%20talk.png',
  fi_highly_approve:  'img/chall2-highly%20approve%20talk.png',

  /* ── MENTOR (girl with heart t-shirt) ── */
  mentor_hello_smile: 'img/mentor-hello%20smile.png',
  mentor_hello_talk:  'img/mentor-hello%20talk.png',
  mentor_hint_smile:  'img/mentor-hint%20smile.png',
  mentor_hint_talk:   'img/mentor-hint%20talk.png',
  mentor_praise:      'img/praise-good%20job.png',
  mentor_clap1:       'img/mentor-clap1.png',
  mentor_clap2:       'img/mentor-clap2.png',

  /* ── LEGACY ALIASES (keep old references working) ── */
  mentor_greet_smile: 'img/mentor-hello%20smile.png',
  mentor_greet_talk:  'img/mentor-hello%20talk.png',
  mentor_laugh:       'img/mentor-clap1.png',
  mentor_laugh_talk:  'img/mentor-clap2.png',

  /* ── DESK (no longer used as separate element, kept for compat) ── */
  desk: '',
};
