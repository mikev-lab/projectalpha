"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { addDoc, collection, getDocs } from "firebase/firestore";

export default function RewardsAdmin() {
  const [tiers, setTiers] = useState([]);
  const [newTier, setNewTier] = useState({ name: "", minSpend: 0, discount: 0 });

  useEffect(() => {
    const fetchTiers = async () => {
      const querySnapshot = await getDocs(collection(db, "rewardTiers"));
      const tiers = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTiers(tiers);
    };
    fetchTiers();
  }, []);

  const handleSaveTier = async () => {
    await addDoc(collection(db, "rewardTiers"), newTier);
    setNewTier({ name: "", minSpend: 0, discount: 0 });
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Manage Reward Tiers</h1>
      <div className="space-y-4">
        {tiers.map((tier) => (
          <div key={tier.id} className="flex items-center space-x-4">
            <span>{tier.name}</span>
            <span>{tier.minSpend}</span>
            <span>{tier.discount}%</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">New Tier</h2>
        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder="Name"
            value={newTier.name}
            onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Min Spend"
            value={newTier.minSpend}
            onChange={(e) =>
              setNewTier({ ...newTier, minSpend: parseFloat(e.target.value) })
            }
          />
          <input
            type="number"
            placeholder="Discount"
            value={newTier.discount}
            onChange={(e) =>
              setNewTier({ ...newTier, discount: parseFloat(e.target.value) })
            }
          />
          <button onClick={handleSaveTier}>Save</button>
        </div>
      </div>
    </div>
  );
}
