"use client";

export default function CostSummary({ costBreakdown }) {
  if (!costBreakdown) {
    return null;
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <div className="bg-gray-100 p-8 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Cost Summary</h2>
      {costBreakdown.error ? (
        <p className="text-red-500">{costBreakdown.error}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(costBreakdown.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Markup</span>
              <span>{formatCurrency(costBreakdown.markupAmount)}</span>
            </div>
            {costBreakdown.shippingCost > 0 && (
              <div className="flex justify-between">
                <span>Shipping</span>
                <span>{formatCurrency(costBreakdown.shippingCost)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold">
              <span>Total Cost</span>
              <span>{formatCurrency(costBreakdown.totalCost)}</span>
            </div>
          </div>
          <div className="text-xl font-bold text-right">
            {formatCurrency(costBreakdown.pricePerUnit)} per unit
          </div>
        </div>
      )}
    </div>
  );
}
