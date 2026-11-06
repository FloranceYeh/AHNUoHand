import React from "react";
import ReactDOM, { type Root } from "react-dom/client";
import { unstableSetRender } from "antd-mobile";
import App from "./App";
import { initializeTheme } from "./lib/theme";

initializeTheme();

// Use React 19 roots for the component library's imperative Toast/Dialog APIs.
const mobileRoots = new WeakMap<Element | DocumentFragment, Root>();
unstableSetRender((node, container) => {
  const root = mobileRoots.get(container) ?? ReactDOM.createRoot(container);
  mobileRoots.set(container, root);
  root.render(node);
  return async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    root.unmount();
    mobileRoots.delete(container);
  };
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
