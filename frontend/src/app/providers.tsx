"use client";

import React from 'react';
import { ThirdwebProvider } from "@thirdweb-dev/react";
import { PolygonAmoyTestnet } from "@thirdweb-dev/chains";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider activeChain={PolygonAmoyTestnet}>
      {children}
    </ThirdwebProvider>
  )
}