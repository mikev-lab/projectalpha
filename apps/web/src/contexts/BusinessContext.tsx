"use client";

import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { getUserByEmail } from "@/lib/users";
import { addDoc, arrayUnion, collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";

const BusinessContext = createContext(null);

export function BusinessProvider({ children }) {
  const [businesses, setBusinesses] = useState([]);
  const [currentBusiness, setCurrentBusiness] = useState(null);

  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      setBusinesses([]);
      setCurrentBusiness(null);
      return;
    }

    const q = query(collection(db, "businesses"), where("members", "array-contains", user.uid));
    getDocs(q).then((snapshot) => {
      const businesses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setBusinesses(businesses);
      if (businesses.length > 0) {
        setCurrentBusiness(businesses[0]);
      }
    });
  }, [user]);

  const createBusiness = async (name) => {
    if (!user) return;
    const businessRef = await addDoc(collection(db, "businesses"), {
      name,
      owner: user.uid,
      createdAt: new Date(),
      members: [user.uid],
    });
    await setDoc(doc(db, "businesses", businessRef.id, "members", user.uid), {
      role: "admin",
      addedAt: new Date(),
    });
  };

  const switchBusiness = (businessId) => {
    const business = businesses.find((b) => b.id === businessId);
    setCurrentBusiness(business);
  };

  const addMember = async (email, role) => {
    if (!currentBusiness) return;
    const userToAdd = await getUserByEmail(email);
    if (!userToAdd) {
      // Handle user not found
      return;
    }
    await updateDoc(doc(db, "businesses", currentBusiness.id), {
      members: arrayUnion(userToAdd.uid),
    });
    await setDoc(doc(db, "businesses", currentBusiness.id, "members", userToAdd.uid), {
      role,
      addedAt: new Date(),
    });
  };

  const value = {
    businesses,
    currentBusiness,
    createBusiness,
    switchBusiness,
    addMember,
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  return useContext(BusinessContext);
}
