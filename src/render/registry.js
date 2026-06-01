// Decouples modules that need to trigger a re-render (e.g. the detail modal)
// from main.js, where the render() loop lives. main.js registers its render
// function here during init; consumers call requestRender() instead of
// importing render() directly, which would create a circular dependency.
let renderFn = () => {};

export const setRenderFn = (fn) => {
  renderFn = typeof fn === 'function' ? fn : (() => {});
};

export const requestRender = () => renderFn();
