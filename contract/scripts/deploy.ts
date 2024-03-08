import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Owner:", owner.address);

  const PasskeyAccount = await ethers.getContractFactory("PasskeyAccount");
  const passkeyAccount = await PasskeyAccount.deploy();
  console.log("deploy tx:", passkeyAccount.deploymentTransaction()?.hash);
  console.log("deploy address:", await passkeyAccount.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
