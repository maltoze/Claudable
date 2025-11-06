"use client";
import React, { createContext, useContext, useState } from 'react';

type InsufficientBalanceCtx = {
  show429Modal: boolean;
  setShow429Modal: React.Dispatch<React.SetStateAction<boolean>>;
};

const Ctx = createContext<InsufficientBalanceCtx | null>(null);

export function useInsufficientBalance() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInsufficientBalance must be used within InsufficientBalanceProvider');
  return ctx;
}

export default function InsufficientBalanceProvider({ children }: { children: React.ReactNode }) {
  const [show429Modal, setShow429Modal] = useState(false);

  return (
    <Ctx.Provider value={{ show429Modal, setShow429Modal }}>
      {children}
    </Ctx.Provider>
  );
}
