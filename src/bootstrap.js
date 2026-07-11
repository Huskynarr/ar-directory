import './style.css';

// In development the stylesheet import is evaluated before this line. The
// production build marks readiness from the async stylesheet's load event.
if (import.meta.env.DEV) {
  document.documentElement.classList.add('app-styled');
}

const waitForAppStyles = () => {
  if (document.documentElement.classList.contains('app-styled')) return Promise.resolve();
  return new Promise((resolveStyles) => window.addEventListener('ar-styles-ready', resolveStyles, { once: true }));
};

const yieldToBrowser = () => new Promise((resolveYield) => setTimeout(resolveYield, 0));

const startApp = async () => {
  // Fetch shared chunks in parallel, then yield between their evaluations. This
  // prevents slower devices from evaluating the entire module graph in one task.
  const stages = [
    import('./state.js'),
    import('./data/filters.js'),
    import('./render/cards.js'),
    import('./data/dataset.js'),
    import('./actions.js'),
    import('./seo.js'),
  ];
  for (const stage of stages) {
    await stage;
    await yieldToBrowser();
  }
  const { start } = await import('./main.js');
  await waitForAppStyles();
  await yieldToBrowser();
  start();
};

// Give the complete critical shell one uncontended paint before module and
// dataset work begins. The visible state is already useful and fully styled.
requestAnimationFrame(() => {
  window.setTimeout(() => {
    void startApp();
  }, 200);
});
