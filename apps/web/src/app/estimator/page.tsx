import Estimator from "@/components/estimator/Estimator";

export default function EstimatorPage() {
  return (
    <div className="container mx-auto py-12">
      <h1 className="text-4xl font-bold mb-2 text-center">Live Estimator</h1>
      <p className="text-gray-500 mb-8 text-center">Instantly calculate costs for your print jobs.</p>
      <Estimator />
    </div>
  );
}
