import medusa from "@/lib/medusa";

export function useMedusa() {
  const createProduct = async (project) => {
    const { product } = await medusa.admin.products.create({
      title: project.name,
      subtitle: "Custom Print Project",
      description: `Custom print project with ${project.pages.length} pages.`,
      is_giftcard: false,
      discountable: true,
      options: [{ title: "Size" }],
      variants: [
        {
          title: `${project.finishedWidth}x${project.finishedHeight}`,
          prices: [{ currency_code: "usd", amount: project.totalCost * 100 }],
          options: [{ value: `${project.finishedWidth}x${project.finishedHeight}` }],
        },
      ],
    });
    return product;
  };

  return { createProduct };
}
