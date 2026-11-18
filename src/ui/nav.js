// In-app navigation without a page load. main.js installs the router; until then links behave normally.
let handler = null;

export const setNavigator = (fn) => {
  handler = fn;
};

export function go(path, { replace = false } = {}) {
  if (handler) handler(path, { replace });
  else location.href = path;
}
