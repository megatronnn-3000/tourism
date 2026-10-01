// Language toggle for the three legal pages.
//
// They are plain files outside the build, so they cannot use the main page's
// dictionary. Instead each page carries both languages and this shows one.
// The storage key is the same one the main site writes, so a visitor reading
// the site in English lands on the English terms rather than a wall of German.
//
// Without JavaScript nothing is hidden and both languages remain readable,
// which is the correct fallback for a legal document.

(function () {
  var KEY = 'govind-language';
  var blocks = document.querySelectorAll('[data-lang-block]');
  var buttons = document.querySelectorAll('[data-lang]');

  function apply(language) {
    document.documentElement.lang = language;

    for (var i = 0; i < blocks.length; i++) {
      blocks[i].hidden = blocks[i].getAttribute('data-lang-block') !== language;
    }

    for (var j = 0; j < buttons.length; j++) {
      buttons[j].setAttribute('aria-pressed', String(buttons[j].getAttribute('data-lang') === language));
    }

    try {
      localStorage.setItem(KEY, language);
    } catch (error) {
      // Private browsing or blocked storage: the choice simply is not remembered.
    }
  }

  var stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (error) {
    stored = null;
  }

  apply(stored === 'en' ? 'en' : 'de');

  for (var k = 0; k < buttons.length; k++) {
    buttons[k].addEventListener('click', function (event) {
      apply(event.currentTarget.getAttribute('data-lang'));
    });
  }
})();
