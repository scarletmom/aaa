const loads = new Map<string, Promise<void>>();

/** Adds a script to <head> once per URL. A failed load is forgotten so a later call can retry. */
export function loadScript(src: string): Promise<void> {
  let load = loads.get(src);
  if (!load) {
    load = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loads.delete(src);
        script.remove();
        reject(new Error(`Couldn't load ${src}`));
      };
      document.head.append(script);
    });
    loads.set(src, load);
  }
  return load;
}
