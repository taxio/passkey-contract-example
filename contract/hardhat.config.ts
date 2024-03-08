import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    polygonMumbai: {
      chainId: 80001,
      url: process.env.MUMBAI_RPC_URL!!,
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
