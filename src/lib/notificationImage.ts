import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Icon } from "../components/Icon";

const imageCache = new Map<string, Promise<string>>();

export function renderNotificationImage(name: string): Promise<string> {
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--color-primary").trim();
  const foreground = styles.getPropertyValue("--color-on-primary").trim();
  const cacheKey = JSON.stringify([name, background, foreground]);
  let image = imageCache.get(cacheKey);
  if (!image) {
    image = renderImage(name, background, foreground).catch(
      (error: unknown) => {
        imageCache.delete(cacheKey);
        throw error;
      },
    );
    imageCache.set(cacheKey, image);
  }
  return image;
}

async function renderImage(
  name: string,
  background: string,
  foreground: string,
): Promise<string> {
  // Rendering may be requested by an effect; flush this root after that effect.
  await Promise.resolve();
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "-10000px";
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => root.render(createElement(Icon, { name, size: 104 })));
  const markup = container.innerHTML;
  root.unmount();
  container.remove();
  const nodes = markup.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>$/, "");
  const normalized = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><circle cx="96" cy="96" r="92" fill="${background}"/><svg x="44" y="44" width="104" height="104" viewBox="0 0 24 24" fill="none" stroke="${foreground}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg></svg>`;
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
  return new Promise((resolve, reject) => {
    const source = new Image();
    source.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 192;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("无法创建通知图片画布"));
        return;
      }
      context.drawImage(source, 0, 0, 192, 192);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    source.onerror = () => reject(new Error("通知图片生成失败"));
    source.src = encoded;
  });
}
