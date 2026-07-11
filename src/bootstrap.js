import './style.css';

const yieldToBrowser = () => new Promise((resolveYield) => setTimeout(resolveYield, 0));

const startApp = async () => {
  // Fetch shared chunks in parallel, then yield between their evaluations. This
  // prevents slower devices from evaluating the entire module graph in one task.
  const stages = [
    import('./state.js'),
    import('./data/filters.js'),
    import('./render/cards.js'),
    import('./render/stats.js'),
    import('./data/dataset.js'),
    import('./actions.js'),
    import('./seo.js'),
  ];
  for (const stage of stages) {
    await stage;
    await yieldToBrowser();
  }
  const { start } = await import('./main.js');
  await yieldToBrowser();
  start();
};

// The static app shell is complete and useful on its own. Load interaction and
// catalog parsing after its first paint so content rendering never waits on JS.
requestAnimationFrame(() => {
  window.setTimeout(() => {
    void startApp();
  }, 200);
});
