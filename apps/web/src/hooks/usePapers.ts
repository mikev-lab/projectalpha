import { useEffect, useState } from "react";
import medusa from "@/lib/medusa";

export function usePapers() {
  const [papers, setPapers] = useState([]);

  useEffect(() => {
    medusa.products.list({ limit: 100 }).then(({ products }) => {
      const paperProduct = products.find((p) => p.title === "Paper");
      if (paperProduct) {
        setPapers(paperProduct.variants);
      }
    });
  }, []);

  return papers;
}
