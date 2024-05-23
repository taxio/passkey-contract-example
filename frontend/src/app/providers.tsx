"use client";

import React from 'react';
import { ThirdwebProvider } from "@thirdweb-dev/react";
import { PolygonAmoyTestnet, Polygon } from "@thirdweb-dev/chains";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThirdwebProvider activeChain={Polygon}>
      {children}
    </ThirdwebProvider>
  )
}
