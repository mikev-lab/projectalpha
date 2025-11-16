import { useState, useEffect } from "react";

export const useImage = (url) => {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.src = url;
    img.crossOrigin = "Anonymous";
    img.addEventListener("load", () => setImage(img));
    return () => img.removeEventListener("load", () => setImage(null));
  }, [url]);

  return [image];
};
