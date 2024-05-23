import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    polygonMainnet: {
      chainId: 137,
      url: process.env.POLYGON_RPC_URL!!,
      accounts: [process.env.PRIVATE_KEY!!],
    },
    polygonAmoy: {
      chainId: 80002,
      url: process.env.AMOY_RPC_URL!!,
      accounts: [process.env.PRIVATE_KEY!!],
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 100,
  },
  etherscan: {
    apiKey: process.env.SCAN_API_KEY!!,
  },
};

export default config;
