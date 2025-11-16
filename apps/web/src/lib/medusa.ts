import Medusa from "@medusajs/medusa-js";

const medusa = new Medusa({
  baseUrl: process.env.NEXT_PUBLIC_MEDUSA_URL || "http://localhost:9000",
  maxRetries: 3,
});

export default medusa;
