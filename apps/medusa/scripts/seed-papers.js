#!/usr/bin/env ts-node
const Medusa = require("@medusajs/medusa-js").default;
const path = require("path");
const { paperData } = require(path.resolve(__dirname, "../../web/src/data/paperData.ts"));

const medusa = new Medusa({
  baseUrl: "http://localhost:9000",
  maxRetries: 3,
});

async function seedPapers() {
  try {
    // Authenticate with Medusa
    await medusa.admin.auth.createSession({
      email: "admin@medusa-test.com",
      password: "password",
    });

    // Check if the "Paper" product already exists
    let product;
    const { products } = await medusa.admin.products.list({ title: "Paper" });
    if (products.length > 0) {
      product = products[0];
    } else {
      // Create a "Paper" product
      const { product: newProduct } = await medusa.admin.products.create({
        title: "Paper",
        subtitle: "Paper for custom print projects",
        description: "A selection of paper for custom print projects.",
        is_giftcard: false,
        discountable: true,
      });
      product = newProduct;
    }

    // Delete existing variants
    for (const variant of product.variants) {
      await medusa.admin.products.variants.delete(product.id, variant.id);
    }

    // Create a variant for each paper type
    for (const paper of paperData) {
      await medusa.admin.products.variants.create(product.id, {
        title: paper.name,
        prices: [{ currency_code: "usd", amount: paper.costPerSheet * 100 }],
        options: [{ value: paper.sku }],
        inventory_quantity: 1000,
        metadata: {
          gsm: paper.gsm,
          type: paper.type,
          finish: paper.finish,
          parentWidth: paper.parentWidth,
          parentHeight: paper.parentHeight,
          usage: paper.usage,
        },
      });
    }

    console.log("Successfully seeded papers!");
  } catch (error) {
    console.error("Error seeding papers:", error);
  }
}

seedPapers();
