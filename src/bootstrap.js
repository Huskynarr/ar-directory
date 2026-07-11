import './style.css';

// The static app shell is complete and useful on its own. Load interaction and
// catalog parsing after its first paint so content rendering never waits on JS.
requestAnimationFrame(() => {
  window.setTimeout(() => {
    void import('./main.js');
  }, 200);
});
