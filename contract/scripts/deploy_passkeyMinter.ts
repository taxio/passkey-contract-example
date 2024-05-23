import { ethers } from "hardhat";

async function main() {
  const collectionAddress = "0xA6392490B9C274b0f85b31B94E521deDe67071F6";
  const PasskeyMinter = await ethers.getContractFactory("PasskeyMinter");
  const passkeyMinter = await PasskeyMinter.deploy(collectionAddress);
  console.log("deploy tx:", passkeyMinter.deploymentTransaction()?.hash);
  console.log("deploy address:", await passkeyMinter.getAddress());
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
